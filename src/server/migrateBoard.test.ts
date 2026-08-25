import type { VercelRequest, VercelResponse } from "@vercel/node";
import migrateBoardHandler from "../../server/api/handlers/migrate-board";

const mocks = vi.hoisted(() => ({
  requireActor: vi.fn(),
  ensureProfile: vi.fn(),
  getAccess: vi.fn(),
  provision: vi.fn(),
  snapshot: { exists: () => true, val: () => ({}) } as { exists: () => boolean; val: () => unknown },
  getUser: vi.fn(),
  upsert: vi.fn(),
  deleteBoard: vi.fn(),
  deleteRoom: vi.fn(),
}));

vi.mock("../../server/api/_auth", () => ({ requireActor: mocks.requireActor }));
vi.mock("../../server/api/_boards", () => ({
  getBoardAccess: mocks.getAccess,
  provisionBoard: mocks.provision,
}));
vi.mock("../../server/api/_firebaseAdmin", () => ({
  privilegedAdminAuth: () => ({ getUser: mocks.getUser }),
  adminDatabase: () => ({ ref: () => ({ get: async () => mocks.snapshot }) }),
}));
vi.mock("../../server/api/_supabase", () => ({
  ensureActorProfile: mocks.ensureProfile,
  supabaseAdmin: () => ({
    from: (table: string) => table === "board_members"
      ? { upsert: mocks.upsert }
      : { delete: () => ({ eq: mocks.deleteBoard }) },
  }),
}));
vi.mock("../../server/api/_liveblocks", () => ({
  liveblocksAdmin: () => ({ deleteRoom: mocks.deleteRoom }),
}));

const response = () => {
  const result = {
    statusCode: 0,
    body: undefined as unknown,
    status(code: number) { this.statusCode = code; return this; },
    json(body: unknown) { this.body = body; return this; },
    setHeader: vi.fn(),
  };
  return result as unknown as VercelResponse & typeof result;
};

const request = (boardId: unknown = "legacy", method = "POST") => ({
  method, body: { boardId }, query: {}, headers: { authorization: "Bearer token" },
} as unknown as VercelRequest);

