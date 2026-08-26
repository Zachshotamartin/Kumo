import type { VercelRequest, VercelResponse } from "@vercel/node";
import handler from "../../server/api/handlers/platform";

const mocks = vi.hoisted(() => ({
  requireActor: vi.fn(), ensureProfile: vi.fn(), from: vi.fn(), rpc: vi.fn(), getAccess: vi.fn(), listBoards: vi.fn(), searchBoards: vi.fn(),
  provisionBoard: vi.fn(), getDocument: vi.fn(), revokeTokens: vi.fn(),
  friendshipRows: vi.fn(),
  pushConfigured: vi.fn(), sendPush: vi.fn(), storageFrom: vi.fn(),
  queues: new Map<string, Array<{ data?: unknown; error: unknown }>>(), calls: [] as Array<{ table: string; operation: string; value?: unknown; args?: unknown[] }>,
}));

vi.mock("../../server/api/_auth", () => ({ requireActor: mocks.requireActor }));
vi.mock("../../server/api/_supabase", () => ({ ensureActorProfile: mocks.ensureProfile, supabaseAdmin: () => ({ from: mocks.from, rpc: mocks.rpc, storage: { from: mocks.storageFrom } }) }));
vi.mock("../../server/api/_boards", () => ({ getBoardAccess: mocks.getAccess, listBoardsForUser: mocks.listBoards, searchPublicBoards: mocks.searchBoards, provisionBoard: mocks.provisionBoard }));
vi.mock("../../server/api/_liveblocks", () => ({ liveblocksAdmin: () => ({ getStorageDocument: mocks.getDocument }) }));
vi.mock("../../server/api/_firebaseAdmin", () => ({ privilegedAdminAuth: () => ({ revokeRefreshTokens: mocks.revokeTokens }) }));
vi.mock("../../server/api/_push", () => ({ pushConfigured: mocks.pushConfigured, sendPushToUser: mocks.sendPush }));
vi.mock("../../server/api/_profiles", () => ({
  friendshipRowsForActor: mocks.friendshipRows,
  otherUserId: (row: { user_low_id: string; user_high_id: string }, actorUid: string) => row.user_low_id === actorUid ? row.user_high_id : row.user_low_id,
  relationshipFor: (row: { status: string; blocked_by: string | null }, actorUid: string) => row.status === "blocked" && row.blocked_by !== actorUid ? "hidden" : "none",
}));

const next = (table: string) => mocks.queues.get(table)?.shift() ?? { data: null, error: null };
const query = (table: string) => {
  const builder: Record<string, unknown> = {};
  const chain = (operation: string) => (...args: unknown[]) => { mocks.calls.push({ table, operation, value: args[0], args }); return builder; };
  ["select", "eq", "ilike", "or", "order", "limit", "in", "is", "neq", "insert", "update", "upsert", "delete"].forEach((operation) => { builder[operation] = chain(operation); });
  builder.single = () => Promise.resolve(next(table));
  builder.maybeSingle = () => Promise.resolve(next(table));
  builder.then = (resolve: (value: unknown) => unknown, reject: (error: unknown) => unknown) => Promise.resolve(next(table)).then(resolve, reject);
  return builder;
};
const enqueue = (table: string, ...results: Array<{ data?: unknown; error?: unknown }>) => mocks.queues.set(table, results.map((result) => ({ data: result.data, error: result.error ?? null })));
const response = () => { const result = { statusCode: 0, body: undefined as unknown, headers: {} as Record<string, string>, status(code: number) { this.statusCode = code; return this; }, json(body: unknown) { this.body = body; return this; }, setHeader(name: string, value: string) { this.headers[name] = value; return this; } }; return result as unknown as VercelResponse & typeof result; };
const request = (method: string, body: Record<string, unknown> = {}, queryValues: Record<string, string> = {}) => ({ method, body, query: queryValues, headers: { authorization: "Bearer token", host: "kumo.test", "x-forwarded-proto": "https", "x-forwarded-for": "127.0.0.1" } }) as unknown as VercelRequest;

