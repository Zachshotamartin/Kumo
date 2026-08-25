import type { VercelRequest, VercelResponse } from "@vercel/node";
import handler from "../../api/liveblocks-webhook";

const mocks = vi.hoisted(() => ({
  event: {
    type: "storageUpdated" as string,
    data: { roomId: "board:source", updatedAt: new Date().toISOString() },
  },
  verifyError: null as unknown,
  syncLinks: vi.fn().mockResolvedValue(undefined),
  updateThumbnail: vi.fn().mockResolvedValue("thumbnail"),
  getDocument: vi.fn().mockResolvedValue({
    nodes: { link: { type: "board", boardId: "target" } },
  }),
  latest: { created_at: new Date().toISOString() } as { created_at: string } | null,
  board: { data: { id: "source" } as { id: string } | null, error: null as unknown },
  latestError: null as unknown,
  insertError: null as unknown,
}));

vi.mock("@liveblocks/node", () => ({
  WebhookHandler: class {
    verifyRequest() {
      if (mocks.verifyError) throw mocks.verifyError;
      return mocks.event;
    }
  },
}));

vi.mock("../../server/api/_liveblocks", () => ({
  liveblocksAdmin: () => ({ getStorageDocument: mocks.getDocument }),
}));

vi.mock("../../server/api/_boardLinks", () => ({ syncBoardLinks: mocks.syncLinks }));
vi.mock("../../server/api/_boardThumbnail", () => ({ updateBoardThumbnail: mocks.updateThumbnail }));

vi.mock("../../server/api/_supabase", () => ({
  supabaseAdmin: () => ({
    from: (table: string) => {
      if (table === "boards") {
        return {
          update: () => ({ eq: vi.fn().mockResolvedValue({ error: null }) }),
          select: () => ({
            eq: () => ({
              is: () => ({ maybeSingle: vi.fn().mockImplementation(async () => mocks.board) }),
            }),
          }),
        };
      }
      return {
        select: () => ({
          eq: () => ({
            order: () => ({
              limit: () => ({ maybeSingle: vi.fn().mockResolvedValue({ data: mocks.latest, error: mocks.latestError }) }),
            }),
          }),
        }),
        insert: vi.fn().mockImplementation(async () => ({ error: mocks.insertError })),
      };
    },
  }),
}));

const response = () => {
  const result = {
    statusCode: 0,
    body: undefined as unknown,
    setHeader: vi.fn(),
    status(code: number) { this.statusCode = code; return this; },
    json(body: unknown) { this.body = body; return this; },
  };
  return result as unknown as VercelResponse & typeof result;
};

describe("Liveblocks webhook", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.event.type = "storageUpdated";
    mocks.verifyError = null;
    mocks.latest = { created_at: new Date().toISOString() };
    mocks.board = { data: { id: "source" }, error: null };
    mocks.latestError = null;
    mocks.insertError = null;
    process.env.LIVEBLOCKS_WEBHOOK_SECRET = "whsec_test";
  });

  it("synchronizes board links even while snapshots are throttled", async () => {
    const reply = response();
    await handler({
      method: "POST",
      headers: {},
      body: "signed-body",
    } as unknown as VercelRequest, reply);
    expect(mocks.getDocument).toHaveBeenCalledWith("board:source", "json");
    expect(mocks.syncLinks).toHaveBeenCalledWith("source", {
      nodes: { link: { type: "board", boardId: "target" } },
    });
    expect(mocks.updateThumbnail).toHaveBeenCalledWith(
      expect.objectContaining({ id: "source" }),
      { nodes: { link: { type: "board", boardId: "target" } } }
    );
    expect(reply.statusCode).toBe(200);
  });

  it("returns a server error rather than mislabeling persistence failures", async () => {
    mocks.syncLinks.mockRejectedValueOnce(new Error("database unavailable"));
    const reply = response();
    await handler({ method: "POST", headers: {}, body: "signed-body" } as unknown as VercelRequest, reply);
    expect(reply.statusCode).toBe(500);
  });

  it("reads streamed raw bodies and accepts unrelated webhook events", async () => {
    mocks.event.type = "roomCreated";
    const reply = response();
    const streamed = {
      method: "POST",
      headers: {},
      body: undefined,
      async *[Symbol.asyncIterator]() {
        yield Buffer.from("signed-");
        yield "body";
      },
    } as unknown as VercelRequest;
    await handler(streamed, reply);
    expect(reply.statusCode).toBe(200);
    expect(reply.body).toEqual({ accepted: true });
    expect(mocks.getDocument).not.toHaveBeenCalled();
  });

  it("rejects missing secrets, verification failures, and unsupported methods", async () => {
    delete process.env.LIVEBLOCKS_WEBHOOK_SECRET;
    const missing = response();
    await handler({ method: "POST", headers: {}, body: "body" } as unknown as VercelRequest, missing);
    expect(missing.statusCode).toBe(400);

    process.env.LIVEBLOCKS_WEBHOOK_SECRET = "whsec_test";
    mocks.verifyError = new Error("bad signature");
    const invalid = response();
    await handler({ method: "POST", headers: {}, body: "body" } as unknown as VercelRequest, invalid);
    expect(invalid.statusCode).toBe(400);

    const method = response();
    await handler({ method: "GET", headers: {}, body: "" } as unknown as VercelRequest, method);
    expect(method.statusCode).toBe(405);
  });

  it("accepts deleted boards and creates checksummed snapshots after the throttle window", async () => {
    mocks.board.data = null;
    const missing = response();
    await handler({ method: "POST", headers: {}, body: "body" } as unknown as VercelRequest, missing);
    expect(missing.statusCode).toBe(200);

    mocks.board.data = { id: "source" };
    mocks.latest = null;
    const created = response();
    await handler({ method: "POST", headers: {}, body: "body" } as unknown as VercelRequest, created);
    expect(created.statusCode).toBe(200);
  });

  it.each([
    ["board lookup", () => { mocks.board.error = new Error("boards offline"); }],
    ["snapshot lookup", () => { mocks.latestError = new Error("snapshots offline"); }],
    ["snapshot insert", () => { mocks.latest = null; mocks.insertError = new Error("insert offline"); }],
  ])("maps a %s failure to a processing error", async (_name, arrange) => {
    arrange();
    const reply = response();
    await handler({ method: "POST", headers: {}, body: "body" } as unknown as VercelRequest, reply);
    expect(reply.statusCode).toBe(500);
  });
});
