import webPush from "web-push";
import { pushConfigured, sendPreferredPushToUser, sendPushToUser } from "../../server/api/_push";

const mocks = vi.hoisted(() => ({
  subscriptions: [] as Array<Record<string, unknown>>,
  selectError: null as unknown,
  setVapidDetails: vi.fn(),
  sendNotification: vi.fn(),
  selectEq: vi.fn(),
  updateEq: vi.fn(),
  deleteEq: vi.fn(),
  operations: [] as Array<{ operation: string; value: unknown }>,
  preferences: null as null | Record<string, unknown>,
  preferenceError: null as unknown,
}));

vi.mock("web-push", () => ({
  default: { setVapidDetails: mocks.setVapidDetails, sendNotification: mocks.sendNotification },
}));

vi.mock("../../server/api/_supabase", () => ({
  supabaseAdmin: () => ({
    from: (table: string) => ({
      select: () => table === "notification_preferences"
        ? { eq: () => ({ maybeSingle: () => Promise.resolve({ data: mocks.preferences, error: mocks.preferenceError }) }) }
        : { eq: mocks.selectEq },
      update: (value: unknown) => {
        mocks.operations.push({ operation: "update", value });
        return { eq: mocks.updateEq };
      },
      delete: () => {
        mocks.operations.push({ operation: "delete", value: null });
        return { eq: mocks.deleteEq };
      },
    }),
  }),
}));