describe("product maturity platform API", () => {
  beforeEach(() => {
    vi.clearAllMocks(); mocks.queues.clear(); mocks.calls.length = 0; mocks.from.mockImplementation(query);
    mocks.requireActor.mockResolvedValue({ uid: "owner", email: "owner@example.com" });
    mocks.ensureProfile.mockResolvedValue({ uid: "owner", email: "owner@example.com", displayName: "Owner", avatarUrl: null });
    mocks.rpc.mockImplementation(async (name: string) => ({ data: name === "consume_kumo_rate_limit" ? { allowed: true, remaining: 29 } : null, error: null }));
    mocks.getAccess.mockResolvedValue({ role: "owner", board: { id: "board", owner_id: "owner", title: "Board", visibility: "private", liveblocks_room_id: "board:board" } });
    mocks.listBoards.mockResolvedValue([]); mocks.searchBoards.mockResolvedValue([]); mocks.getDocument.mockResolvedValue({ backgroundColor: "#fff", nodes: {} });
    mocks.provisionBoard.mockResolvedValue({ id: "remix" }); mocks.revokeTokens.mockResolvedValue(undefined);
    mocks.friendshipRows.mockResolvedValue([]);
    mocks.pushConfigured.mockReturnValue(true); mocks.sendPush.mockResolvedValue({ delivered: 1, subscriptions: 1 });
    delete process.env.KUMO_MODERATOR_UIDS;
    process.env.VAPID_PUBLIC_KEY = "test-public-key";
    mocks.storageFrom.mockReturnValue({
      createSignedUrls: vi.fn().mockResolvedValue({ data: [], error: null }),
      createSignedUploadUrl: vi.fn().mockResolvedValue({ data: { path: "workspace/font.woff2", token: "token", signedUrl: "https://upload" }, error: null }),
      createSignedUrl: vi.fn().mockResolvedValue({ data: { signedUrl: "https://signed/font" }, error: null }),
      list: vi.fn().mockResolvedValue({ data: [{ name: "font.woff2", metadata: { mimetype: "font/woff2" } }], error: null }),
    });
  });

  it("redeems passwordless prototype links without requiring editor authentication", async () => {
    enqueue("prototype_share_links", { data: { id: "link", board_id: "board", start_shape_id: "frame", password_hash: null, device_frame: "phone", expires_at: null, revoked_at: null } });
    enqueue("boards", { data: { id: "board", title: "Prototype", liveblocks_room_id: "board:board" } });
    const reply = response(); await handler(request("POST", { action: "redeem-prototype", token: "secret" }), reply);
    expect(reply.statusCode).toBe(200); expect(reply.body).toEqual({ prototype: expect.objectContaining({ title: "Prototype", deviceFrame: "phone", document: { backgroundColor: "#fff", nodes: {} } }) });
    expect(mocks.requireActor).not.toHaveBeenCalled();
  });

  it("loads defaults and persists notification preferences", async () => {
    enqueue("notification_preferences", { data: null });
    const read = response(); await handler(request("GET", {}, { scope: "notification-preferences" }), read);
    expect(read.body).toEqual({ preferences: expect.objectContaining({ digest: "instant", board_comments: "all" }) });
    enqueue("notification_preferences", { data: { user_id: "owner", digest: "weekly", board_comments: "mentions" } });
    const update = response(); await handler(request("POST", { action: "update-notification-preferences", preferences: { digest: "weekly", board_comments: "mentions", browser_enabled: true } }), update);
    expect(update.body).toEqual({ preferences: expect.objectContaining({ digest: "weekly" }) });
    expect(mocks.calls).toContainEqual(expect.objectContaining({ table: "notification_preferences", operation: "upsert", value: expect.objectContaining({ browser_enabled: true }) }));

    enqueue("notification_preferences", { data: { user_id: "owner", browser_enabled: false } });
    enqueue("push_subscriptions", { error: null });
    const disabled = response(); await handler(request("POST", { action: "update-notification-preferences", preferences: { browser_enabled: false } }), disabled);
    expect(disabled.statusCode).toBe(200);
    expect(mocks.calls).toContainEqual(expect.objectContaining({ table: "push_subscriptions", operation: "delete" }));
  });

  it("exposes push configuration and manages encrypted subscriptions", async () => {
    const configured = response(); await handler(request("GET", {}, { scope: "push-config" }), configured);
    expect(configured.body).toEqual({ configured: true, publicKey: "test-public-key" });
    enqueue("push_subscriptions", { data: { id: "push", endpoint: "https://push.example/sub", updated_at: "now" } });
    const subscribed = response(); await handler(request("POST", { action: "subscribe-push", endpoint: "https://push.example/sub", p256dh: "public-encryption-key", auth: "auth-secret" }), subscribed);
    expect(subscribed.statusCode).toBe(201);
    expect(mocks.calls).toContainEqual(expect.objectContaining({ table: "push_subscriptions", operation: "upsert", value: expect.objectContaining({ user_id: "owner", endpoint: "https://push.example/sub" }) }));
    const tested = response(); await handler(request("POST", { action: "test-push" }), tested);
    expect(tested.body).toEqual({ delivered: 1, subscriptions: 1 });
    expect(mocks.sendPush).toHaveBeenCalledWith("owner", expect.objectContaining({ tag: "kumo:push-test" }));
    enqueue("push_subscriptions", { error: null });
    const removed = response(); await handler(request("POST", { action: "unsubscribe-push", endpoint: "https://push.example/sub" }), removed);
    expect(removed.body).toEqual({ unsubscribed: true });
    const invalid = response(); await handler(request("POST", { action: "subscribe-push", endpoint: "http://insecure", p256dh: "p", auth: "a" }), invalid);
    expect(invalid.statusCode).toBe(400);
  });

  it("creates, lists, redeems, and revokes temporary guest sessions", async () => {
    const future = new Date(Date.now() + 60 * 60_000).toISOString();
    enqueue("board_open_sessions", { data: { id: "session", board_id: "board", role: "editor", expires_at: future, created_at: "now" } });
    enqueue("audit_events", { error: null });
    const created = response(); await handler(request("POST", { action: "create-open-session", boardId: "board", role: "editor", password: "secure-password", expiresAt: future }), created);
    expect(created.statusCode).toBe(201);
    expect(created.body).toEqual(expect.objectContaining({ token: expect.any(String), url: expect.stringContaining("openSession=") }));
    const inserted = mocks.calls.find((call) => call.table === "board_open_sessions" && call.operation === "insert")?.value as Record<string, unknown>;
    expect(inserted.password_hash).not.toBe("secure-password");
    expect(inserted.token_hash).toMatch(/^[a-f0-9]{64}$/);

    enqueue("board_open_sessions", { data: [{ id: "session", board_id: "board", role: "editor", expires_at: future, revoked_at: null, use_count: 0, created_at: "now" }] });
    const listed = response(); await handler(request("GET", {}, { scope: "open-sessions", boardId: "board" }), listed);
    expect(listed.body).toEqual({ sessions: [expect.objectContaining({ id: "session" })] });

    mocks.requireActor.mockClear();
    enqueue("board_open_sessions", { data: { id: "session", board_id: "board", password_hash: inserted.password_hash, role: "editor", expires_at: future, revoked_at: null, use_count: 0, boards: { id: "board", title: "Open board", liveblocks_room_id: "board:board", visibility: "private", owner_id: "owner", updated_at: "2026-08-25T00:00:00.000Z" } } }, { error: null });
    const createdBody = created.body as { token: string };
    const redeemed = response(); await handler(request("POST", { action: "redeem-open-session", token: createdBody.token, password: "secure-password", guestNonce: "0123456789abcdef" }), redeemed);
    expect(redeemed.body).toEqual({ session: expect.objectContaining({ boardId: "board", guestId: expect.stringMatching(/^guest:/), role: "editor" }) });
    expect(mocks.requireActor).not.toHaveBeenCalled();

    const invalidNonce = response();
    await handler(request("POST", { action: "redeem-open-session", token: createdBody.token, guestNonce: "shared" }), invalidNonce);
    expect(invalidNonce.statusCode).toBe(400);

    mocks.requireActor.mockResolvedValue({ uid: "owner", email: "owner@example.com" });
    enqueue("board_open_sessions", { error: null }); enqueue("audit_events", { error: null });
    const revoked = response(); await handler(request("POST", { action: "revoke-open-session", boardId: "board", sessionId: "session" }), revoked);
    expect(revoked.body).toEqual({ revoked: true });
  });

  it("enforces editor-session passwords and workspace-font boundaries", async () => {
    const weak = response(); await handler(request("POST", { action: "create-open-session", boardId: "board", role: "editor", password: "short" }), weak);
    expect(weak.statusCode).toBe(400);
    expect(weak.body).toEqual({ error: expect.stringContaining("at least 8") });

    enqueue("workspace_members", { data: { workspace_id: "workspace", role: "owner", workspaces: { id: "workspace", name: "Studio", owner_id: "owner" } } });
    const prepared = response(); await handler(request("POST", { action: "prepare-font-upload", fileName: "Kumo.woff2", mimeType: "font/woff2", byteSize: 2048 }), prepared);
    expect(prepared.statusCode).toBe(200);
    expect(prepared.body).toEqual(expect.objectContaining({ workspaceId: "workspace", upload: expect.objectContaining({ token: "token" }) }));

    enqueue("workspace_members", { data: { workspace_id: "workspace", role: "owner", workspaces: { id: "workspace", name: "Studio", owner_id: "owner" } } });
    enqueue("workspace_fonts", { data: { id: "font", workspace_id: "workspace", family: "Kumo Sans", style: "normal", weight_min: 400, weight_max: 700, storage_key: "workspace/font.woff2", mime_type: "font/woff2", created_at: "now" } });
    const completed = response(); await handler(request("POST", { action: "complete-font-upload", storageKey: "workspace/font.woff2", family: "Kumo Sans", weightMin: 400, weightMax: 700 }), completed);
    expect(completed.statusCode).toBe(201);
    expect(completed.body).toEqual({ font: expect.objectContaining({ family: "Kumo Sans", url: "https://signed/font" }) });

    enqueue("workspace_members", { data: { workspace_id: "workspace", role: "owner", workspaces: { id: "workspace", name: "Studio", owner_id: "owner" } } });
    const escaped = response(); await handler(request("POST", { action: "complete-font-upload", storageKey: "other/../font.woff2", family: "Bad" }), escaped);
    expect(escaped.statusCode).toBe(400);
  });

  it("refreshes pending workspace invitations atomically and transfers ownership transactionally", async () => {
    mocks.rpc.mockImplementation(async (name: string) => ({
      data: name === "consume_kumo_rate_limit" ? { allowed: true, remaining: 29 }
        : name === "create_or_refresh_kumo_workspace_invitation" ? { id: "invite", email: "new@example.com", role: "member", status: "pending", expires_at: "later", created_at: "now" }
          : null,
      error: null,
    }));
    enqueue("workspace_members", { data: { role: "owner" } });
    enqueue("profiles", { data: null });
    const invited = response();
    await handler(request("POST", { action: "invite-workspace-member", workspaceId: "workspace", email: "NEW@example.com", role: "member" }), invited);
    expect(invited.statusCode).toBe(202);
    expect(invited.body).toEqual(expect.objectContaining({ invitation: expect.objectContaining({ id: "invite" }), url: expect.stringContaining("workspaceInvite=") }));
    expect(mocks.rpc).toHaveBeenCalledWith("create_or_refresh_kumo_workspace_invitation", expect.objectContaining({ p_workspace_id: "workspace", p_email: "new@example.com", p_role: "member", p_invited_by: "owner" }));

    enqueue("workspace_members", { data: { role: "owner" } });
    const transferred = response();
    await handler(request("POST", { action: "transfer-workspace-ownership", workspaceId: "workspace", userId: "member" }), transferred);
    expect(transferred.body).toEqual({ transferred: true, ownerId: "member" });
    expect(mocks.rpc).toHaveBeenCalledWith("transfer_kumo_workspace_ownership", { p_workspace_id: "workspace", p_actor_id: "owner", p_new_owner_id: "member" });
  });

  it("publishes, installs, disables, and uninstalls permission-scoped extensions", async () => {
    enqueue("extension_catalog", { data: { id: "kumo.test", name: "Test", manifest: { permissions: ["read-document"] } } });
    const publish = response(); await handler(request("POST", { action: "publish-extension", manifest: { id: "kumo.test", name: "Test", permissions: ["read-document"], commands: [{ id: "run", name: "Run", operation: "rename-selected" }] } }), publish);
    expect(publish.statusCode).toBe(201);
    enqueue("extension_catalog", { data: { manifest: { permissions: ["read-document"] }, verified: true, publisher_id: null } }); enqueue("installed_extensions", { error: null });
    const install = response(); await handler(request("POST", { action: "install-extension", extensionId: "kumo.test", permissions: ["read-document"] }), install);
    expect(install.body).toEqual({ installed: true, permissions: ["read-document"] });
    enqueue("installed_extensions", { error: null }); const toggle = response(); await handler(request("POST", { action: "toggle-extension", extensionId: "kumo.test", enabled: false }), toggle); expect(toggle.body).toEqual({ enabled: false });
    enqueue("installed_extensions", { error: null }); const remove = response(); await handler(request("POST", { action: "uninstall-extension", extensionId: "kumo.test" }), remove); expect(remove.body).toEqual({ uninstalled: true });
  });

  it("creates protected prototype delivery links and supports revocation", async () => {
    enqueue("prototype_share_links", { data: { id: "link", board_id: "board", start_shape_id: "frame", device_frame: "desktop", expires_at: null, revoked_at: null, created_at: "now" } });
    const created = response(); await handler(request("POST", { action: "create-prototype-link", boardId: "board", startShapeId: "frame", password: "secret", deviceFrame: "desktop" }), created);
    expect(created.statusCode).toBe(201); expect(created.body).toEqual(expect.objectContaining({ token: expect.any(String), url: expect.stringContaining("prototype=") }));
    const inserted = mocks.calls.find((call) => call.table === "prototype_share_links" && call.operation === "insert")?.value as Record<string, unknown>;
    expect(inserted.password_hash).not.toBe("secret"); expect(inserted.token_hash).toMatch(/^[a-f0-9]{64}$/);
    enqueue("prototype_share_links", { error: null }); const revoked = response(); await handler(request("POST", { action: "revoke-prototype-link", boardId: "board", linkId: "link" }), revoked); expect(revoked.body).toEqual({ revoked: true });
  });

  it("publishes, reports, and remixes community boards", async () => {
    enqueue("community_publications", { data: { board_id: "board", slug: "board", description: "Useful" } });
    const published = response(); await handler(request("POST", { action: "publish-community", boardId: "board", description: "Useful", tags: ["Design", "Systems"] }), published);
    expect(published.statusCode).toBe(201); expect(mocks.calls).toContainEqual(expect.objectContaining({ table: "community_publications", operation: "upsert", value: expect.objectContaining({ tags: ["design", "systems"] }) }));
    enqueue("community_publications", { data: { board_id: "board" } }); enqueue("community_reports", { error: null }); const reported = response(); await handler(request("POST", { action: "report-community", boardId: "board", category: "spam", reason: "Misleading preview" }), reported); expect(reported.body).toEqual({ reported: true });
    enqueue("community_publications", { data: { remix_allowed: true, remix_count: 2, boards: { title: "Published board", liveblocks_room_id: "board:public" } } }, { error: null });
    mocks.getAccess.mockClear();
    const remixed = response(); await handler(request("POST", { action: "remix-community", boardId: "board" }), remixed); expect(remixed.body).toEqual({ boardId: "remix" });
    expect(mocks.getAccess).not.toHaveBeenCalled();
    expect(mocks.getDocument).toHaveBeenCalledWith("board:public", "json");
  });

  it("loads and enforces the community moderation queue", async () => {
    const denied = response();
    await handler(request("GET", {}, { scope: "community-moderation" }), denied);
    expect(denied.statusCode).toBe(403);

    process.env.KUMO_MODERATOR_UIDS = " other, owner ";
    enqueue("community_reports", { data: [{ id: "report", board_id: "board", status: "open" }] });
    const queue = response();
    await handler(request("GET", {}, { scope: "community-moderation" }), queue);
    expect(queue.body).toEqual({ reports: [expect.objectContaining({ id: "report" })] });

    enqueue("community_reports", { data: null });
    const empty = response();
    await handler(request("GET", {}, { scope: "community-moderation" }), empty);
    expect(empty.body).toEqual({ reports: [] });

    enqueue("community_reports", { error: new Error("queue failed") });
    const failure = response();
    await handler(request("GET", {}, { scope: "community-moderation" }), failure);
    expect(failure.statusCode).toBe(500);
  });

  it("reviews, dismisses, and removes community reports with an auditable decision", async () => {
    process.env.KUMO_MODERATOR_UIDS = "owner";
    for (const decision of ["reviewed", "dismissed", "removed"] as const) {
      const reply = response();
      await handler(request("POST", { action: "moderate-community", reportId: `report-${decision}`, decision, note: "Checked" }), reply);
      expect(reply.body).toEqual({ moderated: true, decision });
      expect(mocks.rpc).toHaveBeenCalledWith("moderate_kumo_community_report", {
        p_report_id: `report-${decision}`, p_actor_id: "owner", p_decision: decision, p_note: "Checked",
      });
    }
  });

  it("validates moderation state and reports each persistence failure", async () => {
    const forbidden = response();
    await handler(request("POST", { action: "moderate-community", reportId: "report", decision: "reviewed" }), forbidden);
    expect(forbidden.statusCode).toBe(403);
    process.env.KUMO_MODERATOR_UIDS = "owner";

    for (const body of [{ decision: "reviewed" }, { reportId: "report", decision: "invalid" }]) {
      const invalid = response(); await handler(request("POST", { action: "moderate-community", ...body }), invalid); expect(invalid.statusCode).toBe(400);
    }
    mocks.rpc.mockImplementation(async (name: string) => name === "moderate_kumo_community_report"
      ? { data: null, error: new Error("moderation transaction failed") }
      : { data: { allowed: true, remaining: 20 }, error: null });
    const failed = response(); await handler(request("POST", { action: "moderate-community", reportId: "report", decision: "reviewed" }), failed); expect(failed.statusCode).toBe(500);
    mocks.rpc.mockImplementation(async (name: string) => name === "moderate_kumo_community_report"
      ? { data: null, error: new Error("This report has already been reviewed") }
      : { data: { allowed: true, remaining: 20 }, error: null });
    const stale = response(); await handler(request("POST", { action: "moderate-community", reportId: "report", decision: "reviewed" }), stale); expect(stale.statusCode).toBe(409);
  });

  it("lists current account devices and selectively revokes other sessions", async () => {
    enqueue("account_sessions", { data: [{ id: "current" }, { id: "other" }] });
    const listed = response();
    await handler({ ...request("GET", {}, { scope: "account-sessions" }), headers: { ...request("GET").headers, "x-kumo-session-id": ["current"] } } as unknown as VercelRequest, listed);
    expect(listed.body).toEqual({ sessions: [{ id: "current", current: true }, { id: "other", current: false }] });

    enqueue("account_sessions", { data: null });
    const empty = response(); await handler(request("GET", {}, { scope: "account-sessions" }), empty); expect(empty.body).toEqual({ sessions: [] });
    enqueue("account_sessions", { error: new Error("sessions failed") });
    const failure = response(); await handler(request("GET", {}, { scope: "account-sessions" }), failure); expect(failure.statusCode).toBe(500);

    for (const sessionId of ["", "current"]) {
      const invalid = response();
      await handler({ ...request("POST", { action: "revoke-account-session", sessionId }), headers: { ...request("POST").headers, "x-kumo-session-id": "current" } } as unknown as VercelRequest, invalid);
      expect(invalid.statusCode).toBe(400);
    }
    enqueue("account_sessions", { error: null });
    const revoked = response(); await handler(request("POST", { action: "revoke-account-session", sessionId: "other" }), revoked); expect(revoked.body).toEqual({ revoked: true });
    enqueue("account_sessions", { error: new Error("revoke failed") });
    const revokeFailure = response(); await handler(request("POST", { action: "revoke-account-session", sessionId: "other" }), revokeFailure); expect(revokeFailure.statusCode).toBe(500);

    enqueue("account_sessions", { error: null });
    const arrayHeader = response();
    await handler({ ...request("POST", { action: "revoke-account-session", sessionId: "other" }), headers: { ...request("POST").headers, "x-kumo-session-id": ["current"] } } as unknown as VercelRequest, arrayHeader);
    expect(arrayHeader.statusCode).toBe(200);
  });

  it("loads current account-deletion status and reports lookup failures", async () => {
    enqueue("account_deletion_requests", { data: { scheduled_for: "later", cancelled_at: null } });
    const loaded = response(); await handler(request("GET", {}, { scope: "account-deletion" }), loaded);
    expect(loaded.body).toEqual({ deletion: { scheduled_for: "later", cancelled_at: null } });
    enqueue("account_deletion_requests", { error: new Error("deletion lookup failed") });
    const failed = response(); await handler(request("GET", {}, { scope: "account-deletion" }), failed);
    expect(failed.statusCode).toBe(500);
  });

  it("preserves the current device during global revocation and reports session storage failures", async () => {
    enqueue("account_sessions", { error: null }); enqueue("audit_events", { error: null });
    const revoked = response();
    await handler({ ...request("POST", { action: "revoke-sessions" }), headers: { ...request("POST").headers, "x-kumo-session-id": ["current"] } } as unknown as VercelRequest, revoked);
    expect(revoked.statusCode).toBe(200);
    expect(mocks.calls).toContainEqual(expect.objectContaining({ table: "account_sessions", operation: "neq", args: ["id", "current"] }));

    enqueue("account_sessions", { error: new Error("session update failed") });
    const failure = response(); await handler(request("POST", { action: "revoke-sessions" }), failure); expect(failure.statusCode).toBe(500);
  });

  it("exports account data, revokes sessions, and schedules or cancels deletion", async () => {
    enqueue("account_notifications", { data: [] }); enqueue("friendships", { data: [] }); enqueue("audit_events", { data: [] });
    const exported = response(); await handler(request("GET", {}, { scope: "account-export" }), exported); expect(exported.body).toEqual(expect.objectContaining({ profile: expect.objectContaining({ uid: "owner" }), boards: [] }));
    enqueue("audit_events", { error: null }); const sessions = response(); await handler(request("POST", { action: "revoke-sessions" }), sessions); expect(sessions.body).toEqual({ revoked: true }); expect(mocks.revokeTokens).not.toHaveBeenCalled();
    mocks.rpc.mockImplementation(async (name: string) => name === "schedule_kumo_account_deletion"
      ? { data: [{ requested_at: "now", scheduled_for: "later" }], error: null }
      : { data: { allowed: true, remaining: 20 }, error: null });
    const deletion = response(); await handler(request("POST", { action: "request-account-deletion" }), deletion); expect(deletion.body).toEqual({ deletion: { requested_at: "now", scheduled_for: "later" } });
    mocks.rpc.mockImplementation(async (name: string) => name === "schedule_kumo_account_deletion"
      ? { data: null, error: null }
      : { data: { allowed: true, remaining: 20 }, error: null });
    const emptyDeletion = response(); await handler(request("POST", { action: "request-account-deletion" }), emptyDeletion); expect(emptyDeletion.body).toEqual({ deletion: null });
    const cancel = response(); await handler(request("POST", { action: "cancel-account-deletion" }), cancel); expect(cancel.body).toEqual({ cancelled: true });
  });

  it("loads complete workspace administration data and provisions a first workspace", async () => {
    enqueue("workspace_members",
      { data: { workspace_id: "workspace", role: "owner", workspaces: { id: "workspace", name: "Studio", owner_id: "owner" } } },
      { data: [{ user_id: "owner", role: "owner", created_at: "now" }] },
    );
    enqueue("workspace_folders", { data: [{ id: "folder", workspace_id: "workspace", parent_id: null, name: "Ideas" }] });
    enqueue("workspace_invitations", { data: [{ id: "invite", email: "new@example.com", status: "pending" }] });
    enqueue("profiles", { data: [{ firebase_uid: "owner", display_name: "Owner", email: "owner@example.com" }] });
    const existing = response();
    await handler(request("GET"), existing);
    expect(existing.body).toEqual(expect.objectContaining({
      workspace: expect.objectContaining({ workspace_id: "workspace", role: "owner" }),
      members: [expect.objectContaining({ profile: expect.objectContaining({ display_name: "Owner" }) })],
      folders: [expect.objectContaining({ id: "folder" })],
      invitations: [expect.objectContaining({ id: "invite" })],
    }));

    enqueue("workspace_members", { data: null }, { error: null }, { data: [] });
    enqueue("workspaces", { data: { id: "new-workspace", name: "Owner's workspace", owner_id: "owner" } });
    enqueue("workspace_folders", { data: [] });
    enqueue("workspace_invitations", { data: [] });
    const provisioned = response();
    await handler(request("GET"), provisioned);
    expect(provisioned.body).toEqual(expect.objectContaining({
      workspace: expect.objectContaining({ workspace_id: "new-workspace", role: "owner" }),
      members: [], folders: [], invitations: [],
    }));
    expect(mocks.calls).toContainEqual(expect.objectContaining({ table: "workspace_members", operation: "insert", value: expect.objectContaining({ role: "owner" }) }));
  });

  it("searches every discoverable resource and summarizes collaboration operations", async () => {
    mocks.listBoards.mockResolvedValue([{ id: "owned", title: "Design system", role: "owner" }]);
    mocks.searchBoards.mockResolvedValue([{ id: "public", title: "Public design", role: "viewer" }]);
    enqueue("profiles", { data: [{ firebase_uid: "person", username: "designer", display_name: "Designer" }] });
    enqueue("board_templates", { data: [{ id: "template", name: "Design kickoff", description: "Starter" }] });
    enqueue("community_publications", { data: [
      { board_id: "community", slug: "design-community", description: "Design reference", boards: { title: "Community design" }, profiles: { email: "creator@example.com" } },
      { board_id: "canary", slug: "full-stack-run", description: "Disposable integration publication", boards: { title: "Full-stack product source" }, profiles: { email: "kumo-full-stack-owner-run@example.com" } },
    ] });
    const search = response();
    await handler(request("GET", {}, { scope: "global-search", q: "design" }), search);
    expect((search.body as { results: Array<{ kind: string }> }).results.map((item) => item.kind)).toEqual(["board", "board", "profile", "template", "community"]);

    mocks.friendshipRows.mockResolvedValueOnce([{
      user_low_id: "owner", user_high_id: "person", status: "blocked", requested_by: null,
      blocked_by: "person", created_at: "", updated_at: "", responded_at: null,
    }]);
    enqueue("profiles", { data: [{ firebase_uid: "owner", username: "owner", display_name: "Owner" }, { firebase_uid: "person", username: "designer", display_name: "Designer" }] });
    enqueue("board_templates", { data: [] });
    enqueue("community_publications", { data: [] });
    const privateSearch = response();
    await handler(request("GET", {}, { scope: "global-search", q: "design" }), privateSearch);
    expect((privateSearch.body as { results: Array<{ kind: string }> }).results.every((item) => item.kind !== "profile")).toBe(true);

    mocks.listBoards.mockResolvedValueOnce([]);
    mocks.searchBoards.mockResolvedValueOnce([]);
    mocks.friendshipRows.mockResolvedValueOnce([{
      user_low_id: "owner", user_high_id: "person", status: "blocked", requested_by: null,
      blocked_by: "owner", created_at: "", updated_at: "", responded_at: null,
    }]);
    enqueue("profiles", { data: [{ firebase_uid: "person", username: "designer", display_name: "Designer" }] });
    enqueue("board_templates", { data: [{ id: "hidden-template", owner_id: "person", name: "Hidden", description: "Design" }] });
    enqueue("community_publications", { data: [{ board_id: "hidden-community", published_by: "person", slug: "hidden", description: "Design", boards: { title: "Hidden" } }] });
    const blockedContent = response();
    await handler(request("GET", {}, { scope: "global-search", q: "design" }), blockedContent);
    expect(blockedContent.body).toEqual({ results: [] });

    enqueue("audit_events", { data: [
      { event_type: "collaboration.connection", payload: { event: "lost", retryCount: 1 }, created_at: "2026-08-24T00:00:00Z" },
      { event_type: "collaboration.connection", payload: { event: "restored", durationMs: 900 }, created_at: "2026-08-24T00:00:01Z" },
      { event_type: "board.updated", payload: {}, created_at: "2026-08-24T00:00:02Z" },
    ] });
    const operations = response();
    await handler(request("GET", {}, { scope: "operations", boardId: "board" }), operations);
    expect(operations.body).toEqual(expect.objectContaining({ telemetry: expect.objectContaining({ healthy: true, recoveryRate: 1, averageRecoveryMs: 900 }) }));
  });

  it("lists extensions, prototype links, and community publications with access checks", async () => {
    enqueue("extension_catalog", { data: [{ id: "kumo.test", verified: true }] });
    const extensions = response(); await handler(request("GET", {}, { scope: "extensions" }), extensions);
    expect(extensions.body).toEqual({ extensions: [{ id: "kumo.test", verified: true }] });
    expect(mocks.calls).toContainEqual(expect.objectContaining({ table: "extension_catalog", operation: "or", value: "verified.eq.true,publisher_id.eq.owner" }));
    expect(mocks.calls).toContainEqual(expect.objectContaining({ table: "extension_catalog", operation: "eq", value: "installed_extensions.user_id" }));

    enqueue("prototype_share_links", { data: [{ id: "prototype-link", board_id: "board" }] });
    const links = response(); await handler(request("GET", {}, { scope: "prototype-links", boardId: "board" }), links);
    expect(links.body).toEqual({ links: [{ id: "prototype-link", board_id: "board" }] });
    mocks.getAccess.mockResolvedValueOnce({ role: "viewer", board: { id: "board" } });
    const forbiddenLinks = response(); await handler(request("GET", {}, { scope: "prototype-links", boardId: "board" }), forbiddenLinks);
    expect(forbiddenLinks.statusCode).toBe(403);

    enqueue("community_publications", { data: [{ board_id: "board", slug: "board", profiles: { email: "creator@example.com" } }] });
    const community = response(); await handler(request("GET", {}, { scope: "community" }), community);
    expect(community.body).toEqual({ publications: [{ board_id: "board", slug: "board" }], canModerate: false });

    mocks.friendshipRows.mockResolvedValueOnce([{
      user_low_id: "blocked", user_high_id: "owner", status: "blocked", requested_by: null,
      blocked_by: "owner", created_at: "", updated_at: "", responded_at: null,
    }]);
    enqueue("community_publications", { data: [
      { board_id: "hidden", published_by: "blocked", slug: "hidden" },
      { board_id: "visible", published_by: "creator", slug: "visible" },
      { board_id: "canary", published_by: "canary", slug: "full-stack-run", profiles: [{ email: "kumo-full-stack-owner-run@example.com" }] },
      { board_id: "own-canary", published_by: "owner", slug: "full-stack-own-run", profiles: { email: "kumo-full-stack-owner-own-run@example.com" } },
    ] });
    const filtered = response(); await handler(request("GET", {}, { scope: "community" }), filtered);
    expect(filtered.body).toEqual({ publications: [
      { board_id: "visible", published_by: "creator", slug: "visible" },
      { board_id: "own-canary", published_by: "owner", slug: "full-stack-own-run" },
    ], canModerate: false });
  });

  it("renames workspaces and manages existing members and invitations safely", async () => {
    enqueue("workspace_members", { data: { role: "owner" } }); enqueue("workspaces", { data: { id: "workspace", name: "Product", owner_id: "owner" } });
    const renamed = response(); await handler(request("POST", { action: "rename-workspace", workspaceId: "workspace", name: "Product" }), renamed);
    expect(renamed.body).toEqual({ workspace: { id: "workspace", name: "Product", owner_id: "owner" } });

    enqueue("workspace_members", { data: { role: "owner" } }, { error: null }); enqueue("profiles", { data: { firebase_uid: "member", email: "member@example.com" } });
    const added = response(); await handler(request("POST", { action: "invite-workspace-member", workspaceId: "workspace", email: "member@example.com", role: "admin" }), added);
    expect(added.body).toEqual({ added: true, userId: "member", role: "admin" });

    enqueue("workspace_members", { data: { role: "owner" } }); enqueue("workspace_invitations", { error: null });
    const cancelled = response(); await handler(request("POST", { action: "cancel-workspace-invitation", workspaceId: "workspace", invitationId: "invite" }), cancelled);
    expect(cancelled.body).toEqual({ cancelled: true });

    enqueue("workspace_members", { data: { role: "owner" } }, { error: null });
    const updated = response(); await handler(request("POST", { action: "update-workspace-member", workspaceId: "workspace", userId: "member", role: "guest" }), updated);
    expect(updated.body).toEqual({ updated: true, role: "guest" });

    enqueue("workspace_members", { data: { role: "owner" } }, { error: null });
    const removed = response(); await handler(request("POST", { action: "remove-workspace-member", workspaceId: "workspace", userId: "member" }), removed);
    expect(removed.body).toEqual({ removed: true });

    enqueue("workspace_members", { data: { role: "owner" } });
    const selfRemoval = response(); await handler(request("POST", { action: "remove-workspace-member", workspaceId: "workspace", userId: "owner" }), selfRemoval);
    expect(selfRemoval.statusCode).toBe(409);
  });

  it("renames, reparents, cycle-protects, and recursively deletes workspace folders", async () => {
    const folders = [{ id: "parent", parent_id: null }, { id: "child", parent_id: "parent" }];
    enqueue("workspace_members", { data: { role: "owner" } }); enqueue("workspace_folders", { data: folders }, { data: { id: "parent", parent_id: null, name: "Renamed" } });
    const renamed = response(); await handler(request("POST", { action: "rename-folder", workspaceId: "workspace", folderId: "parent", name: "Renamed" }), renamed);
    expect(renamed.body).toEqual({ folder: expect.objectContaining({ name: "Renamed" }) });

    enqueue("workspace_members", { data: { role: "owner" } }); enqueue("workspace_folders", { data: folders }, { data: { id: "child", parent_id: null, name: "Child" } });
    const moved = response(); await handler(request("POST", { action: "move-folder", workspaceId: "workspace", folderId: "child", parentId: "" }), moved);
    expect(moved.body).toEqual({ folder: expect.objectContaining({ id: "child", parent_id: null }) });

    enqueue("workspace_members", { data: { role: "owner" } }); enqueue("workspace_folders", { data: folders });
    const cycle = response(); await handler(request("POST", { action: "move-folder", workspaceId: "workspace", folderId: "parent", parentId: "child" }), cycle);
    expect(cycle.statusCode).toBe(409);

    enqueue("workspace_members", { data: { role: "owner" } }); enqueue("workspace_folders", { data: folders });
    const foreignParent = response(); await handler(request("POST", { action: "move-folder", workspaceId: "workspace", folderId: "child", parentId: "other-workspace-folder" }), foreignParent);
    expect(foreignParent.statusCode).toBe(404);

    enqueue("workspace_members", { data: { role: "owner" } }); enqueue("workspace_folders", { data: folders });
    const nested = response(); await handler(request("POST", { action: "delete-folder", workspaceId: "workspace", folderId: "parent" }), nested);
    expect(nested.statusCode).toBe(409);

    enqueue("workspace_members", { data: { role: "owner" } }); enqueue("workspace_folders", { data: folders }, { error: null });
    const deleted = response(); await handler(request("POST", { action: "delete-folder", workspaceId: "workspace", folderId: "parent", recursive: true }), deleted);
    expect(deleted.body).toEqual({ deleted: true });
  });

  it("handles leaving, workspace invitation acceptance, and ownership constraints", async () => {
    mocks.rpc.mockImplementation(async (name: string) => ({ data: name === "consume_kumo_rate_limit" ? { allowed: true, remaining: 29 } : "workspace", error: null }));
    const accepted = response(); await handler(request("POST", { action: "accept-workspace-invitation", token: "invite" }), accepted);
    expect(accepted.body).toEqual({ accepted: true, workspaceId: "workspace" });

    enqueue("workspace_members", { data: { role: "owner" } });
    const ownerLeave = response(); await handler(request("POST", { action: "leave-workspace", workspaceId: "workspace" }), ownerLeave);
    expect(ownerLeave.statusCode).toBe(409);

    enqueue("workspace_members", { data: { role: "member" } }, { error: null });
    const left = response(); await handler(request("POST", { action: "leave-workspace", workspaceId: "workspace" }), left);
    expect(left.body).toEqual({ left: true });

    enqueue("workspace_members", { data: { role: "admin" } });
    const transfer = response(); await handler(request("POST", { action: "transfer-workspace-ownership", workspaceId: "workspace", userId: "member" }), transfer);
    expect(transfer.statusCode).toBe(403);
  });

  it("rejects unavailable prototypes, excess extension permissions, and disabled remixes", async () => {
    enqueue("prototype_share_links", { data: null });
    const unavailable = response(); await handler(request("POST", { action: "redeem-prototype", token: "missing" }), unavailable);
    expect(unavailable.statusCode).toBe(404);

    enqueue("prototype_share_links", { data: { id: "link", board_id: "board", password_hash: "bad:hash", revoked_at: null, expires_at: null } });
    const password = response(); await handler(request("POST", { action: "redeem-prototype", token: "link", password: "wrong" }), password);
    expect(password.statusCode).toBe(403);

    enqueue("extension_catalog", { data: { manifest: { permissions: ["read-document"] }, verified: true, publisher_id: null } });
    const permission = response(); await handler(request("POST", { action: "install-extension", extensionId: "kumo.test", permissions: ["network"] }), permission);
    expect(permission.statusCode).toBe(400);

    enqueue("community_publications", { data: { remix_allowed: false, remix_count: 0 } });
    const remix = response(); await handler(request("POST", { action: "remix-community", boardId: "board" }), remix);
    expect(remix.statusCode).toBe(403);
  });

  it("unpublishes community boards and maps authentication, access, and data errors", async () => {
    enqueue("community_publications", { error: null });
    const unpublished = response(); await handler(request("POST", { action: "unpublish-community", boardId: "board" }), unpublished);
    expect(unpublished.body).toEqual({ unpublished: true });

    mocks.getAccess.mockResolvedValueOnce(null);
    const missingOperations = response(); await handler(request("GET", {}, { scope: "operations", boardId: "missing" }), missingOperations);
    expect(missingOperations.statusCode).toBe(404);

    mocks.requireActor.mockRejectedValueOnce(new Error("Authentication required."));
    const unauthenticated = response(); await handler(request("GET"), unauthenticated);
    expect(unauthenticated.statusCode).toBe(401);

    enqueue("workspace_members", { data: { role: "member" } });
    const forbiddenWorkspace = response(); await handler(request("POST", { action: "rename-workspace", workspaceId: "workspace", name: "Studio" }), forbiddenWorkspace);
    expect(forbiddenWorkspace.statusCode).toBe(403);

    enqueue("workspace_members", { error: new Error("database unavailable") });
    const databaseFailure = response(); await handler(request("POST", { action: "rename-workspace", workspaceId: "workspace", name: "Studio" }), databaseFailure);
    expect(databaseFailure.statusCode).toBe(500);
    expect(databaseFailure.body).toEqual({ error: "We couldn't update the Kumo platform." });
  });

  it("rejects unknown scopes, actions, and unsupported methods", async () => {
    const scope = response(); await handler(request("GET", {}, { scope: "unknown" }), scope); expect(scope.statusCode).toBe(400);
    const action = response(); await handler(request("POST", { action: "unknown" }), action); expect(action.statusCode).toBe(400);
    const method = response(); await handler(request("DELETE"), method); expect(method.statusCode).toBe(405);
  });

  it("covers public-link rate limits and persistence failures", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: { allowed: false, remaining: 0, retry_after_seconds: 2 }, error: null });
    const limitedPrototype = response(); await handler(request("POST", { action: "redeem-prototype", token: "limited" }), limitedPrototype); expect(limitedPrototype.statusCode).toBe(429);

    enqueue("prototype_share_links", { error: new Error("link failed") });
    const linkError = response(); await handler(request("POST", { action: "redeem-prototype", token: "secret" }), linkError); expect(linkError.statusCode).toBe(500);
    enqueue("prototype_share_links", { data: { revoked_at: "now", expires_at: null } });
    const revoked = response(); await handler(request("POST", { action: "redeem-prototype", token: "secret" }), revoked); expect(revoked.statusCode).toBe(404);
    enqueue("prototype_share_links", { data: { revoked_at: null, expires_at: new Date(Date.now() - 1_000).toISOString() } });
    const expired = response(); await handler(request("POST", { action: "redeem-prototype", token: "secret" }), expired); expect(expired.statusCode).toBe(404);
    enqueue("prototype_share_links", { data: { board_id: "board", password_hash: null, revoked_at: null, expires_at: null } });
    enqueue("boards", { error: new Error("board failed") });
    const boardError = response(); await handler(request("POST", { action: "redeem-prototype", token: 42 }), boardError); expect(boardError.statusCode).toBe(500);
    enqueue("prototype_share_links", { data: { board_id: "board", password_hash: null, revoked_at: null, expires_at: null } });
    enqueue("boards", { data: null });
    const missingBoard = response(); await handler(request("POST", { action: "redeem-prototype", token: "secret", password: 42 }), missingBoard); expect(missingBoard.statusCode).toBe(404);

    mocks.rpc.mockResolvedValueOnce({ data: { allowed: false, remaining: 0, retry_after_seconds: 2 }, error: null });
    const limitedSession = response(); await handler(request("POST", { action: "redeem-open-session", token: "limited" }), limitedSession); expect(limitedSession.statusCode).toBe(429);
    enqueue("board_open_sessions", { error: new Error("session failed") });
    const sessionError = response(); await handler(request("POST", { action: "redeem-open-session", token: "secret", guestNonce: "0123456789abcdef" }), sessionError); expect(sessionError.statusCode).toBe(500);
    for (const session of [
      null,
      { revoked_at: "now", expires_at: new Date(Date.now() + 60_000).toISOString() },
      { revoked_at: null, expires_at: new Date(Date.now() - 1_000).toISOString() },
    ]) {
      enqueue("board_open_sessions", { data: session });
      const unavailable = response(); await handler(request("POST", { action: "redeem-open-session", token: "secret", guestNonce: "0123456789abcdef" }), unavailable); expect(unavailable.statusCode).toBe(404);
    }
    enqueue("board_open_sessions", { data: { password_hash: "bad:hash", revoked_at: null, expires_at: new Date(Date.now() + 60_000).toISOString() } });
    const wrongPassword = response(); await handler(request("POST", { action: "redeem-open-session", token: "secret", password: "wrong", guestNonce: "0123456789abcdef" }), wrongPassword); expect(wrongPassword.statusCode).toBe(403);
    enqueue("board_open_sessions", { data: { password_hash: null, revoked_at: null, expires_at: new Date(Date.now() + 60_000).toISOString(), boards: [] } });
    const missingSessionBoard = response(); await handler(request("POST", { action: "redeem-open-session", token: "secret", guestNonce: "0123456789abcdef" }), missingSessionBoard); expect(missingSessionBoard.statusCode).toBe(404);
    enqueue("board_open_sessions", { data: { id: "session", password_hash: null, role: "viewer", revoked_at: null, expires_at: new Date(Date.now() + 60_000).toISOString(), use_count: null, boards: [{ id: "board", title: "Board", liveblocks_room_id: "board:board", owner_id: "owner", visibility: "private", updated_at: null }] } }, { error: null });
    const arrayBoard = response(); await handler(request("POST", { action: "redeem-open-session", token: "secret", guestNonce: "0123456789abcdef" }), arrayBoard); expect(arrayBoard.body).toEqual({ session: expect.objectContaining({ updatedAt: null }) });
  });

  it("covers workspace provisioning and administration read failures", async () => {
    enqueue("workspace_members", { error: new Error("membership failed") });
    const membershipError = response(); await handler(request("GET"), membershipError); expect(membershipError.statusCode).toBe(500);

    enqueue("workspace_members", { data: null }); enqueue("workspaces", { error: new Error("workspace failed") });
    const workspaceError = response(); await handler(request("GET"), workspaceError); expect(workspaceError.statusCode).toBe(500);

    enqueue("workspace_members", { data: null }, { error: new Error("member insert failed") }); enqueue("workspaces", { data: { id: "workspace", name: "Studio", owner_id: "owner" } });
    const memberInsertError = response(); await handler(request("GET"), memberInsertError); expect(memberInsertError.statusCode).toBe(500);

    const workspace = { id: "workspace", name: "Studio", owner_id: "owner" };
    enqueue("workspace_members", { data: { workspace_id: "workspace", role: "owner", workspaces: [workspace] } }, { data: null });
    enqueue("workspace_folders", { data: null }); enqueue("workspace_invitations", { data: null });
    const arrayRelation = response(); await handler(request("GET"), arrayRelation);
    expect(arrayRelation.body).toEqual(expect.objectContaining({ members: [], folders: [], invitations: [] }));

    for (const [table, error] of [["workspace_members", "members failed"], ["workspace_folders", "folders failed"], ["workspace_invitations", "invitations failed"]] as const) {
      enqueue("workspace_members", { data: { workspace_id: "workspace", role: "owner", workspaces: workspace } }, table === "workspace_members" ? { error: new Error(error) } : { data: [] });
      enqueue("workspace_folders", table === "workspace_folders" ? { error: new Error(error) } : { data: [] });
      enqueue("workspace_invitations", table === "workspace_invitations" ? { error: new Error(error) } : { data: [] });
      const failed = response(); await handler(request("GET"), failed); expect(failed.statusCode).toBe(500);
    }

    enqueue("workspace_members", { data: { workspace_id: "workspace", role: "owner", workspaces: workspace } }, { data: [{ user_id: "owner" }] });
    enqueue("workspace_folders", { data: [] }); enqueue("workspace_invitations", { data: [] }); enqueue("profiles", { error: new Error("profiles failed") });
    const profilesError = response(); await handler(request("GET"), profilesError); expect(profilesError.statusCode).toBe(500);

    enqueue("workspace_members", { data: { workspace_id: "workspace", role: "owner", workspaces: workspace } }, { data: [{ user_id: "missing" }] });
    enqueue("workspace_folders", { data: [] }); enqueue("workspace_invitations", { data: [] }); enqueue("profiles", { data: null });
    const missingProfile = response(); await handler(request("GET"), missingProfile); expect(missingProfile.body).toEqual(expect.objectContaining({ members: [expect.objectContaining({ profile: null })] }));
  });

  it("lists workspace fonts and covers signing failures and empty libraries", async () => {
    const workspace = { id: "workspace", name: "Studio", owner_id: "owner" };
    enqueue("workspace_members", { data: { workspace_id: "workspace", role: "owner", workspaces: workspace } }); enqueue("workspace_fonts", { data: [] });
    const empty = response(); await handler(request("GET", {}, { scope: "workspace-fonts" }), empty); expect(empty.body).toEqual({ fonts: [] });

    enqueue("workspace_members", { data: { workspace_id: "workspace", role: "owner", workspaces: workspace } }); enqueue("workspace_fonts", { data: null });
    const nullFonts = response(); await handler(request("GET", {}, { scope: "workspace-fonts" }), nullFonts); expect(nullFonts.body).toEqual({ fonts: [] });

    enqueue("workspace_members", { data: { workspace_id: "workspace", role: "owner", workspaces: workspace } }); enqueue("workspace_fonts", { data: [{ id: "font", storage_key: "workspace/font.woff2" }] });
    mocks.storageFrom.mockReturnValueOnce({ createSignedUrls: vi.fn().mockResolvedValue({ data: [{ path: "workspace/font.woff2", signedUrl: "https://font" }], error: null }) });
    const signed = response(); await handler(request("GET", {}, { scope: "workspace-fonts" }), signed); expect(signed.body).toEqual({ fonts: [expect.objectContaining({ url: "https://font" })] });

    enqueue("workspace_members", { data: { workspace_id: "workspace", role: "owner", workspaces: workspace } }); enqueue("workspace_fonts", { error: new Error("fonts failed") });
    const fontError = response(); await handler(request("GET", {}, { scope: "workspace-fonts" }), fontError); expect(fontError.statusCode).toBe(500);

    enqueue("workspace_members", { data: { workspace_id: "workspace", role: "owner", workspaces: workspace } }); enqueue("workspace_fonts", { data: [{ id: "font", storage_key: "workspace/font.woff2" }] });
    mocks.storageFrom.mockReturnValueOnce({ createSignedUrls: vi.fn().mockResolvedValue({ data: null, error: new Error("sign failed") }) });
    const signError = response(); await handler(request("GET", {}, { scope: "workspace-fonts" }), signError); expect(signError.statusCode).toBe(500);

    enqueue("workspace_members", { data: { workspace_id: "workspace", role: "owner", workspaces: workspace } }); enqueue("workspace_fonts", { data: [{ id: "font", storage_key: "workspace/font.woff2" }] });
    mocks.storageFrom.mockReturnValueOnce({ createSignedUrls: vi.fn().mockResolvedValue({ data: null, error: null }) });
    const unsigned = response(); await handler(request("GET", {}, { scope: "workspace-fonts" }), unsigned); expect(unsigned.body).toEqual({ fonts: [expect.objectContaining({ url: null })] });

    mocks.pushConfigured.mockReturnValueOnce(false).mockReturnValueOnce(false);
    const push = response(); await handler(request("GET", {}, { scope: "push-config" }), push); expect(push.body).toEqual({ configured: false, publicKey: "" });
  });

  it("covers global-search empty and failure results", async () => {
    const blank = response(); await handler(request("GET", {}, { scope: "global-search", q: "  " }), blank); expect(blank.body).toEqual({ results: [] });

    for (const failedTable of ["profiles", "board_templates", "community_publications"] as const) {
      enqueue("profiles", failedTable === "profiles" ? { error: new Error("profiles failed") } : { data: [] });
      enqueue("board_templates", failedTable === "board_templates" ? { error: new Error("templates failed") } : { data: [] });
      enqueue("community_publications", failedTable === "community_publications" ? { error: new Error("community failed") } : { data: [] });
      const failed = response(); await handler(request("GET", {}, { scope: "global-search", q: "design" }), failed); expect(failed.statusCode).toBe(500);
    }

    mocks.listBoards.mockResolvedValueOnce([{ id: "owned", title: "Design", role: undefined }]);
    enqueue("profiles", { data: null }); enqueue("board_templates", { data: null });
    enqueue("community_publications", { data: [{ board_id: "community", slug: "fallback-slug", description: "Design", boards: null }] });
    const fallbacks = response(); await handler(request("GET", {}, { scope: "global-search", q: "design" }), fallbacks);
    expect(fallbacks.body).toEqual({ results: expect.arrayContaining([
      expect.objectContaining({ kind: "board", detail: "public" }),
      expect.objectContaining({ kind: "community", label: "fallback-slug" }),
    ]) });

    enqueue("profiles", { data: [] }); enqueue("board_templates", { data: [] }); enqueue("community_publications", { data: null });
    const nullCommunity = response(); await handler(request("GET", {}, { scope: "global-search", q: "design" }), nullCommunity); expect(nullCommunity.statusCode).toBe(200);
  });

  it("covers every platform read error and nullable collection", async () => {
    enqueue("notification_preferences", { error: new Error("preferences failed") });
    const preferenceError = response(); await handler(request("GET", {}, { scope: "notification-preferences" }), preferenceError); expect(preferenceError.statusCode).toBe(500);

    enqueue("audit_events", { data: null });
    const ownOperations = response(); await handler(request("GET", {}, { scope: "operations" }), ownOperations); expect(ownOperations.body).toEqual(expect.objectContaining({ events: [] }));
    enqueue("audit_events", { error: new Error("events failed") });
    const operationError = response(); await handler(request("GET", {}, { scope: "operations" }), operationError); expect(operationError.statusCode).toBe(500);

    enqueue("extension_catalog", { data: null });
    const emptyExtensions = response(); await handler(request("GET", {}, { scope: "extensions" }), emptyExtensions); expect(emptyExtensions.body).toEqual({ extensions: [] });
    enqueue("extension_catalog", { error: new Error("extensions failed") });
    const extensionError = response(); await handler(request("GET", {}, { scope: "extensions" }), extensionError); expect(extensionError.statusCode).toBe(500);

    mocks.getAccess.mockResolvedValueOnce(null);
    const missingPrototypeAccess = response(); await handler(request("GET", {}, { scope: "prototype-links", boardId: "board" }), missingPrototypeAccess); expect(missingPrototypeAccess.statusCode).toBe(403);
    enqueue("prototype_share_links", { data: null });
    const emptyLinks = response(); await handler(request("GET", {}, { scope: "prototype-links", boardId: "board" }), emptyLinks); expect(emptyLinks.body).toEqual({ links: [] });
    enqueue("prototype_share_links", { error: new Error("links failed") });
    const linkError = response(); await handler(request("GET", {}, { scope: "prototype-links", boardId: "board" }), linkError); expect(linkError.statusCode).toBe(500);

    mocks.getAccess.mockResolvedValueOnce(null);
    const missingSessionAccess = response(); await handler(request("GET", {}, { scope: "open-sessions", boardId: "board" }), missingSessionAccess); expect(missingSessionAccess.statusCode).toBe(403);
    enqueue("board_open_sessions", { data: null });
    const emptySessions = response(); await handler(request("GET", {}, { scope: "open-sessions", boardId: "board" }), emptySessions); expect(emptySessions.body).toEqual({ sessions: [] });
    enqueue("board_open_sessions", { error: new Error("sessions failed") });
    const sessionError = response(); await handler(request("GET", {}, { scope: "open-sessions", boardId: "board" }), sessionError); expect(sessionError.statusCode).toBe(500);

    enqueue("community_publications", { data: null });
    const emptyCommunity = response(); await handler(request("GET", {}, { scope: "community" }), emptyCommunity); expect(emptyCommunity.body).toEqual({ publications: [], canModerate: false });
    enqueue("community_publications", { error: new Error("community failed") });
    const communityError = response(); await handler(request("GET", {}, { scope: "community" }), communityError); expect(communityError.statusCode).toBe(500);

    for (const failedTable of ["account_notifications", "friendships", "audit_events"] as const) {
      enqueue("account_notifications", failedTable === "account_notifications" ? { error: new Error("notifications failed") } : { data: null });
      enqueue("friendships", failedTable === "friendships" ? { error: new Error("friendships failed") } : { data: null });
      enqueue("audit_events", failedTable === "audit_events" ? { error: new Error("audits failed") } : { data: null });
      const failed = response(); await handler(request("GET", {}, { scope: "account-export" }), failed); expect(failed.statusCode).toBe(500);
    }
    enqueue("account_notifications", { data: null }); enqueue("friendships", { data: null }); enqueue("audit_events", { data: null });
    const emptyExport = response(); await handler(request("GET", {}, { scope: "account-export" }), emptyExport); expect(emptyExport.body).toEqual(expect.objectContaining({ notifications: [], friendships: [], auditEvents: [] }));
  });

  it("covers rate limits and workspace mutation validation", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: { allowed: false, remaining: 0, retry_after_seconds: 2 }, error: null });
    const limitedInvite = response(); await handler(request("POST", { action: "accept-workspace-invitation", token: "invite" }), limitedInvite); expect(limitedInvite.statusCode).toBe(429);
    mocks.rpc.mockImplementationOnce(async () => ({ data: { allowed: true, remaining: 9 }, error: null }))
      .mockImplementationOnce(async () => ({ data: null, error: new Error("accept failed") }));
    const acceptError = response(); await handler(request("POST", { action: "accept-workspace-invitation", token: "invite" }), acceptError); expect(acceptError.statusCode).toBe(500);
    mocks.rpc.mockResolvedValueOnce({ data: { allowed: false, remaining: 0, retry_after_seconds: 2 }, error: null });
    const limitedAction = response(); await handler(request("POST", { action: 42 }), limitedAction); expect(limitedAction.statusCode).toBe(429);

    enqueue("workspace_members", { data: { role: "owner" } }); enqueue("workspaces", { error: new Error("rename failed") });
    const renameError = response(); await handler(request("POST", { action: "rename-workspace", workspaceId: "workspace", name: 42 }), renameError); expect(renameError.statusCode).toBe(500);

    enqueue("workspace_members", { data: { role: "owner" } });
    const invalidEmail = response(); await handler(request("POST", { action: "invite-workspace-member", workspaceId: "workspace", email: "invalid", role: "invalid" }), invalidEmail); expect(invalidEmail.statusCode).toBe(400);
    enqueue("workspace_members", { data: { role: "owner" } }); enqueue("profiles", { error: new Error("profile lookup failed") });
    const profileError = response(); await handler(request("POST", { action: "invite-workspace-member", workspaceId: "workspace", email: "member@example.com" }), profileError); expect(profileError.statusCode).toBe(500);
    mocks.rpc.mockImplementation(async (name: string) => name === "upsert_kumo_workspace_member"
      ? { data: null, error: new Error("member upsert failed") }
      : { data: { allowed: true, remaining: 20 }, error: null });
    enqueue("workspace_members", { data: { role: "owner" } }); enqueue("profiles", { data: { firebase_uid: "member" } });
    const memberError = response(); await handler(request("POST", { action: "invite-workspace-member", workspaceId: "workspace", email: "member@example.com" }), memberError); expect(memberError.statusCode).toBe(500);

    mocks.rpc.mockImplementation(async (name: string) => name === "create_or_refresh_kumo_workspace_invitation"
      ? { data: null, error: new Error("invitation failed") }
      : { data: { allowed: true, remaining: 20 }, error: null });
    enqueue("workspace_members", { data: { role: "owner" } }); enqueue("profiles", { data: null });
    const invitationError = response(); await handler(request("POST", { action: "invite-workspace-member", workspaceId: "workspace", email: "new@example.com" }), invitationError); expect(invitationError.statusCode).toBe(500);

    enqueue("workspace_members", { data: { role: "owner" } }); enqueue("workspace_invitations", { error: new Error("cancel failed") });
    const cancelError = response(); await handler(request("POST", { action: "cancel-workspace-invitation", workspaceId: "workspace", invitationId: 42 }), cancelError); expect(cancelError.statusCode).toBe(500);

    mocks.rpc.mockImplementation(async (name: string) => name === "remove_kumo_workspace_member"
      ? { data: null, error: new Error("remove failed") }
      : { data: { allowed: true, remaining: 20 }, error: null });
    enqueue("workspace_members", { data: { role: "owner" } });
    const removeError = response(); await handler(request("POST", { action: "remove-workspace-member", workspaceId: "workspace", userId: "member" }), removeError); expect(removeError.statusCode).toBe(500);
    mocks.rpc.mockImplementation(async (name: string) => name === "update_kumo_workspace_member"
      ? { data: null, error: new Error("update failed") }
      : { data: { allowed: true, remaining: 20 }, error: null });
    enqueue("workspace_members", { data: { role: "owner" } });
    const updateError = response(); await handler(request("POST", { action: "update-workspace-member", workspaceId: "workspace", userId: "member", role: "invalid" }), updateError); expect(updateError.statusCode).toBe(500);

    enqueue("workspace_members", { data: { role: "owner" } });
    const selfTransfer = response(); await handler(request("POST", { action: "transfer-workspace-ownership", workspaceId: "workspace", userId: "owner" }), selfTransfer); expect(selfTransfer.statusCode).toBe(400);
    enqueue("workspace_members", { data: { role: "owner" } });
    const missingTransfer = response(); await handler(request("POST", { action: "transfer-workspace-ownership", workspaceId: "workspace", userId: 42 }), missingTransfer); expect(missingTransfer.statusCode).toBe(400);
    mocks.rpc.mockImplementation(async (name: string) => name === "transfer_kumo_workspace_ownership"
      ? { data: null, error: new Error("transfer failed") }
      : { data: { allowed: true, remaining: 20 }, error: null });
    enqueue("workspace_members", { data: { role: "owner" } });
    const transferError = response(); await handler(request("POST", { action: "transfer-workspace-ownership", workspaceId: "workspace", userId: "member" }), transferError); expect(transferError.statusCode).toBe(500);
  });

  it("covers folder and workspace-leave persistence failures", async () => {
    enqueue("workspace_members", { data: { role: "owner" } }); enqueue("workspace_folders", { error: new Error("folders failed") });
    const foldersError = response(); await handler(request("POST", { action: "rename-folder", workspaceId: "workspace", folderId: "folder" }), foldersError); expect(foldersError.statusCode).toBe(500);
    enqueue("workspace_members", { data: { role: "owner" } }); enqueue("workspace_folders", { data: null });
    const missing = response(); await handler(request("POST", { action: "rename-folder", workspaceId: "workspace", folderId: "folder" }), missing); expect(missing.statusCode).toBe(404);

    const folders = [{ id: "folder", parent_id: null }];
    enqueue("workspace_members", { data: { role: "owner" } }); enqueue("workspace_folders", { data: folders }, { error: new Error("rename failed") });
    const renameError = response(); await handler(request("POST", { action: "rename-folder", workspaceId: "workspace", folderId: "folder" }), renameError); expect(renameError.statusCode).toBe(500);
    enqueue("workspace_members", { data: { role: "owner" } }); enqueue("workspace_folders", { data: folders }, { error: new Error("move failed") });
    const moveError = response(); await handler(request("POST", { action: "move-folder", workspaceId: "workspace", folderId: "folder", parentId: 42 }), moveError); expect(moveError.statusCode).toBe(500);
    enqueue("workspace_members", { data: { role: "owner" } }); enqueue("workspace_folders", { data: folders }, { error: new Error("delete failed") });
    const deleteError = response(); await handler(request("POST", { action: "delete-folder", workspaceId: "workspace", folderId: "folder" }), deleteError); expect(deleteError.statusCode).toBe(500);

    mocks.rpc.mockImplementation(async (name: string) => name === "leave_kumo_workspace"
      ? { data: null, error: new Error("leave failed") }
      : { data: { allowed: true, remaining: 20 }, error: null });
    enqueue("workspace_members", { data: { role: "member" } });
    const leaveError = response(); await handler(request("POST", { action: "leave-workspace", workspaceId: "workspace" }), leaveError); expect(leaveError.statusCode).toBe(500);
  });

  it("covers notification and push subscription failure paths", async () => {
    enqueue("notification_preferences", { error: new Error("preferences failed") });
    const preferenceError = response(); await handler(request("POST", { action: "update-notification-preferences", preferences: 42 }), preferenceError); expect(preferenceError.statusCode).toBe(500);

    enqueue("notification_preferences", { data: { browser_enabled: false } }); enqueue("push_subscriptions", { error: new Error("unsubscribe all failed") });
    const subscriptionCleanupError = response(); await handler(request("POST", { action: "update-notification-preferences", preferences: {
      browser_enabled: false, digest: "invalid", board_comments: "invalid", branch_reviews: false, library_updates: false, access_changes: false,
    } }), subscriptionCleanupError); expect(subscriptionCleanupError.statusCode).toBe(500);

    const missingKeys = response(); await handler(request("POST", { action: "subscribe-push", endpoint: "https://push.example/sub", p256dh: 42, auth: "" }), missingKeys); expect(missingKeys.statusCode).toBe(400);
    enqueue("push_subscriptions", { error: new Error("unsubscribe failed") });
    const unsubscribeError = response(); await handler(request("POST", { action: "unsubscribe-push", endpoint: "https://push.example/sub" }), unsubscribeError); expect(unsubscribeError.statusCode).toBe(500);
    enqueue("push_subscriptions", { error: new Error("subscribe failed") });
    const subscribeError = response(); await handler(request("POST", { action: "subscribe-push", endpoint: "https://push.example/sub", p256dh: "p", auth: "a" }), subscribeError); expect(subscribeError.statusCode).toBe(500);
  });

  it("validates all workspace-font upload and completion boundaries", async () => {
    const membership = (role: string = "owner") => enqueue("workspace_members", { data: { workspace_id: "workspace", role, workspaces: { id: "workspace", name: "Studio", owner_id: "owner" } } });
    membership("guest");
    const guest = response(); await handler(request("POST", { action: "prepare-font-upload" }), guest); expect(guest.statusCode).toBe(403);

    for (const body of [
      { mimeType: "text/plain", byteSize: 4 },
      { mimeType: "font/woff2", byteSize: "nope" },
      { mimeType: "font/woff2", byteSize: 0 },
      { mimeType: "font/woff2", byteSize: 11 * 1024 * 1024 },
    ]) {
      membership();
      const invalid = response(); await handler(request("POST", { action: "prepare-font-upload", ...body }), invalid); expect(invalid.statusCode).toBe(400);
    }

    membership();
    const noExtension = response(); await handler(request("POST", { action: "prepare-font-upload", mimeType: "font/woff2", byteSize: 4, fileName: "???" }), noExtension); expect(noExtension.statusCode).toBe(200);
    membership();
    mocks.storageFrom.mockReturnValueOnce({ createSignedUploadUrl: vi.fn().mockResolvedValue({ data: null, error: new Error("prepare failed") }) });
    const prepareError = response(); await handler(request("POST", { action: "prepare-font-upload", mimeType: "font/woff2", byteSize: 4 }), prepareError); expect(prepareError.statusCode).toBe(500);

    membership();
    mocks.storageFrom.mockReturnValueOnce({ list: vi.fn().mockResolvedValue({ data: null, error: new Error("list failed") }) });
    const listError = response(); await handler(request("POST", { action: "complete-font-upload", storageKey: "workspace/font.woff2", family: "Kumo" }), listError); expect(listError.statusCode).toBe(500);

    for (const objects of [[], [{ name: "font.woff2", metadata: {} }]]) {
      membership();
      mocks.storageFrom.mockReturnValueOnce({ list: vi.fn().mockResolvedValue({ data: objects, error: null }) });
      const incomplete = response(); await handler(request("POST", { action: "complete-font-upload", storageKey: "workspace/font.woff2", family: "Kumo" }), incomplete); expect(incomplete.statusCode).toBe(409);
    }

    membership();
    const missingFamily = response(); await handler(request("POST", { action: "complete-font-upload", storageKey: "workspace/font.woff2", family: 42 }), missingFamily); expect(missingFamily.statusCode).toBe(400);

    membership(); enqueue("workspace_fonts", { error: new Error("font insert failed") });
    const insertError = response(); await handler(request("POST", { action: "complete-font-upload", storageKey: "workspace/font.woff2", family: "Kumo", weightMin: 0, weightMax: 0, style: "italic" }), insertError); expect(insertError.statusCode).toBe(500);

    membership(); enqueue("workspace_fonts", { data: { id: "font", storage_key: "workspace/font.woff2" } });
    mocks.storageFrom
      .mockReturnValueOnce({ list: vi.fn().mockResolvedValue({ data: [{ name: "font.woff2", metadata: { mimetype: "font/woff2" } }], error: null }) })
      .mockReturnValueOnce({ createSignedUrl: vi.fn().mockResolvedValue({ data: null, error: new Error("sign failed") }) });
    const signError = response(); await handler(request("POST", { action: "complete-font-upload", storageKey: "workspace/font.woff2", family: "Kumo", weightMin: 2000, weightMax: 1 }), signError); expect(signError.statusCode).toBe(500);
  });

  it("covers prototype and open-session ownership, defaults, and write errors", async () => {
    mocks.getAccess.mockResolvedValueOnce(null);
    const noPrototypeAccess = response(); await handler(request("POST", { action: "create-prototype-link", boardId: "board" }), noPrototypeAccess); expect(noPrototypeAccess.statusCode).toBe(403);
    enqueue("prototype_share_links", { error: new Error("revoke failed") });
    const prototypeRevokeError = response(); await handler(request("POST", { action: "revoke-prototype-link", boardId: "board", linkId: 42 }), prototypeRevokeError); expect(prototypeRevokeError.statusCode).toBe(500);
    enqueue("prototype_share_links", { error: new Error("create failed") });
    const prototypeCreateError = response(); await handler(request("POST", { action: "create-prototype-link", boardId: "board", startShapeId: 42, password: 42, deviceFrame: "watch", expiresAt: 42 }), prototypeCreateError); expect(prototypeCreateError.statusCode).toBe(500);

    mocks.getAccess.mockResolvedValueOnce(null);
    const noSessionAccess = response(); await handler(request("POST", { action: "create-open-session", boardId: "board" }), noSessionAccess); expect(noSessionAccess.statusCode).toBe(403);
    enqueue("board_open_sessions", { error: new Error("revoke failed") });
    const sessionRevokeError = response(); await handler(request("POST", { action: "revoke-open-session", boardId: "board", sessionId: 42 }), sessionRevokeError); expect(sessionRevokeError.statusCode).toBe(500);
    enqueue("board_open_sessions", { error: new Error("create failed") });
    const sessionCreateError = response(); await handler(request("POST", { action: "create-open-session", boardId: "board", role: "viewer", password: 42, expiresAt: "invalid" }), sessionCreateError); expect(sessionCreateError.statusCode).toBe(500);
  });

  it("covers every extension write and permission failure", async () => {
    enqueue("extension_catalog", { error: new Error("publish failed") });
    const publishError = response(); await handler(request("POST", { action: "publish-extension", manifest: { id: "kumo.test", name: "Test", permissions: [], commands: [{ id: "run", name: "Run", operation: "rename-selected" }] } }), publishError); expect(publishError.statusCode).toBe(500);
    enqueue("installed_extensions", { error: new Error("uninstall failed") });
    const uninstallError = response(); await handler(request("POST", { action: "uninstall-extension", extensionId: 42 }), uninstallError); expect(uninstallError.statusCode).toBe(500);
    enqueue("installed_extensions", { error: new Error("toggle failed") });
    const toggleError = response(); await handler(request("POST", { action: "toggle-extension", extensionId: "extension", enabled: true }), toggleError); expect(toggleError.statusCode).toBe(500);
    enqueue("extension_catalog", { error: new Error("catalog failed") });
    const catalogError = response(); await handler(request("POST", { action: "install-extension", extensionId: "extension" }), catalogError); expect(catalogError.statusCode).toBe(500);
    enqueue("extension_catalog", { data: { manifest: {}, verified: false, publisher_id: "other" } });
    const unverified = response(); await handler(request("POST", { action: "install-extension", extensionId: "extension" }), unverified); expect(unverified.statusCode).toBe(403);
    enqueue("extension_catalog", { data: { manifest: { permissions: "read-document" }, verified: false, publisher_id: "owner" } }); enqueue("installed_extensions", { error: null });
    const defaults = response(); await handler(request("POST", { action: "install-extension", extensionId: "extension", permissions: "read-document" }), defaults); expect(defaults.body).toEqual({ installed: true, permissions: [] });
    enqueue("extension_catalog", { data: { manifest: { permissions: [] }, verified: true, publisher_id: null } }); enqueue("installed_extensions", { error: new Error("install failed") });
    const installError = response(); await handler(request("POST", { action: "install-extension", extensionId: "extension", permissions: [] }), installError); expect(installError.statusCode).toBe(500);
  });

  it("covers community reporting, remixing, publishing, and fallback metadata", async () => {
    enqueue("community_publications", { error: new Error("publication failed") });
    const reportLookupError = response(); await handler(request("POST", { action: "report-community", boardId: "board" }), reportLookupError); expect(reportLookupError.statusCode).toBe(500);
    enqueue("community_publications", { data: null });
    const missingReport = response(); await handler(request("POST", { action: "report-community", boardId: "board" }), missingReport); expect(missingReport.statusCode).toBe(404);
    enqueue("community_publications", { data: { board_id: "board" } }); enqueue("community_reports", { error: new Error("report failed") });
    const reportError = response(); await handler(request("POST", { action: "report-community", boardId: "board", reason: 42 }), reportError); expect(reportError.statusCode).toBe(500);

    enqueue("community_publications", { error: new Error("remix failed") });
    const remixLookupError = response(); await handler(request("POST", { action: "remix-community", boardId: "board" }), remixLookupError); expect(remixLookupError.statusCode).toBe(500);
    enqueue("community_publications", { data: null });
    const missingRemix = response(); await handler(request("POST", { action: "remix-community", boardId: "board" }), missingRemix); expect(missingRemix.statusCode).toBe(404);
    enqueue("community_publications", { data: { remix_allowed: true, boards: [] } });
    const missingRelatedBoard = response(); await handler(request("POST", { action: "remix-community", boardId: "board" }), missingRelatedBoard); expect(missingRelatedBoard.statusCode).toBe(404);
    enqueue("community_publications", { data: { remix_allowed: true, remix_count: null, boards: [{ title: null, liveblocks_room_id: "board:public" }] } }, { error: null });
    const remixFallbacks = response(); await handler(request("POST", { action: "remix-community", boardId: "board" }), remixFallbacks); expect(remixFallbacks.statusCode).toBe(201);

    mocks.getAccess.mockResolvedValueOnce(null);
    const missingBoard = response(); await handler(request("POST", { action: "publish-community", boardId: "missing" }), missingBoard); expect(missingBoard.statusCode).toBe(404);
    mocks.getAccess.mockResolvedValueOnce({ role: "editor", board: { title: "Board" } });
    const nonOwner = response(); await handler(request("POST", { action: "publish-community", boardId: "board" }), nonOwner); expect(nonOwner.statusCode).toBe(403);
    enqueue("community_publications", { error: new Error("unpublish failed") });
    const unpublishError = response(); await handler(request("POST", { action: "unpublish-community", boardId: "board" }), unpublishError); expect(unpublishError.statusCode).toBe(500);
    enqueue("community_publications", { error: new Error("publish failed") });
    const publishError = response(); await handler(request("POST", { action: "publish-community", boardId: "board", slug: "", tags: [42, "  ", "Tag"], remixAllowed: false }), publishError); expect(publishError.statusCode).toBe(500);
    enqueue("community_publications", { data: { board_id: "board", slug: "board" } });
    const tagDefaults = response(); await handler(request("POST", { action: "publish-community", boardId: "board", tags: "tag" }), tagDefaults); expect(tagDefaults.statusCode).toBe(201);
  });

  it("covers account lifecycle write errors and semantic status mapping", async () => {
    mocks.rpc.mockImplementation(async (name: string) => name === "schedule_kumo_account_deletion"
      ? { data: null, error: new Error("deletion failed") }
      : { data: { allowed: true, remaining: 20 }, error: null });
    const deletionError = response(); await handler(request("POST", { action: "request-account-deletion" }), deletionError); expect(deletionError.statusCode).toBe(500);
    mocks.rpc.mockImplementation(async (name: string) => name === "cancel_kumo_account_deletion"
      ? { data: null, error: new Error("cancel failed") }
      : { data: { allowed: true, remaining: 20 }, error: null });
    const cancelError = response(); await handler(request("POST", { action: "cancel-account-deletion" }), cancelError); expect(cancelError.statusCode).toBe(500);

    mocks.requireActor.mockRejectedValueOnce(Object.assign(new Error("Invitation is unavailable."), { name: "NotFound" }));
    const notFound = response(); await handler(request("GET"), notFound); expect(notFound.statusCode).toBe(404);
    mocks.requireActor.mockRejectedValueOnce(new Error("Resolve conflict before leaving."));
    const conflict = response(); await handler(request("GET"), conflict); expect(conflict.statusCode).toBe(409);
    mocks.requireActor.mockRejectedValueOnce(new Error("Invalid value required."));
    const invalid = response(); await handler(request("GET"), invalid); expect(invalid.statusCode).toBe(400);
  });
});
