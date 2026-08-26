import type { VercelRequest, VercelResponse } from "@vercel/node";
import handler from "../../api/liveblocks-webhook";

const mocks = vi.hoisted(() => ({
  event: {
    type: "storageUpdated" as string,
    data: { roomId: "board:source", updatedAt: new Date().toISOString() } as Record<string, unknown>,
  } as { type: string; data: Record<string, unknown> },
  verifyError: null as unknown,
  syncLinks: vi.fn().mockResolvedValue(undefined),
  updateThumbnail: vi.fn().mockResolvedValue("thumbnail"),
  getDocument: vi.fn().mockResolvedValue({
    nodes: { link: { type: "board", boardId: "target" } },
  }),
  latest: { created_at: new Date().toISOString() } as { created_at: string } | null,
  board: { data: { id: "source" } as { id: string; title?: string } | null, error: null as unknown },
  latestError: null as unknown,
  insertError: null as unknown,
  mute: null as Record<string, unknown> | null,
  muteError: null as unknown,
  preferences: null as Record<string, unknown> | null,
  preferenceError: null as unknown,
  notificationInsertError: null as unknown,
  sendCommentPush: vi.fn(),
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
vi.mock("../../server/api/_push", () => ({ sendCommentPushToUser: mocks.sendCommentPush }));

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
      if (table === "board_notification_mutes") return {
        select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: mocks.mute, error: mocks.muteError }) }) }) }),
      };
      if (table === "notification_preferences") return {
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: mocks.preferences, error: mocks.preferenceError }) }) }),
      };
      if (table === "account_notifications") return {
        upsert: vi.fn().mockImplementation(async () => ({ error: mocks.notificationInsertError })),
      };
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
    mocks.event.data = { roomId: "board:source", updatedAt: new Date().toISOString() };
    mocks.verifyError = null;
    mocks.latest = { created_at: new Date().toISOString() };
    mocks.board = { data: { id: "source" }, error: null };
    mocks.latestError = null;
    mocks.insertError = null;
    mocks.mute = null;
    mocks.muteError = null;
    mocks.preferences = null;
    mocks.preferenceError = null;
    mocks.notificationInsertError = null;
    mocks.sendCommentPush.mockResolvedValue({ delivered: 1 });
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

  it.each([
    ["thread", false, "New reply in Board"],
    ["textMention", true, "You were mentioned in Board"],
  ])("persists and delivers %s notifications", async (kind, mention, title) => {
    mocks.event = { type: "notification", data: {
      kind, roomId: "board:source", userId: "recipient", inboxNotificationId: `inbox:${kind}`,
      triggeredAt: "2026-08-25T12:00:00Z",
    } };
    mocks.board.data = { id: "source", title: "Board" };
    const reply = response();
    await handler({ method: "POST", headers: {}, body: "signed-body" } as unknown as VercelRequest, reply);
    expect(reply.statusCode).toBe(200);
    expect(mocks.sendCommentPush).toHaveBeenCalledWith("recipient", mention, expect.objectContaining({ title, url: "/?board=source" }));
  });

  it("honors deleted boards, board mutes, disabled comments, and mention-only preferences", async () => {
    mocks.event = { type: "notification", data: {
      kind: "thread", roomId: "board:source", userId: "recipient", inboxNotificationId: "inbox",
      triggeredAt: "2026-08-25T12:00:00Z",
    } };
    mocks.board.data = null;
    await handler({ method: "POST", headers: {}, body: "body" } as VercelRequest, response());
    expect(mocks.sendCommentPush).not.toHaveBeenCalled();

    mocks.board.data = { id: "source", title: "Board" };
    mocks.mute = { board_id: "source" };
    await handler({ method: "POST", headers: {}, body: "body" } as VercelRequest, response());
    expect(mocks.sendCommentPush).not.toHaveBeenCalled();

    mocks.mute = null;
    mocks.preferences = { board_comments: "off" };
    await handler({ method: "POST", headers: {}, body: "body" } as VercelRequest, response());
    expect(mocks.sendCommentPush).not.toHaveBeenCalled();

    mocks.preferences = { board_comments: "mentions" };
    await handler({ method: "POST", headers: {}, body: "body" } as VercelRequest, response());
    expect(mocks.sendCommentPush).not.toHaveBeenCalled();

    mocks.event.data.kind = "textMention";
    await handler({ method: "POST", headers: {}, body: "body" } as VercelRequest, response());
    expect(mocks.sendCommentPush).toHaveBeenCalledTimes(1);

    mocks.event.data.kind = "roomCreated";
    await handler({ method: "POST", headers: {}, body: "body" } as VercelRequest, response());
    expect(mocks.sendCommentPush).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["board lookup", () => { mocks.board.error = new Error("board failed"); }],
    ["mute lookup", () => { mocks.muteError = new Error("mute failed"); }],
    ["preference lookup", () => { mocks.preferenceError = new Error("preference failed"); }],
    ["notification insert", () => { mocks.notificationInsertError = new Error("insert failed"); }],
    ["push delivery", () => { mocks.sendCommentPush.mockRejectedValueOnce(new Error("push failed")); }],
  ])("maps a comment %s failure to a processing error", async (_label, arrange) => {
    mocks.event = { type: "notification", data: {
      kind: "textMention", roomId: "board:source", userId: "recipient", inboxNotificationId: "inbox",
      triggeredAt: "2026-08-25T12:00:00Z",
    } };
    mocks.board = { data: { id: "source", title: "Board" }, error: null };
    arrange();
    const reply = response();
    await handler({ method: "POST", headers: {}, body: "body" } as VercelRequest, reply);
    expect(reply.statusCode).toBe(500);
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

    mocks.latest = { created_at: new Date(0).toISOString() };
    const old = response();
    await handler({ method: "POST", headers: {}, body: "body" } as unknown as VercelRequest, old);
    expect(old.statusCode).toBe(200);
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
