import type { VercelRequest, VercelResponse } from "@vercel/node";
import handler from "../../server/api/handlers/platform";

const mocks = vi.hoisted(() => ({
  requireActor: vi.fn(), ensureProfile: vi.fn(), from: vi.fn(), rpc: vi.fn(), getAccess: vi.fn(), listBoards: vi.fn(), searchBoards: vi.fn(),
  provisionBoard: vi.fn(), getDocument: vi.fn(), sendEmail: vi.fn(), revokeTokens: vi.fn(),
  queues: new Map<string, Array<{ data?: unknown; error: unknown }>>(), calls: [] as Array<{ table: string; operation: string; value?: unknown }>,
}));

vi.mock("../../server/api/_auth", () => ({ requireActor: mocks.requireActor }));
vi.mock("../../server/api/_supabase", () => ({ ensureActorProfile: mocks.ensureProfile, supabaseAdmin: () => ({ from: mocks.from, rpc: mocks.rpc }) }));
vi.mock("../../server/api/_boards", () => ({ getBoardAccess: mocks.getAccess, listBoardsForUser: mocks.listBoards, searchPublicBoards: mocks.searchBoards, provisionBoard: mocks.provisionBoard }));
vi.mock("../../server/api/_liveblocks", () => ({ liveblocksAdmin: () => ({ getStorageDocument: mocks.getDocument }) }));
vi.mock("../../server/api/_email", () => ({ sendInvitationEmail: mocks.sendEmail }));
vi.mock("../../server/api/_firebaseAdmin", () => ({ privilegedAdminAuth: () => ({ revokeRefreshTokens: mocks.revokeTokens }) }));

const next = (table: string) => mocks.queues.get(table)?.shift() ?? { data: null, error: null };
const query = (table: string) => {
  const builder: Record<string, unknown> = {};
  const chain = (operation: string) => (...args: unknown[]) => { mocks.calls.push({ table, operation, value: args[0] }); return builder; };
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
    mocks.provisionBoard.mockResolvedValue({ id: "remix" }); mocks.sendEmail.mockResolvedValue("link-only"); mocks.revokeTokens.mockResolvedValue(undefined);
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
  });

  it("refreshes pending workspace invitations atomically and transfers ownership transactionally", async () => {
    mocks.rpc.mockImplementation(async (name: string) => ({
      data: name === "consume_kumo_rate_limit" ? { allowed: true, remaining: 29 }
        : name === "create_or_refresh_kumo_workspace_invitation" ? { id: "invite", email: "new@example.com", role: "member", status: "pending", expires_at: "later", created_at: "now" }
          : null,
      error: null,
    }));
    enqueue("workspace_members", { data: { role: "owner" } }, { data: { workspace_id: "workspace", role: "owner", workspaces: { id: "workspace", name: "Studio", owner_id: "owner" } } });
    enqueue("profiles", { data: null });
    const invited = response();
    await handler(request("POST", { action: "invite-workspace-member", workspaceId: "workspace", email: "NEW@example.com", role: "member" }), invited);
    expect(invited.statusCode).toBe(202);
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
    enqueue("community_publications", { data: { board_id: "board" } }); enqueue("community_reports", { error: null }); const reported = response(); await handler(request("POST", { action: "report-community", boardId: "board", reason: "Misleading preview" }), reported); expect(reported.body).toEqual({ reported: true });
    enqueue("community_publications", { data: { remix_allowed: true, remix_count: 2, boards: { title: "Published board", liveblocks_room_id: "board:public" } } }, { error: null });
    mocks.getAccess.mockClear();
    const remixed = response(); await handler(request("POST", { action: "remix-community", boardId: "board" }), remixed); expect(remixed.body).toEqual({ boardId: "remix" });
    expect(mocks.getAccess).not.toHaveBeenCalled();
    expect(mocks.getDocument).toHaveBeenCalledWith("board:public", "json");
  });

  it("exports account data, revokes sessions, and schedules or cancels deletion", async () => {
    enqueue("account_notifications", { data: [] }); enqueue("friendships", { data: [] }); enqueue("audit_events", { data: [] });
    const exported = response(); await handler(request("GET", {}, { scope: "account-export" }), exported); expect(exported.body).toEqual(expect.objectContaining({ profile: expect.objectContaining({ uid: "owner" }), boards: [] }));
    enqueue("audit_events", { error: null }); const sessions = response(); await handler(request("POST", { action: "revoke-sessions" }), sessions); expect(sessions.body).toEqual({ revoked: true }); expect(mocks.revokeTokens).toHaveBeenCalledWith("owner");
    enqueue("account_deletion_requests", { data: { requested_at: "now", scheduled_for: "later" } }); const deletion = response(); await handler(request("POST", { action: "request-account-deletion" }), deletion); expect(deletion.statusCode).toBe(202);
    enqueue("account_deletion_requests", { error: null }); const cancel = response(); await handler(request("POST", { action: "cancel-account-deletion" }), cancel); expect(cancel.body).toEqual({ cancelled: true });
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
    enqueue("community_publications", { data: [{ board_id: "community", slug: "design-community", description: "Design reference", boards: { title: "Community design" } }] });
    const search = response();
    await handler(request("GET", {}, { scope: "global-search", q: "design" }), search);
    expect((search.body as { results: Array<{ kind: string }> }).results.map((item) => item.kind)).toEqual(["board", "board", "profile", "template", "community"]);

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

    enqueue("community_publications", { data: [{ board_id: "board", slug: "board" }] });
    const community = response(); await handler(request("GET", {}, { scope: "community" }), community);
    expect(community.body).toEqual({ publications: [{ board_id: "board", slug: "board" }] });
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
});
