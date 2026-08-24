import type { VercelRequest, VercelResponse } from "@vercel/node";
import handler from "../../server/api/handlers/telemetry";

const mocks = vi.hoisted(() => ({
  requireActor: vi.fn(), ensureProfile: vi.fn(), getAccess: vi.fn(), insert: vi.fn(),
  branchLookup: vi.fn(),
}));

vi.mock("../../server/api/_auth", () => ({ requireActor: mocks.requireActor }));
vi.mock("../../server/api/_boards", () => ({ getBoardAccess: mocks.getAccess }));
vi.mock("../../server/api/_supabase", () => ({
  ensureActorProfile: mocks.ensureProfile,
  supabaseAdmin: () => ({
    from: (table: string) => table === "document_branches"
      ? {
          select: () => ({
            eq: () => ({
              eq: () => ({ maybeSingle: mocks.branchLookup }),
            }),
          }),
        }
      : { insert: mocks.insert },
  }),
}));

const request = (body: Record<string, unknown>, method = "POST") => ({
  method, body, headers: { authorization: "Bearer token" },
} as unknown as VercelRequest);
const response = () => {
  const result = {
    statusCode: 0, body: undefined as unknown, setHeader: vi.fn(),
    status(code: number) { this.statusCode = code; return this; },
    json(body: unknown) { this.body = body; return this; },
  };
  return result as unknown as VercelResponse & typeof result;
};

describe("collaboration telemetry API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireActor.mockResolvedValue({ uid: "actor" });
    mocks.ensureProfile.mockResolvedValue({ uid: "actor" });
    mocks.getAccess.mockResolvedValue({ role: "owner", board: { liveblocks_room_id: "board:board" } });
    mocks.branchLookup.mockResolvedValue({ data: { board_id: "board" }, error: null });
    mocks.insert.mockResolvedValue({ error: null });
  });

  it("accepts only branch rooms that belong to the reported board", async () => {
    const accepted = response();
    await handler(request({ event: "ready", boardId: "board", roomId: "branch:branch" }), accepted);
    expect(accepted.statusCode).toBe(202);
    expect(mocks.branchLookup).toHaveBeenCalledOnce();

    mocks.branchLookup.mockResolvedValueOnce({ data: null, error: null });
    const wrongBoard = response();
    await handler(request({ event: "ready", boardId: "board", roomId: "branch:another-board" }), wrongBoard);
    expect(wrongBoard.statusCode).toBe(404);
    expect(mocks.insert).toHaveBeenCalledTimes(1);
  });

  it("stores sanitized board-scoped resilience telemetry", async () => {
    const reply = response();
    await handler(request({
      event: "restored", boardId: "board", roomId: "board:board",
      attempts: 1.7, durationMs: -20, connectionStatus: "connected", online: true,
    }), reply);
    expect(reply.statusCode).toBe(202);
    expect(mocks.insert).toHaveBeenCalledWith({
      board_id: "board",
      actor_id: "actor",
      event_type: "collaboration.connection_restored",
      payload: {
        roomId: "board:board", attempts: 2, durationMs: 0,
        connectionStatus: "connected", online: true,
      },
    });
  });

  it("rejects malformed, inaccessible, and unauthenticated telemetry", async () => {
    const malformed = response();
    await handler(request({ event: "unknown", boardId: "board", roomId: "board:board" }), malformed);
    expect(malformed.statusCode).toBe(400);

    mocks.getAccess.mockResolvedValueOnce(null);
    const missing = response();
    await handler(request({ event: "lost", boardId: "board", roomId: "board:board" }), missing);
    expect(missing.statusCode).toBe(404);

    mocks.requireActor.mockRejectedValueOnce(new Error("Authentication required."));
    const unauthenticated = response();
    await handler(request({ event: "lost", boardId: "board", roomId: "board:board" }), unauthenticated);
    expect(unauthenticated.statusCode).toBe(401);
  });

  it("enforces POST and surfaces persistence failures", async () => {
    const method = response();
    await handler(request({}, "GET"), method);
    expect(method.statusCode).toBe(405);

    mocks.insert.mockResolvedValueOnce({ error: new Error("database unavailable") });
    const failed = response();
    await handler(request({ event: "failed", boardId: "board", roomId: "branch:branch" }), failed);
    expect(failed.statusCode).toBe(500);
    expect(failed.body).toEqual({ error: "database unavailable" });
  });
});
