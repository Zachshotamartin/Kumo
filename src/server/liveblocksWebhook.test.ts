import type { VercelRequest, VercelResponse } from "@vercel/node";
import handler from "../../api/liveblocks-webhook";

const mocks = vi.hoisted(() => ({
  event: {
    type: "storageUpdated",
    data: { roomId: "board:source", updatedAt: new Date().toISOString() },
  },
  syncLinks: vi.fn().mockResolvedValue(undefined),
  updateThumbnail: vi.fn().mockResolvedValue("thumbnail"),
  getDocument: vi.fn().mockResolvedValue({
    nodes: { link: { type: "board", boardId: "target" } },
  }),
  latest: { created_at: new Date().toISOString() } as { created_at: string } | null,
}));

vi.mock("@liveblocks/node", () => ({
  WebhookHandler: class {
    verifyRequest() { return mocks.event; }
  },
}));

vi.mock("../../api/_liveblocks", () => ({
  liveblocksAdmin: () => ({ getStorageDocument: mocks.getDocument }),
}));

vi.mock("../../api/_boardLinks", () => ({ syncBoardLinks: mocks.syncLinks }));
vi.mock("../../api/_boardThumbnail", () => ({ updateBoardThumbnail: mocks.updateThumbnail }));

vi.mock("../../api/_supabase", () => ({
  supabaseAdmin: () => ({
    from: (table: string) => {
      if (table === "boards") {
        return {
          update: () => ({ eq: vi.fn().mockResolvedValue({ error: null }) }),
          select: () => ({
            eq: () => ({
              is: () => ({ maybeSingle: vi.fn().mockResolvedValue({ data: { id: "source" }, error: null }) }),
            }),
          }),
        };
      }
      return {
        select: () => ({
          eq: () => ({
            order: () => ({
              limit: () => ({ maybeSingle: vi.fn().mockResolvedValue({ data: mocks.latest, error: null }) }),
            }),
          }),
        }),
        insert: vi.fn().mockResolvedValue({ error: null }),
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
    mocks.latest = { created_at: new Date().toISOString() };
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
});
