import type { VercelRequest, VercelResponse } from "@vercel/node";
import liveblocksAuthHandler from "../../api/liveblocks-auth";
import sessionHandler from "../../api/session";
import shareBoardHandler from "../../api/share-board";

const mocks = vi.hoisted(() => ({
  actor: { uid: "owner", email: "owner@example.com" },
  requireActor: vi.fn(),
  ensureProfile: vi.fn(),
  getAccess: vi.fn(),
  invitedProfile: { firebase_uid: "member", email: "member@example.com" } as null | {
    firebase_uid: string;
    email: string;
  },
  allow: vi.fn(),
  authorize: vi.fn(),
  from: vi.fn(),
}));

vi.mock("../../api/_auth", () => ({ requireActor: mocks.requireActor }));
vi.mock("../../api/_supabase", () => ({
  ensureActorProfile: mocks.ensureProfile,
  supabaseAdmin: () => ({ from: mocks.from }),
}));
vi.mock("../../api/_boards", () => ({ getBoardAccess: mocks.getAccess }));
vi.mock("../../api/_liveblocks", () => ({
  liveblocksAdmin: () => ({
    prepareSession: () => ({ allow: mocks.allow, authorize: mocks.authorize }),
  }),
}));

const response = () => {
  const result = {
    statusCode: 0,
    body: undefined as unknown,
    headers: {} as Record<string, string>,
    status(code: number) { this.statusCode = code; return this; },
    json(body: unknown) { this.body = body; return this; },
    send(body: unknown) { this.body = body; return this; },
    setHeader(name: string, value: string) { this.headers[name] = value; return this; },
  };
  return result as unknown as VercelResponse & typeof result;
};

const request = (body: Record<string, unknown>, method = "POST") => ({
  method, body, query: {}, headers: { authorization: "Bearer token" },
} as unknown as VercelRequest);

const board = {
  id: "board", liveblocks_room_id: "board:board", owner_id: "owner",
  title: "Board", visibility: "private", updated_at: new Date().toISOString(),
};

describe("sharing, session, and Liveblocks API handlers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireActor.mockResolvedValue(mocks.actor);
    mocks.ensureProfile.mockImplementation(async (actor: { uid: string; email?: string }) => ({
      uid: actor.uid, email: actor.email ?? "local@example.com", displayName: "Kumo user", avatarUrl: null,
    }));
    mocks.getAccess.mockResolvedValue({ board, role: "owner" });
    mocks.invitedProfile = { firebase_uid: "member", email: "member@example.com" };
    mocks.authorize.mockResolvedValue({ status: 200, body: "authorized" });
    mocks.from.mockImplementation((table: string) => {
      if (table === "profiles") {
        return {
          select: () => ({
            ilike: () => ({
              maybeSingle: vi.fn().mockImplementation(async () => ({
                data: mocks.invitedProfile,
                error: null,
              })),
            }),
          }),
        };
      }
      if (table === "board_members") {
        return {
          upsert: vi.fn().mockResolvedValue({ error: null }),
          delete: () => ({ eq: () => ({ eq: () => ({ neq: vi.fn().mockResolvedValue({ error: null }) }) }) }),
        };
      }
      if (table === "document_branches") {
        return {
          select: () => ({ eq: () => ({ maybeSingle: vi.fn().mockResolvedValue({ data: { board_id: "board", status: "open" }, error: null }) }) }),
        };
      }
      return { insert: vi.fn().mockResolvedValue({ error: null }) };
    });
  });

  it("invites and removes board collaborators", async () => {
    const invited = response();
    await shareBoardHandler(request({
      boardId: "board", action: "invite", email: " MEMBER@example.com ", role: "viewer",
    }), invited);
    expect(invited.body).toEqual({ uid: "member", email: "member@example.com", role: "viewer" });

    const removed = response();
    await shareBoardHandler(request({ boardId: "board", action: "remove", memberUid: "member" }), removed);
    expect(removed.body).toEqual({ uid: "member" });
  });

  it("validates sharing input and ownership", async () => {
    const incomplete = response();
    await shareBoardHandler(request({}), incomplete);
    expect(incomplete.statusCode).toBe(400);
    mocks.getAccess.mockResolvedValueOnce({ board, role: "editor" });
    const forbidden = response();
    await shareBoardHandler(request({ boardId: "board", action: "invite", email: "a@b.com" }), forbidden);
    expect(forbidden.statusCode).toBe(403);
    const invalid = response();
    await shareBoardHandler(request({ boardId: "board", action: "invite", email: "invalid" }), invalid);
    expect(invalid.statusCode).toBe(400);
    mocks.invitedProfile = null;
    const missing = response();
    await shareBoardHandler(request({ boardId: "board", action: "invite", email: "none@example.com" }), missing);
    expect(missing.body).toEqual({ error: "No Kumo account uses that email." });
  });

  it("initializes the authenticated Supabase profile", async () => {
    const reply = response();
    await sessionHandler(request({}), reply);
    expect(reply.statusCode).toBe(200);
    expect(reply.body).toMatchObject({ profile: { uid: "owner" } });
    mocks.requireActor.mockRejectedValueOnce(new Error("Authentication required."));
    const denied = response();
    await sessionHandler(request({}), denied);
    expect(denied.statusCode).toBe(401);
  });

  it("authorizes editor and viewer Liveblocks sessions", async () => {
    const editor = response();
    await liveblocksAuthHandler(request({ room: "board:board" }), editor);
    expect(mocks.allow).toHaveBeenCalledWith("board:board", ["*:write"]);
    expect(editor.body).toBe("authorized");

    mocks.getAccess.mockResolvedValueOnce({ board, role: "viewer" });
    const viewer = response();
    await liveblocksAuthHandler(request({ room: "board:board" }), viewer);
    expect(mocks.allow).toHaveBeenLastCalledWith("board:board", ["*:read", "room:presence:write", "comments:write"]);
    const invalid = response();
    await liveblocksAuthHandler(request({ room: "invalid" }), invalid);
    expect(invalid.statusCode).toBe(400);
  });

  it("authorizes an open isolated design branch through its parent board", async () => {
    const reply = response();
    await liveblocksAuthHandler(request({ room: "branch:branch-id" }), reply);
    expect(mocks.getAccess).toHaveBeenCalledWith("board", "owner");
    expect(mocks.allow).toHaveBeenCalledWith("branch:branch-id", ["*:write"]);
    expect(reply.statusCode).toBe(200);
  });
});