describe("web push delivery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.operations.length = 0;
    mocks.subscriptions = [];
    mocks.preferences = null;
    mocks.preferenceError = null;
    mocks.selectError = null;
    mocks.selectEq.mockImplementation(() => Promise.resolve({ data: mocks.subscriptions, error: mocks.selectError }));
    mocks.updateEq.mockResolvedValue({ error: null });
    mocks.deleteEq.mockResolvedValue({ error: null });
    process.env.VAPID_PUBLIC_KEY = "public-key";
    process.env.VAPID_PRIVATE_KEY = "private-key";
    process.env.VAPID_SUBJECT = "mailto:push@kumo.test";
  });

  afterEach(() => {
    delete process.env.VAPID_PUBLIC_KEY;
    delete process.env.VAPID_PRIVATE_KEY;
    delete process.env.VAPID_SUBJECT;
  });

  it("validates configuration before querying subscriptions", async () => {
    expect(pushConfigured()).toBe(true);
    delete process.env.VAPID_PRIVATE_KEY;
    expect(pushConfigured()).toBe(false);
    await expect(sendPushToUser("user", { title: "Kumo", body: "Ready" })).rejects.toThrow("incomplete");
    expect(mocks.selectEq).not.toHaveBeenCalled();

    process.env.VAPID_PRIVATE_KEY = "private-key";
    process.env.VAPID_SUBJECT = "not-an-origin";
    await expect(sendPushToUser("user", { title: "Kumo", body: "Ready" })).rejects.toThrow("VAPID_SUBJECT");
  });

  it("delivers to every active subscription and resets failure state", async () => {
    mocks.subscriptions = [
      { id: "one", endpoint: "https://push.test/one", p256dh: "p1", auth: "a1", failure_count: 2 },
      { id: "two", endpoint: "https://push.test/two", p256dh: "p2", auth: "a2", failure_count: 0 },
    ];
    mocks.sendNotification.mockResolvedValue({ statusCode: 201 });
    const result = await sendPushToUser("user", { title: "Mention", body: "Ada mentioned you", url: "/?board=board", tag: "mention" });
    expect(result).toEqual({ delivered: 2, subscriptions: 2 });
    expect(webPush.setVapidDetails).toHaveBeenCalledWith("mailto:push@kumo.test", "public-key", "private-key");
    expect(mocks.selectEq).toHaveBeenCalledWith("user_id", "user");
    expect(mocks.sendNotification).toHaveBeenCalledWith(
      { endpoint: "https://push.test/one", keys: { p256dh: "p1", auth: "a1" } },
      JSON.stringify({ title: "Mention", body: "Ada mentioned you", url: "/?board=board", tag: "mention" }),
      { TTL: 3600, urgency: "normal" },
    );
    expect(mocks.operations.filter((operation) => operation.operation === "update")).toHaveLength(2);
    expect(mocks.operations[0]?.value).toEqual(expect.objectContaining({ failure_count: 0, last_success_at: expect.any(String), updated_at: expect.any(String) }));
  });

  it("removes expired endpoints and increments recoverable failures", async () => {
    mocks.subscriptions = [
      { id: "gone", endpoint: "https://push.test/gone", p256dh: "p", auth: "a", failure_count: 4 },
      { id: "retry", endpoint: "https://push.test/retry", p256dh: "p", auth: "a", failure_count: 1 },
    ];
    mocks.sendNotification
      .mockRejectedValueOnce(Object.assign(new Error("expired"), { statusCode: 410 }))
      .mockRejectedValueOnce(new Error("gateway unavailable"));
    expect(await sendPushToUser("user", { title: "Update", body: "Board changed" })).toEqual({ delivered: 0, subscriptions: 2 });
    expect(mocks.operations).toEqual(expect.arrayContaining([
      { operation: "delete", value: null },
      { operation: "update", value: expect.objectContaining({ failure_count: 2 }) },
    ]));
    expect(mocks.deleteEq).toHaveBeenCalledWith("id", "gone");
    expect(mocks.updateEq).toHaveBeenCalledWith("id", "retry");
  });

  it("surfaces subscription query failures without attempting delivery", async () => {
    mocks.selectError = new Error("database unavailable");
    await expect(sendPushToUser("user", { title: "Update", body: "Board changed" })).rejects.toThrow("database unavailable");
    expect(mocks.sendNotification).not.toHaveBeenCalled();
  });

  it("handles empty query data and failures without structured status metadata", async () => {
    mocks.selectEq.mockResolvedValueOnce({ data: null, error: null });
    await expect(sendPushToUser("user", { title: "Empty", body: "No endpoints" }))
      .resolves.toEqual({ delivered: 0, subscriptions: 0 });

    mocks.subscriptions = [{ id: "retry", endpoint: "https://push.test/retry", p256dh: "p", auth: "a" }];
    mocks.sendNotification.mockRejectedValueOnce("offline");
    await sendPushToUser("user", { title: "Retry", body: "Later" });
    expect(mocks.operations).toContainEqual({ operation: "update", value: expect.objectContaining({ failure_count: 1 }) });
  });

  it("delivers event push only when browser and category preferences allow it", async () => {
    mocks.subscriptions = [{ id: "one", endpoint: "https://push.test/one", p256dh: "p", auth: "a", failure_count: 0 }];
    mocks.sendNotification.mockResolvedValue({ statusCode: 201 });
    await expect(sendPreferredPushToUser("user", "branch_reviews", { title: "Review", body: "Requested" }))
      .resolves.toEqual({ delivered: 0, subscriptions: 0, skipped: true });
    mocks.preferences = { browser_enabled: true, branch_reviews: false };
    await expect(sendPreferredPushToUser("user", "branch_reviews", { title: "Review", body: "Requested" }))
      .resolves.toEqual({ delivered: 0, subscriptions: 0, skipped: true });
    mocks.preferences = { browser_enabled: true, branch_reviews: true };
    await expect(sendPreferredPushToUser("user", "branch_reviews", { title: "Review", body: "Requested" }))
      .resolves.toEqual({ delivered: 1, subscriptions: 1, skipped: false });
  });

  it("skips preferred push without configuration and surfaces preference query errors", async () => {
    delete process.env.VAPID_PRIVATE_KEY;
    await expect(sendPreferredPushToUser("user", "access_changes", { title: "Access", body: "Changed" }))
      .resolves.toEqual({ delivered: 0, subscriptions: 0, skipped: true });
    process.env.VAPID_PRIVATE_KEY = "private-key";
    mocks.preferenceError = new Error("preferences unavailable");
    await expect(sendPreferredPushToUser("user", "access_changes", { title: "Access", body: "Changed" }))
      .rejects.toThrow("preferences unavailable");
  });
});
