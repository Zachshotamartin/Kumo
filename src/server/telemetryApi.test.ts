import type { VercelRequest, VercelResponse } from "@vercel/node";
import handler from "../../server/api/handlers/telemetry";

const mocks = vi.hoisted(() => ({
  requireActor: vi.fn(), ensureProfile: vi.fn(), getAccess: vi.fn(), insert: vi.fn(),
  branchLookup: vi.fn(),
  enforceRateLimit: vi.fn(),
}));

vi.mock("../../server/api/_auth", () => ({ requireActor: mocks.requireActor }));
vi.mock("../../server/api/_boards", () => ({ getBoardAccess: mocks.getAccess }));
vi.mock("../../server/api/_security", () => ({ enforceRateLimit: mocks.enforceRateLimit }));
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
    mocks.enforceRateLimit.mockResolvedValue(true);
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
    expect(mocks.enforceRateLimit).toHaveBeenCalledWith(expect.anything(), expect.anything(), "telemetry", "actor", 120, 60);
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

  it("records web vitals and API latency with bounded context", async () => {
    const reply = response();
    await handler(request({
      kind: "performance",
      boardId: "board",
      metric: "LCP",
      value: 1234.5,
      rating: "needs-improvement",
      route: `/board?query=${"x".repeat(600)}`,
      release: "release-123",
      metadata: { delta: 12, id: "vital-1" },
    }), reply);

    expect(reply.statusCode).toBe(202);
    expect(mocks.getAccess).toHaveBeenCalledWith("board", "actor");
    expect(mocks.insert).toHaveBeenCalledWith({
      board_id: "board",
      actor_id: "actor",
      release: "release-123",
      route: expect.stringMatching(/^\/board\?query=x{487}$/),
      metric: "LCP",
      value: 1234.5,
      rating: "needs-improvement",
      metadata: { delta: 12, id: "vital-1" },
    });

    const apiLatency = response();
    await handler(request({ kind: "performance", metric: "api_latency", value: 1450, rating: "unexpected" }), apiLatency);
    expect(apiLatency.statusCode).toBe(202);
    expect(mocks.insert).toHaveBeenLastCalledWith(expect.objectContaining({ board_id: null, rating: null, route: "/" }));
  });

  it("records sanitized client errors without requiring a board", async () => {
    const reply = response();
    await handler(request({
      kind: "error",
      message: `boom?openSession=super-secret&mode=view${"boom".repeat(400)}`,
      stack: "stack".repeat(1200),
      route: "/dashboard",
      release: "preview",
    }), reply);

    expect(reply.statusCode).toBe(202);
    expect(mocks.insert).toHaveBeenCalledWith({
      board_id: null,
      actor_id: "actor",
      event_type: "client.error",
      payload: {
        message: expect.stringMatching(/^boom/),
        stack: expect.stringMatching(/^stack/),
        route: "/dashboard",
        release: "preview",
      },
    });
    const payload = mocks.insert.mock.calls.at(0)?.[0].payload as { message: string; stack: string };
    expect(payload.message).toHaveLength(1000);
    expect(payload.message).not.toContain("super-secret");
    expect(payload.stack).toHaveLength(4000);
  });

  it("rejects invalid or inaccessible performance and error telemetry", async () => {
    for (const body of [
      { kind: "performance", metric: "memory", value: 2 },
      { kind: "performance", metric: "LCP", value: -1 },
      { kind: "performance", metric: "LCP", value: "not-a-number" },
    ]) {
      const invalid = response();
      await handler(request(body), invalid);
      expect(invalid.statusCode).toBe(400);
    }

    mocks.getAccess.mockResolvedValueOnce(null);
    const missingPerformance = response();
    await handler(request({ kind: "performance", metric: "INP", value: 200, boardId: "missing" }), missingPerformance);
    expect(missingPerformance.statusCode).toBe(404);

    mocks.getAccess.mockResolvedValueOnce(null);
    const missingError = response();
    await handler(request({ kind: "error", message: "boom", boardId: "missing" }), missingError);
    expect(missingError.statusCode).toBe(404);
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

  it("stops after rate limiting and surfaces every telemetry storage failure", async () => {
    mocks.enforceRateLimit.mockResolvedValueOnce(false);
    const limited = response(); await handler(request({ event: "ready" }), limited);
    expect(mocks.getAccess).not.toHaveBeenCalled();

    mocks.insert.mockResolvedValueOnce({ error: new Error("performance unavailable") });
    const performance = response(); await handler(request({ kind: "performance", metric: "LCP", value: 1 }), performance);
    expect(performance.statusCode).toBe(500);

    mocks.insert.mockResolvedValueOnce({ error: new Error("errors unavailable") });
    const clientError = response(); await handler(request({ kind: "error" }), clientError);
    expect(clientError.statusCode).toBe(500);

    mocks.branchLookup.mockResolvedValueOnce({ data: null, error: new Error("branch unavailable") });
    const branch = response(); await handler(request({ event: "ready", boardId: "board", roomId: "branch:branch" }), branch);
    expect(branch.statusCode).toBe(500);
  });

  it("normalizes optional collaboration and error fields", async () => {
    const error = response(); await handler(request({ kind: "error", message: 42, route: 42, release: 42 }), error);
    expect(mocks.insert).toHaveBeenLastCalledWith(expect.objectContaining({ payload: expect.objectContaining({ message: "Client error", stack: null, route: "/", release: null }) }));
    const collaboration = response(); await handler(request({ event: "lost", boardId: "board", roomId: "board:board", attempts: "bad", durationMs: Infinity }), collaboration);
    expect(mocks.insert).toHaveBeenLastCalledWith(expect.objectContaining({ payload: expect.objectContaining({ attempts: null, durationMs: null, connectionStatus: null, online: null }) }));
    for (const body of [
      { kind: "performance", metric: 42, value: 1 },
      { boardId: "board", roomId: 42, event: "ready" },
      { boardId: "board", roomId: "board:board", event: 42 },
    ]) {
      const invalid = response(); await handler(request(body), invalid);
      expect(invalid.statusCode).toBe(400);
    }
  });
});