describe("legacy Firebase board migration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireActor.mockResolvedValue({ uid: "owner", email: "owner@example.com" });
    mocks.ensureProfile.mockResolvedValue({});
    mocks.getAccess.mockResolvedValue(null);
    mocks.getUser.mockResolvedValue({ uid: "member", email: "member@example.com" });
    mocks.provision.mockResolvedValue({ id: "legacy", liveblocks_room_id: "board:legacy" });
    mocks.upsert.mockResolvedValue({ error: null });
    mocks.deleteBoard.mockResolvedValue({ error: null });
    mocks.deleteRoom.mockResolvedValue(undefined);
    mocks.snapshot = { exists: () => true, val: () => ({
      ownerId: "owner",
      title: "Legacy map",
      type: "public",
      backGroundColor: "#123456",
      shapes: [{ id: "shape", type: "rectangle", x1: 0, y1: 0, x2: 10, y2: 10 }],
      members: { member: "viewer" },
      sharedWith: { another: "another" },
    }) };
  });

  it("returns an existing migrated board without copying it again", async () => {
    mocks.getAccess.mockResolvedValueOnce({ role: "owner" });
    const reply = response();
    await migrateBoardHandler(request(), reply);
    expect(reply.body).toEqual({ migrated: false, boardId: "legacy" });
    expect(mocks.provision).not.toHaveBeenCalled();
  });

  it("migrates readable shapes, metadata, and collaborators", async () => {
    const reply = response();
    await migrateBoardHandler(request(), reply);
    expect(reply.statusCode).toBe(201);
    expect(mocks.provision).toHaveBeenCalledWith(expect.objectContaining({
      id: "legacy",
      ownerId: "owner",
      visibility: "public",
      document: expect.objectContaining({
        backgroundColor: "#123456",
        nodes: { shape: expect.objectContaining({ id: "shape" }) },
      }),
    }));
    expect(mocks.upsert).toHaveBeenCalledWith(expect.arrayContaining([
      expect.objectContaining({ user_id: "member", role: "viewer" }),
      expect.objectContaining({ user_id: "another", role: "editor" }),
    ]), { onConflict: "board_id,user_id" });
  });

  it("rejects missing, ownerless, and inaccessible legacy boards", async () => {
    mocks.snapshot = { exists: () => false, val: () => null };
    const missing = response();
    await migrateBoardHandler(request(), missing);
    expect(missing.statusCode).toBe(404);

    mocks.snapshot = { exists: () => true, val: () => ({ title: "Ownerless" }) };
    const ownerless = response();
    await migrateBoardHandler(request(), ownerless);
    expect(ownerless.statusCode).toBe(409);

    mocks.snapshot = { exists: () => true, val: () => ({ ownerId: "other", type: "private" }) };
    const forbidden = response();
    await migrateBoardHandler(request(), forbidden);
    expect(forbidden.statusCode).toBe(403);
  });

  it("validates method, board identity, and authentication failures", async () => {
    const invalidMethod = response();
    await migrateBoardHandler(request("legacy", "GET"), invalidMethod);
    expect(invalidMethod.statusCode).toBe(405);

    for (const boardId of [42, ""]) {
      const missingId = response();
      await migrateBoardHandler(request(boardId), missingId);
      expect(missingId.statusCode).toBe(400);
    }

    mocks.requireActor.mockRejectedValueOnce(new Error("Authentication required."));
    const unauthenticated = response();
    await migrateBoardHandler(request(), unauthenticated);
    expect(unauthenticated.statusCode).toBe(401);

    mocks.requireActor.mockRejectedValueOnce("offline");
    const fallback = response();
    await migrateBoardHandler(request(), fallback);
    expect(fallback.body).toEqual({ error: "This legacy board could not be migrated." });
  });

  it("normalizes alternate legacy schemas and inaccessible profile records", async () => {
    mocks.requireActor.mockResolvedValueOnce({ uid: "reader" });
    mocks.getUser.mockRejectedValue(new Error("deleted Firebase user"));
    mocks.snapshot = { exists: () => true, val: () => ({
      uid: "owner",
      title: 42,
      visibility: "private",
      sharedWith: ["reader", 4, "owner", "reader"],
      shapesById: {
        original: { id: "", type: "rectangle" },
        ignored: null,
      },
    }) };
    const alternate = response();
    await migrateBoardHandler(request(), alternate);
    expect(alternate.statusCode).toBe(201);
    expect(mocks.ensureProfile).toHaveBeenCalledWith({ uid: "owner" });
    expect(mocks.provision).toHaveBeenCalledWith(expect.objectContaining({
      ownerId: "owner",
      title: "Untitled board",
      visibility: "private",
      document: expect.objectContaining({
        backgroundColor: "#252629",
        nodes: { original: expect.objectContaining({ id: "original" }) },
      }),
    }));

    mocks.getUser.mockResolvedValue({ uid: "member" });
    mocks.snapshot = { exists: () => true, val: () => ({
      ownerId: "owner",
      members: { reader: "editor", owner: "viewer", ignored: "admin" },
      sharedWith: 42,
      backgroundColor: "#abcdef",
      shapes: { source: { id: 42, type: "ellipse" } },
    }) };
    const memberAccess = response();
    await migrateBoardHandler(request(), memberAccess);
    expect(memberAccess.statusCode).toBe(201);
    expect(mocks.provision).toHaveBeenLastCalledWith(expect.objectContaining({
      document: expect.objectContaining({
        backgroundColor: "#abcdef",
        nodes: { source: expect.objectContaining({ id: "source" }) },
      }),
    }));
  });

  it("skips collaborator writes when none exist and cleans up failed writes", async () => {
    mocks.snapshot = { exists: () => true, val: () => ({
      ownerId: "owner",
      members: null,
      sharedWith: [],
      visibility: "public",
      shapes: null,
    }) };
    const ownerOnly = response();
    await migrateBoardHandler(request(), ownerOnly);
    expect(ownerOnly.statusCode).toBe(201);
    expect(mocks.upsert).not.toHaveBeenCalled();

    mocks.snapshot = { exists: () => true, val: () => ({
      ownerId: "owner",
      members: { member: "editor" },
      sharedWith: { duplicate: "member", owner: "owner" },
    }) };
    mocks.upsert.mockResolvedValueOnce({ error: new Error("members failed") });
    const failed = response();
    await migrateBoardHandler(request(), failed);
    expect(failed.statusCode).toBe(400);
    expect(mocks.deleteBoard).toHaveBeenCalledWith("id", "legacy");
    expect(mocks.deleteRoom).toHaveBeenCalledWith("board:legacy");
  });
});
