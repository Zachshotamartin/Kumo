import webPush from "web-push";
import { pushConfigured, sendCommentPushToUser, sendDueNotificationDigests, sendPreferredPushToUser, sendPushToUser } from "../../server/api/_push";

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
  digestPreferences: [] as Array<Record<string, unknown>> | null,
  digestPreferenceError: null as unknown,
  digestNotifications: [] as Array<Array<Record<string, unknown>> | null>,
  digestNotificationErrors: [] as unknown[],
  digestMutes: [] as Array<Array<Record<string, unknown>> | null>,
  digestMuteErrors: [] as unknown[],
  preferenceUpdateError: null as unknown,
}));

vi.mock("web-push", () => ({
  default: { setVapidDetails: mocks.setVapidDetails, sendNotification: mocks.sendNotification },
}));

vi.mock("../../server/api/_supabase", () => ({
  supabaseAdmin: () => ({
    from: (table: string) => ({
      select: () => table === "notification_preferences"
        ? { eq: () => ({
          maybeSingle: () => Promise.resolve({ data: mocks.preferences, error: mocks.preferenceError }),
          in: () => Promise.resolve({ data: mocks.digestPreferences, error: mocks.digestPreferenceError }),
        }) }
        : table === "account_notifications"
          ? { eq: () => ({ is: () => ({ gt: () => ({ order: () => ({ limit: () => Promise.resolve({
            data: mocks.digestNotifications.length ? mocks.digestNotifications.shift() : [], error: mocks.digestNotificationErrors.shift() ?? null,
          }) }) }) }) }) }
          : table === "board_notification_mutes"
            ? { eq: () => Promise.resolve({ data: mocks.digestMutes.length ? mocks.digestMutes.shift() : [], error: mocks.digestMuteErrors.shift() ?? null }) }
          : { eq: mocks.selectEq },
      update: (value: unknown) => {
        mocks.operations.push({ operation: "update", value });
        return { eq: table === "notification_preferences"
          ? () => Promise.resolve({ error: mocks.preferenceUpdateError })
          : mocks.updateEq };
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
    mocks.digestPreferences = [];
    mocks.digestPreferenceError = null;
    mocks.digestNotifications = [];
    mocks.digestNotificationErrors = [];
    mocks.digestMutes = [];
    mocks.digestMuteErrors = [];
    mocks.preferenceUpdateError = null;
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

  it("queues preferred events for supported digests and skips unsupported schedules", async () => {
    mocks.preferences = { browser_enabled: true, branch_reviews: true, digest: "daily" };
    await expect(sendPreferredPushToUser("user", "branch_reviews", { title: "Review", body: "Requested" }))
      .resolves.toEqual({ delivered: 0, subscriptions: 0, skipped: true, queued: true });
    mocks.preferences.digest = "monthly";
    await expect(sendPreferredPushToUser("user", "branch_reviews", { title: "Review", body: "Requested" }))
      .resolves.toEqual({ delivered: 0, subscriptions: 0, skipped: true, queued: false });
  });

  it("applies all, mention-only, disabled, and digest comment preferences", async () => {
    delete process.env.VAPID_PUBLIC_KEY;
    await expect(sendCommentPushToUser("user", true, { title: "Mention", body: "Open" }))
      .resolves.toEqual({ delivered: 0, subscriptions: 0, skipped: true });
    process.env.VAPID_PUBLIC_KEY = "public-key";

    mocks.preferenceError = new Error("comments unavailable");
    await expect(sendCommentPushToUser("user", true, { title: "Mention", body: "Open" })).rejects.toThrow("comments unavailable");
    mocks.preferenceError = null;

    for (const preferences of [
      null,
      { browser_enabled: false, board_comments: "all" },
      { browser_enabled: true, board_comments: "off" },
      { browser_enabled: true, board_comments: "mentions" },
    ]) {
      mocks.preferences = preferences;
      await expect(sendCommentPushToUser("user", false, { title: "Reply", body: "Open" }))
        .resolves.toEqual({ delivered: 0, subscriptions: 0, skipped: true });
    }

    mocks.subscriptions = [{ id: "one", endpoint: "https://push.test/one", p256dh: "p", auth: "a", failure_count: 0 }];
    mocks.sendNotification.mockResolvedValue({ statusCode: 201 });
    mocks.preferences = { browser_enabled: true, board_comments: "all", digest: "instant" };
    await expect(sendCommentPushToUser("user", false, { title: "Reply", body: "Open" }))
      .resolves.toEqual({ delivered: 1, subscriptions: 1, skipped: false });
    mocks.preferences = { browser_enabled: true, board_comments: "mentions", digest: "instant" };
    await expect(sendCommentPushToUser("user", true, { title: "Mention", body: "Open" }))
      .resolves.toEqual({ delivered: 1, subscriptions: 1, skipped: false });

    mocks.preferences = { browser_enabled: true, board_comments: "all", digest: "weekly" };
    await expect(sendCommentPushToUser("user", false, { title: "Reply", body: "Open" }))
      .resolves.toEqual({ delivered: 0, subscriptions: 0, skipped: true, queued: true });
    mocks.preferences.digest = "monthly";
    await expect(sendCommentPushToUser("user", false, { title: "Reply", body: "Open" }))
      .resolves.toEqual({ delivered: 0, subscriptions: 0, skipped: true, queued: false });
  });

  it("delivers due daily and weekly notification digests and advances each schedule", async () => {
    const now = new Date("2026-08-25T12:00:00Z");
    mocks.digestPreferences = [
      { user_id: "daily", digest: "daily", last_digest_at: null },
      { user_id: "weekly", digest: "weekly", last_digest_at: "2026-08-01T00:00:00Z" },
      { user_id: "recent", digest: "daily", last_digest_at: "2026-08-25T11:00:00Z" },
    ];
    mocks.digestNotifications = [[{ id: "one", title: "One update" }], [{ id: "one", title: "First" }, { id: "two", title: "Second" }]];
    mocks.subscriptions = [{ id: "push", endpoint: "https://push.test", p256dh: "p", auth: "a", failure_count: 0 }];
    mocks.sendNotification.mockResolvedValue({ statusCode: 201 });
    await expect(sendDueNotificationDigests(now)).resolves.toEqual({ users: 2, delivered: 2 });
    expect(mocks.sendNotification).toHaveBeenCalledWith(expect.any(Object), expect.stringContaining("1 Kumo update"), expect.any(Object));
    expect(mocks.sendNotification).toHaveBeenCalledWith(expect.any(Object), expect.stringContaining("2 Kumo updates"), expect.any(Object));
    expect(mocks.operations.filter((operation) => operation.operation === "update")).toHaveLength(4);
  });

  it("handles disabled delivery, empty digests, and every digest query failure", async () => {
    delete process.env.VAPID_PRIVATE_KEY;
    await expect(sendDueNotificationDigests()).resolves.toEqual({ users: 0, delivered: 0 });
    process.env.VAPID_PRIVATE_KEY = "private-key";

    mocks.digestPreferenceError = new Error("schedule failed");
    await expect(sendDueNotificationDigests()).rejects.toThrow("schedule failed");
    mocks.digestPreferenceError = null;

    mocks.digestPreferences = null;
    await expect(sendDueNotificationDigests()).resolves.toEqual({ users: 0, delivered: 0 });

    mocks.digestPreferences = [{ user_id: "empty", digest: "daily", last_digest_at: null }];
    mocks.digestNotifications = [null];
    await expect(sendDueNotificationDigests()).resolves.toEqual({ users: 0, delivered: 0 });

    mocks.digestNotifications = [[]];
    mocks.digestNotificationErrors = [new Error("notifications failed")];
    await expect(sendDueNotificationDigests()).rejects.toThrow("notifications failed");
    mocks.digestNotificationErrors = [];

    mocks.digestNotifications = [[]];
    mocks.digestMuteErrors = [new Error("mutes failed")];
    await expect(sendDueNotificationDigests()).rejects.toThrow("mutes failed");
    mocks.digestMuteErrors = [];

    mocks.digestNotifications = [[]];
    mocks.preferenceUpdateError = new Error("advance failed");
    await expect(sendDueNotificationDigests()).rejects.toThrow("advance failed");
  });

  it("filters digest items by category preferences and per-board mutes", async () => {
    const now = new Date("2026-08-25T12:00:00Z");
    mocks.digestPreferences = [{
      user_id: "user", digest: "daily", last_digest_at: null,
      board_comments: "mentions", branch_reviews: false, library_updates: true, access_changes: false,
    }];
    mocks.digestNotifications = [[
      { id: "comment", title: "Comment", kind: "comment", board_id: "board" },
      { id: "mention", title: "Mention", kind: "mention", board_id: "board" },
      { id: "branch", title: "Branch", kind: "branch", board_id: "other" },
      { id: "library", title: "Library", kind: "library", board_id: "other" },
      { id: "access", title: "Access", kind: "access-request", board_id: "other" },
      { id: "system", title: "System", kind: "system", board_id: null },
    ]];
    mocks.digestMutes = [[{ board_id: "board" }]];
    mocks.subscriptions = [{ id: "push", endpoint: "https://push.test", p256dh: "p", auth: "a", failure_count: 0 }];
    mocks.sendNotification.mockResolvedValue({ statusCode: 201 });
    await expect(sendDueNotificationDigests(now)).resolves.toEqual({ users: 1, delivered: 1 });
    const payload = String(mocks.sendNotification.mock.calls[0]?.[1]);
    expect(payload).toContain("2 Kumo updates");
    expect(payload).toContain("Library");
  });

  it("evaluates comment and mention digest policies when boards are not muted", async () => {
    mocks.digestPreferences = [
      { user_id: "all", digest: "daily", last_digest_at: null, board_comments: "all" },
      { user_id: "mentions", digest: "daily", last_digest_at: null, board_comments: "mentions" },
      { user_id: "off", digest: "daily", last_digest_at: null, board_comments: "off" },
    ];
    mocks.digestNotifications = [
      [{ id: "comment", title: "Comment", kind: "comment", board_id: "board" }, { id: "mention", title: "Mention", kind: "mention", board_id: "board" }],
      [{ id: "mention", title: "Mention", kind: "mention", board_id: "board" }],
      [{ id: "comment", title: "Comment", kind: "comment", board_id: "board" }, { id: "mention", title: "Mention", kind: "mention", board_id: "board" }],
    ];
    mocks.digestMutes = [null, [], []];
    mocks.subscriptions = [{ id: "push", endpoint: "https://push.test", p256dh: "p", auth: "a", failure_count: 0 }];
    mocks.sendNotification.mockResolvedValue({ statusCode: 201 });
    await expect(sendDueNotificationDigests(new Date("2026-08-25T12:00:00Z"))).resolves.toEqual({ users: 2, delivered: 2 });
  });
});
