import type { VercelRequest, VercelResponse } from "@vercel/node";
import productHandler from "../../server/api/handlers/product";

const mocks = vi.hoisted(() => ({
  actor: { uid: "actor", email: "actor@example.com" },
  requireActor: vi.fn(),
  ensureProfile: vi.fn(),
  getAccess: vi.fn(),
  provisionBoard: vi.fn(),
  getDocument: vi.fn(),
  replaceDocument: vi.fn(),
  withLease: vi.fn(),
  sendPreferredPush: vi.fn(),
  queues: new Map<string, Array<{ data?: unknown; error: unknown }>>(),
  calls: [] as Array<{ table: string; operation: string; value?: unknown }>,
}));

vi.mock("../../server/api/_auth", () => ({ requireActor: mocks.requireActor }));
vi.mock("../../server/api/_supabase", () => ({
  ensureActorProfile: mocks.ensureProfile,
  supabaseAdmin: () => ({ from: (table: string) => query(table) }),
}));
vi.mock("../../server/api/_boards", () => ({
  getBoardAccess: mocks.getAccess,
  provisionBoard: mocks.provisionBoard,
}));
vi.mock("../../server/api/_liveblocks", () => ({
  boardDocumentFromJson: (document: unknown) => document,
  liveblocksAdmin: () => ({ getStorageDocument: mocks.getDocument }),
}));
vi.mock("../../server/api/_documentMutation", () => ({
  withDocumentLease: mocks.withLease,
  replaceStorageDocument: mocks.replaceDocument,
}));
vi.mock("../../server/api/_push", () => ({ sendPreferredPushToUser: mocks.sendPreferredPush }));

const nextResult = (table: string) => mocks.queues.get(table)?.shift() ?? { data: null, error: null };

const query = (table: string) => {
  const builder: Record<string, unknown> = {};
  const chain = (operation: string) => (...args: unknown[]) => {
    mocks.calls.push({ table, operation, value: args[0] });
    return builder;
  };
  ["select", "eq", "or", "order", "limit", "in", "is", "update", "upsert", "insert", "delete"].forEach((operation) => {
    builder[operation] = chain(operation);
  });
  builder.single = () => Promise.resolve(nextResult(table));
  builder.maybeSingle = () => Promise.resolve(nextResult(table));
  builder.then = (resolve: (result: unknown) => unknown, reject: (reason: unknown) => unknown) => Promise.resolve(nextResult(table)).then(resolve, reject);
  return builder;
};

const enqueue = (table: string, ...results: Array<{ data?: unknown; error?: unknown }>) => {
  mocks.queues.set(table, results.map((result) => ({ data: result.data, error: result.error ?? null })));
};

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

const request = (method: string, body: Record<string, unknown> = {}, queryValues: Record<string, string> = {}) => ({
  method,
  body,
  query: queryValues,
  headers: { authorization: "Bearer token" },
} as unknown as VercelRequest);

const board = {
  id: "board",
  owner_id: "actor",
  title: "Product",
  visibility: "private",
  liveblocks_room_id: "board:board",
};

describe("product API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.queues.clear();
    mocks.calls.length = 0;
    mocks.requireActor.mockResolvedValue(mocks.actor);
    mocks.ensureProfile.mockResolvedValue({ uid: "actor", displayName: "Alex", email: "actor@example.com" });
    mocks.getAccess.mockResolvedValue({ role: "owner", board });
    mocks.getDocument.mockResolvedValue({ nodes: {} });
    mocks.withLease.mockImplementation(async (_database: unknown, _roomId: string, operation: () => Promise<unknown>) => operation());
    mocks.replaceDocument.mockImplementation(async ({ commit }: { commit: () => Promise<void> }) => commit());
    mocks.sendPreferredPush.mockResolvedValue({ delivered: 1, subscriptions: 1, skipped: false });
  });

  it("builds a permission-aware graph with private titles, backlinks, and link health", async () => {
    enqueue("board_links", { data: [
      { source_board_id: "board", target_board_id: "destination", shape_id: "link-out" },
      { source_board_id: "source", target_board_id: "board", shape_id: "link-in" },
    ] });
    enqueue("boards", { data: [
      { id: "board", title: "Product", visibility: "private", owner_id: "actor" },
      { id: "destination", title: "Secret", visibility: "private", owner_id: "other" },
      { id: "source", title: "Public source", visibility: "public", owner_id: "other" },
    ] });
    enqueue("board_members", { data: [{ board_id: "board", role: "owner" }] });
    const result = response();
    await productHandler(request("GET", {}, { scope: "graph", boardId: "board" }), result);
    expect(result.statusCode).toBe(200);
    expect(result.body).toMatchObject({ graph: {
      sourceId: "board",
      nodes: expect.arrayContaining([
        expect.objectContaining({ id: "destination", title: "Private board", accessible: false }),
        expect.objectContaining({ id: "source", title: "Public source", accessible: true }),
      ]),
      incoming: [{ sourceId: "source", targetId: "board", shapeId: "link-in" }],
    } });
  });

  it("creates a first workspace and returns its folders and personal organization", async () => {
    enqueue("workspace_members", { data: null }, { error: null });
    enqueue("workspaces", { data: { id: "workspace", name: "Alex's workspace", owner_id: "actor" } });
    enqueue("workspace_folders", { data: [{ id: "folder", name: "Archive" }] });
    enqueue("board_organization", { data: [{ board_id: "board", favorite: true }] });
    const result = response();
    await productHandler(request("GET"), result);
    expect(result.statusCode).toBe(200);
    expect(result.body).toMatchObject({
      workspace: { workspace_id: "workspace", role: "owner" },
      folders: [{ id: "folder", name: "Archive" }],
      organization: [{ board_id: "board", favorite: true }],
    });
    expect(mocks.calls).toContainEqual(expect.objectContaining({ table: "workspace_members", operation: "insert" }));
  });

  it("reviews and applies a permitted library update under a document lease", async () => {
    enqueue("design_libraries", { data: { id: "library", latest_version: 3, visibility: "public", owner_id: "other" } });
    enqueue("design_library_versions", { data: { version: 3, assets: [{ id: "source", librarySourceId: "source", type: "rectangle" }] } });
    enqueue("design_library_subscriptions", { error: null });
    mocks.getDocument.mockResolvedValue({ nodes: { local: { id: "local", libraryId: "library", librarySourceId: "source", type: "ellipse" } } });
    const result = response();
    await productHandler(request("POST", { action: "apply-library", boardId: "board", libraryId: "library" }), result);
    expect(result.statusCode).toBe(200);
    expect(result.body).toMatchObject({ applied: true, version: 3, diff: [{ sourceId: "source", status: "changed" }] });
    expect(mocks.withLease).toHaveBeenCalledWith(expect.anything(), "board:board", expect.any(Function));
    expect(mocks.replaceDocument).toHaveBeenCalledWith(expect.objectContaining({ roomId: "board:board" }));
    expect(mocks.calls).toContainEqual(expect.objectContaining({ table: "design_library_subscriptions", operation: "upsert" }));
  });

  it("creates hashed, domain-governed share links without returning stored secrets", async () => {
    enqueue("board_share_links", { data: { id: "link", role: "editor", allowed_domain: "example.com", expires_at: null } });
    const result = response();
    await productHandler(request("POST", {
      action: "create-share-link",
      boardId: "board",
      role: "editor",
      allowedDomain: "@Example.com",
    }), result);
    expect(result.statusCode).toBe(201);
    expect(result.body).toMatchObject({ link: { id: "link", allowed_domain: "example.com" }, token: expect.any(String) });
    const inserted = mocks.calls.find((call) => call.table === "board_share_links" && call.operation === "insert")?.value as Record<string, unknown>;
    expect(inserted.token_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(inserted.token_hash).not.toBe((result.body as { token: string }).token);
  });

  it("lists notifications, libraries, templates, access requests, and governed links", async () => {
    enqueue("account_notifications", { data: [{ id: "notice", title: "Mentioned" }] });
    const notifications = response();
    await productHandler(request("GET", {}, { scope: "notifications" }), notifications);
    expect(notifications.body).toEqual({ notifications: [{ id: "notice", title: "Mentioned" }] });

    enqueue("design_libraries", { data: [{ id: "library", visibility: "public" }] });
    enqueue("design_library_subscriptions", { data: [{ library_id: "library", accepted_version: 1 }] });
    const libraries = response();
    await productHandler(request("GET", {}, { scope: "libraries", boardId: "board" }), libraries);
    expect(libraries.body).toEqual({
      libraries: [{ id: "library", visibility: "public" }],
      subscriptions: [{ library_id: "library", accepted_version: 1 }],
    });

    enqueue("board_templates", { data: [{ id: "template", name: "Starter" }] });
    const templates = response();
    await productHandler(request("GET", {}, { scope: "templates" }), templates);
    expect(templates.body).toEqual({ templates: [{ id: "template", name: "Starter" }] });

    enqueue("board_access_requests", { data: [{ id: "request", status: "pending" }] });
    const accessRequests = response();
    await productHandler(request("GET", {}, { scope: "access-requests", boardId: "board" }), accessRequests);
    expect(accessRequests.body).toEqual({ requests: [{ id: "request", status: "pending" }] });

    enqueue("board_share_links", { data: [{ id: "link", revoked_at: null }] });
    const links = response();
    await productHandler(request("GET", {}, { scope: "share-links", boardId: "board" }), links);
    expect(links.body).toEqual({ links: [{ id: "link", revoked_at: null }] });
  });

  it("marks one notification or every unread notification as read", async () => {
    enqueue("account_notifications", { error: null });
    const one = response();
    await productHandler(request("POST", { action: "mark-notification", id: "notice" }), one);
    expect(one.body).toEqual({ updated: true });
    expect(mocks.calls).toContainEqual({ table: "account_notifications", operation: "eq", value: "id" });

    enqueue("account_notifications", { error: null });
    const all = response();
    await productHandler(request("POST", { action: "mark-notification" }), all);
    expect(all.body).toEqual({ updated: true });
  });

  it("creates folders and executes every personal board organization mutation", async () => {
    const membership = { workspace_id: "workspace", role: "owner", workspaces: { id: "workspace", name: "Team" } };
    enqueue("workspace_members", { data: membership });
    enqueue("workspace_folders", { data: { id: "parent" } }, { data: { id: "folder", workspace_id: "workspace", name: "Research" } });
    const folder = response();
    await productHandler(request("POST", { action: "create-folder", name: " Research ", parentId: "parent" }), folder);
    expect(folder.statusCode).toBe(201);
    expect(folder.body).toMatchObject({ folder: { id: "folder", name: "Research" } });
    expect(mocks.calls).toContainEqual(expect.objectContaining({ table: "workspace_folders", operation: "insert", value: expect.objectContaining({ name: "Research", parent_id: "parent" }) }));

    enqueue("workspace_members", { data: membership });
    enqueue("workspace_folders", { data: null });
    const foreignParent = response();
    await productHandler(request("POST", { action: "create-folder", name: "Nested", parentId: "foreign-folder" }), foreignParent);
    expect(foreignParent.statusCode).toBe(404);

    const cases = [
      ["move-board", { folderId: "folder" }, { folder_id: "folder" }],
      ["favorite-board", { favorite: true }, { favorite: true }],
      ["archive-board", {}, { archived_at: expect.any(String), trashed_at: null }],
      ["trash-board", {}, { trashed_at: expect.any(String), archived_at: null }],
      ["restore-board", {}, { archived_at: null, trashed_at: null }],
    ] as const;
    for (const [action, payload, expectedPatch] of cases) {
      enqueue("workspace_members", { data: membership });
      if (action === "move-board") enqueue("workspace_folders", { data: { id: "folder" } });
      enqueue("board_organization", { data: { board_id: "board", action } });
      const reply = response();
      await productHandler(request("POST", { action, boardId: "board", ...payload }), reply);
      expect(reply.statusCode).toBe(200);
      const upsert = mocks.calls.filter((call) => call.table === "board_organization" && call.operation === "upsert").at(-1)?.value;
      expect(upsert).toEqual(expect.objectContaining(expectedPatch));
    }

    enqueue("workspace_members", { data: membership });
    enqueue("workspace_folders", { data: null });
    const foreignFolder = response();
    await productHandler(request("POST", { action: "move-board", boardId: "board", folderId: "foreign-folder" }), foreignFolder);
    expect(foreignFolder.statusCode).toBe(404);
  });

  it("publishes a versioned design library and returns a non-mutating diff", async () => {
    mocks.getDocument.mockResolvedValue({ nodes: {
      component: { id: "component", type: "frame", componentDefinition: true, name: "Button" },
      label: { id: "label", type: "text", parentId: "component", text: "Continue" },
    } });
    enqueue("design_libraries", { data: null }, { error: null });
    enqueue("design_library_versions", { error: null });
    const published = response();
    await productHandler(request("POST", {
      action: "publish-library", boardId: "board", name: "Core", visibility: "public",
      description: "Shared parts", versionDescription: "Initial",
    }), published);
    expect(published.statusCode).toBe(201);
    expect(published.body).toMatchObject({ version: 1, assetCount: 2 });

    enqueue("design_libraries", { data: { id: "library", latest_version: 2, visibility: "public", owner_id: "other" } });
    enqueue("design_library_versions", { data: { version: 2, assets: [{ id: "source", librarySourceId: "source", type: "rectangle" }] } });
    mocks.getDocument.mockResolvedValue({ nodes: {} });
    const diff = response();
    await productHandler(request("POST", { action: "library-diff", boardId: "board", libraryId: "library" }), diff);
    expect(diff.body).toEqual({ version: 2, diff: [{ sourceId: "source", status: "added" }] });
    expect(mocks.replaceDocument).not.toHaveBeenCalled();
  });

  it("creates and instantiates reusable templates through production document paths", async () => {
    const document = { backgroundColor: "#fff", nodes: { one: { id: "one", type: "rectangle" } } };
    mocks.getDocument.mockResolvedValue(document);
    enqueue("board_templates", { data: { id: "template", name: "Wireframe", description: "", visibility: "private" } });
    const created = response();
    await productHandler(request("POST", {
      action: "create-template", boardId: "board", name: "Wireframe", visibility: "private",
    }), created);
    expect(created.statusCode).toBe(201);
    expect(mocks.calls).toContainEqual(expect.objectContaining({
      table: "board_templates", operation: "insert", value: expect.objectContaining({ document }),
    }));

    enqueue("board_templates", { data: { owner_id: "actor", name: "Wireframe", visibility: "private", document } });
    mocks.provisionBoard.mockResolvedValue({ id: "created-board" });
    const instantiated = response();
    await productHandler(request("POST", { action: "instantiate-template", templateId: "template", name: "New board" }), instantiated);
    expect(instantiated.body).toEqual({ boardId: "created-board" });
    expect(mocks.provisionBoard).toHaveBeenCalledWith({ ownerId: "actor", title: "New board", document });
  });

  it("requests access, notifies the owner, and resolves approval into membership", async () => {
    enqueue("boards", { data: { id: "private", owner_id: "owner", title: "Plan" } });
    enqueue("board_access_requests", { data: { id: "request", status: "pending" } });
    enqueue("account_notifications", { error: null });
    const requested = response();
    await productHandler(request("POST", { action: "request-access", boardId: "private", role: "editor", message: "Please" }), requested);
    expect(requested.statusCode).toBe(201);
    expect(mocks.calls).toContainEqual(expect.objectContaining({
      table: "account_notifications", operation: "insert", value: expect.objectContaining({ recipient_id: "owner", kind: "access-request" }),
    }));
    expect(mocks.sendPreferredPush).toHaveBeenCalledWith("owner", "access_changes", expect.objectContaining({ title: "Access requested for Plan" }));

    enqueue("board_access_requests", { data: { id: "request", board_id: "board", requester_id: "collaborator", requested_role: "editor", status: "pending" } }, { error: null });
    enqueue("board_members", { error: null });
    const resolved = response();
    await productHandler(request("POST", { action: "resolve-access", requestId: "request", decision: "approved" }), resolved);
    expect(resolved.body).toEqual({ resolved: true, status: "approved" });
    expect(mocks.calls).toContainEqual(expect.objectContaining({
      table: "board_members", operation: "upsert", value: { board_id: "board", user_id: "collaborator", role: "editor" },
    }));
    expect(mocks.sendPreferredPush).toHaveBeenCalledWith("collaborator", "access_changes", expect.objectContaining({ title: "Board access approved" }));
  });

  it("redeems, revokes, expires, and domain-restricts governed share links", async () => {
    enqueue("board_share_links", { data: { id: "link", board_id: "board", role: "viewer", allowed_domain: "example.com", expires_at: null, revoked_at: null } }, { error: null });
    enqueue("board_members", { error: null });
    const redeemed = response();
    await productHandler(request("POST", { action: "redeem-share-link", token: "secret" }), redeemed);
    expect(redeemed.body).toEqual({ boardId: "board", role: "viewer" });

    enqueue("board_share_links", { data: { id: "link", board_id: "board" } }, { error: null });
    const revoked = response();
    await productHandler(request("POST", { action: "revoke-share-link", linkId: "link" }), revoked);
    expect(revoked.body).toEqual({ revoked: true });

    enqueue("board_share_links", { data: { id: "expired", board_id: "board", role: "viewer", allowed_domain: null, expires_at: new Date(0).toISOString(), revoked_at: null } });
    const expired = response();
    await productHandler(request("POST", { action: "redeem-share-link", token: "expired" }), expired);
    expect(expired.statusCode).toBe(410);

    enqueue("board_share_links", { data: { id: "domain", board_id: "board", role: "viewer", allowed_domain: "other.com", expires_at: null, revoked_at: null } });
    const domain = response();
    await productHandler(request("POST", { action: "redeem-share-link", token: "domain" }), domain);
    expect(domain.statusCode).toBe(403);
  });

  it("enforces product permissions and validates empty publication sources", async () => {
    mocks.getAccess.mockResolvedValueOnce(null);
    const graph = response();
    await productHandler(request("GET", {}, { scope: "graph", boardId: "missing" }), graph);
    expect(graph.statusCode).toBe(404);

    mocks.getAccess.mockResolvedValueOnce({ role: "viewer", board });
    const links = response();
    await productHandler(request("GET", {}, { scope: "share-links", boardId: "board" }), links);
    expect(links.statusCode).toBe(403);

    mocks.getDocument.mockResolvedValueOnce({ nodes: {} });
    const emptyLibrary = response();
    await productHandler(request("POST", { action: "publish-library", boardId: "board" }), emptyLibrary);
    expect(emptyLibrary.statusCode).toBe(400);

    enqueue("board_templates", { data: { owner_id: "other", name: "Private", visibility: "private", document: {} } });
    const privateTemplate = response();
    await productHandler(request("POST", { action: "instantiate-template", templateId: "private" }), privateTemplate);
    expect(privateTemplate.statusCode).toBe(403);
  });

  it("returns structured authentication and unknown-action errors", async () => {
    const unknown = response();
    await productHandler(request("POST", { action: "missing" }), unknown);
    expect(unknown.statusCode).toBe(400);
    mocks.requireActor.mockRejectedValueOnce(new Error("Authentication required."));
    const denied = response();
    await productHandler(request("GET"), denied);
    expect(denied.statusCode).toBe(401);
    expect(denied.body).toEqual({ error: "Authentication required." });
  });

  it("covers library discovery without a board and rejects private or read-only library use", async () => {
    enqueue("design_libraries", { data: [{ id: "public", visibility: "public" }] });
    const discovery = response();
    await productHandler(request("GET", {}, { scope: "libraries" }), discovery);
    expect(discovery.body).toEqual({
      libraries: [{ id: "public", visibility: "public" }],
      subscriptions: [],
    });

    mocks.getAccess.mockResolvedValueOnce({ role: "viewer", board });
    const readOnly = response();
    await productHandler(request("POST", { action: "library-diff", boardId: "board", libraryId: "private" }), readOnly);
    expect(readOnly.statusCode).toBe(403);

    enqueue("design_libraries", { data: { id: "private", latest_version: 1, visibility: "private", owner_id: "other" } });
    const privateLibrary = response();
    await productHandler(request("POST", { action: "library-diff", boardId: "board", libraryId: "private" }), privateLibrary);
    expect(privateLibrary.statusCode).toBe(403);
  });

  it("denies unauthorized product governance mutations", async () => {
    mocks.getAccess.mockResolvedValueOnce({ role: "editor", board });
    const publish = response();
    await productHandler(request("POST", { action: "publish-library", boardId: "board" }), publish);
    expect(publish.statusCode).toBe(403);

    mocks.getAccess.mockResolvedValueOnce({ role: "viewer", board });
    const template = response();
    await productHandler(request("POST", { action: "create-template", boardId: "board" }), template);
    expect(template.statusCode).toBe(403);

    enqueue("board_access_requests", { data: { id: "request", board_id: "board", requester_id: "collaborator", requested_role: "viewer" } });
    mocks.getAccess.mockResolvedValueOnce({ role: "editor", board });
    const resolveAccess = response();
    await productHandler(request("POST", { action: "resolve-access", requestId: "request", decision: "approved" }), resolveAccess);
    expect(resolveAccess.statusCode).toBe(403);

    mocks.getAccess.mockResolvedValueOnce({ role: "viewer", board });
    const createLink = response();
    await productHandler(request("POST", { action: "create-share-link", boardId: "board" }), createLink);
    expect(createLink.statusCode).toBe(403);

    enqueue("board_share_links", { data: { id: "link", board_id: "board" } });
    mocks.getAccess.mockResolvedValueOnce({ role: "editor", board });
    const revokeLink = response();
    await productHandler(request("POST", { action: "revoke-share-link", linkId: "link" }), revokeLink);
    expect(revokeLink.statusCode).toBe(403);
  });

  it("denies self-access requests and persists denied owner reviews without adding membership", async () => {
    enqueue("boards", { data: { id: "board", owner_id: "actor", title: "Owned" } });
    const self = response();
    await productHandler(request("POST", { action: "request-access", boardId: "board" }), self);
    expect(self.statusCode).toBe(400);

    enqueue("board_access_requests", { data: {
      id: "request", board_id: "board", requester_id: "collaborator", requested_role: "editor", status: "pending",
    } }, { error: null });
    const denied = response();
    await productHandler(request("POST", { action: "resolve-access", requestId: "request", decision: "denied" }), denied);
    expect(denied.body).toEqual({ resolved: true, status: "denied" });
    expect(mocks.calls).not.toContainEqual(expect.objectContaining({ table: "board_members", operation: "upsert" }));
    expect(mocks.calls).toContainEqual(expect.objectContaining({
      table: "board_access_requests", operation: "update", value: expect.objectContaining({ status: "denied" }),
    }));
  });

  it("uses safe governed-link defaults and exposes server and method failures", async () => {
    enqueue("board_share_links", { data: { id: "link", role: "viewer", allowed_domain: null, expires_at: null } });
    const defaults = response();
    await productHandler(request("POST", {
      action: "create-share-link", boardId: "board", role: "owner", allowedDomain: " ", expiresAt: "not-a-date",
    }), defaults);
    expect(defaults.statusCode).toBe(201);
    expect(mocks.calls.find((call) => call.table === "board_share_links" && call.operation === "insert")?.value)
      .toEqual(expect.objectContaining({ role: "viewer", allowed_domain: null, expires_at: null }));

    enqueue("account_notifications", { error: new Error("database unavailable") });
    const failed = response();
    await productHandler(request("GET", {}, { scope: "notifications" }), failed);
    expect(failed.statusCode).toBe(500);
    expect(failed.body).toEqual({ error: "database unavailable" });

    const method = response();
    await productHandler(request("DELETE"), method);
    expect(method.statusCode).toBe(405);
  });

  it("surfaces persistence failures from each governed mutation boundary", async () => {
    const invoke = async (table: string, body: Record<string, unknown>, expectedCalls = 1) => {
      enqueue(table, ...Array.from({ length: expectedCalls }, (_, index) => index === expectedCalls - 1
        ? { error: new Error(`${table} unavailable`) }
        : { data: null }));
      const reply = response();
      await productHandler(request("POST", body), reply);
      expect(reply.statusCode).toBe(500);
      expect(reply.body).toEqual({ error: `${table} unavailable` });
    };

    await invoke("account_notifications", { action: "mark-notification" });

    enqueue("workspace_members", { data: { workspace_id: "workspace", role: "owner" } });
    await invoke("workspace_folders", { action: "create-folder", name: "Failure" });

    enqueue("workspace_members", { data: { workspace_id: "workspace", role: "owner" } });
    await invoke("board_organization", { action: "move-board", boardId: "board" });

    mocks.getDocument.mockResolvedValueOnce({ nodes: {
      component: { id: "component", type: "frame", componentDefinition: true },
    } });
    await invoke("design_libraries", { action: "publish-library", boardId: "board" }, 2);

    await invoke("board_templates", { action: "create-template", boardId: "board" });
    await invoke("board_templates", { action: "instantiate-template", templateId: "template" });
    await invoke("boards", { action: "request-access", boardId: "board" });
    await invoke("board_access_requests", { action: "resolve-access", requestId: "request" });
    await invoke("board_share_links", { action: "create-share-link", boardId: "board" });
    await invoke("board_share_links", { action: "revoke-share-link", linkId: "link" });
    await invoke("board_share_links", { action: "redeem-share-link", token: "secret" });
  });

  it("covers graph, workspace, and collection read failures", async () => {
    enqueue("board_links", { error: new Error("links failed") });
    const graphLinksError = response(); await productHandler(request("GET", {}, { scope: "graph", boardId: "board" }), graphLinksError); expect(graphLinksError.statusCode).toBe(500);

    enqueue("board_links", { data: null }); enqueue("boards", { error: new Error("boards failed") }); enqueue("board_members", { data: null });
    const graphBoardsError = response(); await productHandler(request("GET", {}, { scope: "graph", boardId: "board" }), graphBoardsError); expect(graphBoardsError.statusCode).toBe(500);
    enqueue("board_links", { data: null }); enqueue("boards", { data: null }); enqueue("board_members", { error: new Error("members failed") });
    const graphMembersError = response(); await productHandler(request("GET", {}, { scope: "graph", boardId: "board" }), graphMembersError); expect(graphMembersError.statusCode).toBe(500);
    enqueue("board_links", { data: null }); enqueue("boards", { data: [{ id: "board", title: "Board", visibility: "public" }] }); enqueue("board_members", { data: null });
    const graphFallbacks = response(); await productHandler(request("GET", {}, { scope: "graph", boardId: "board" }), graphFallbacks); expect(graphFallbacks.statusCode).toBe(200);

    enqueue("workspace_members", { error: new Error("membership failed") });
    const membershipError = response(); await productHandler(request("GET"), membershipError); expect(membershipError.statusCode).toBe(500);
    enqueue("workspace_members", { data: null }); enqueue("workspaces", { error: new Error("workspace failed") });
    const workspaceError = response(); await productHandler(request("GET"), workspaceError); expect(workspaceError.statusCode).toBe(500);
    enqueue("workspace_members", { data: null }, { error: new Error("member insert failed") }); enqueue("workspaces", { data: { id: "workspace" } });
    const memberInsertError = response(); await productHandler(request("GET"), memberInsertError); expect(memberInsertError.statusCode).toBe(500);

    const membership = { workspace_id: "workspace", role: "owner", workspaces: { id: "workspace" } };
    enqueue("workspace_members", { data: membership }); enqueue("workspace_folders", { error: new Error("folders failed") }); enqueue("board_organization", { data: null });
    const folderError = response(); await productHandler(request("GET"), folderError); expect(folderError.statusCode).toBe(500);
    enqueue("workspace_members", { data: membership }); enqueue("workspace_folders", { data: null }); enqueue("board_organization", { error: new Error("organization failed") });
    const organizationError = response(); await productHandler(request("GET"), organizationError); expect(organizationError.statusCode).toBe(500);
    enqueue("workspace_members", { data: membership }); enqueue("workspace_folders", { data: null }); enqueue("board_organization", { data: null });
    const emptyWorkspace = response(); await productHandler(request("GET"), emptyWorkspace); expect(emptyWorkspace.body).toEqual(expect.objectContaining({ folders: [], organization: [] }));

    enqueue("account_notifications", { data: null });
    const emptyNotifications = response(); await productHandler(request("GET", {}, { scope: "notifications" }), emptyNotifications); expect(emptyNotifications.body).toEqual({ notifications: [] });
  });

  it("covers library, template, access-request, and share-link read boundaries", async () => {
    mocks.getAccess.mockResolvedValueOnce(null);
    const inaccessibleLibraries = response(); await productHandler(request("GET", {}, { scope: "libraries", boardId: "missing" }), inaccessibleLibraries); expect(inaccessibleLibraries.statusCode).toBe(404);
    enqueue("design_libraries", { error: new Error("libraries failed") });
    const libraryError = response(); await productHandler(request("GET", {}, { scope: "libraries" }), libraryError); expect(libraryError.statusCode).toBe(500);
    enqueue("design_libraries", { data: null }); enqueue("design_library_subscriptions", { error: new Error("subscriptions failed") });
    const subscriptionError = response(); await productHandler(request("GET", {}, { scope: "libraries", boardId: "board" }), subscriptionError); expect(subscriptionError.statusCode).toBe(500);
    enqueue("design_libraries", { data: null }); enqueue("design_library_subscriptions", { data: null });
    const emptyLibraries = response(); await productHandler(request("GET", {}, { scope: "libraries", boardId: "board" }), emptyLibraries); expect(emptyLibraries.body).toEqual({ libraries: [], subscriptions: [] });

    enqueue("design_libraries", { error: new Error("library failed") });
    const versionsLibraryError = response(); await productHandler(request("GET", {}, { scope: "library-versions", libraryId: "library" }), versionsLibraryError); expect(versionsLibraryError.statusCode).toBe(500);
    enqueue("design_libraries", { data: null });
    const missingLibrary = response(); await productHandler(request("GET", {}, { scope: "library-versions", libraryId: "library" }), missingLibrary); expect(missingLibrary.statusCode).toBe(404);
    enqueue("design_libraries", { data: { id: "library", source_board_id: "source", owner_id: "other" } }); mocks.getAccess.mockResolvedValueOnce(null);
    const privateLibrary = response(); await productHandler(request("GET", {}, { scope: "library-versions", libraryId: "library" }), privateLibrary); expect(privateLibrary.statusCode).toBe(403);
    enqueue("design_libraries", { data: { id: "library", source_board_id: "source", owner_id: "actor" } }); mocks.getAccess.mockResolvedValueOnce(null); enqueue("design_library_versions", { error: new Error("versions failed") });
    const versionsError = response(); await productHandler(request("GET", {}, { scope: "library-versions", libraryId: "library" }), versionsError); expect(versionsError.statusCode).toBe(500);
    enqueue("design_libraries", { data: { id: "library", source_board_id: "source", owner_id: "actor" } }); mocks.getAccess.mockResolvedValueOnce(null); enqueue("design_library_versions", { data: null });
    const emptyVersions = response(); await productHandler(request("GET", {}, { scope: "library-versions", libraryId: "library" }), emptyVersions); expect(emptyVersions.body).toEqual(expect.objectContaining({ versions: [] }));

    enqueue("board_templates", { data: null }); const emptyTemplates = response(); await productHandler(request("GET", {}, { scope: "templates" }), emptyTemplates); expect(emptyTemplates.body).toEqual({ templates: [] });
    enqueue("board_templates", { error: new Error("templates failed") }); const templateError = response(); await productHandler(request("GET", {}, { scope: "templates" }), templateError); expect(templateError.statusCode).toBe(500);

    mocks.getAccess.mockResolvedValueOnce(null); const noAccessRequests = response(); await productHandler(request("GET", {}, { scope: "access-requests", boardId: "board" }), noAccessRequests); expect(noAccessRequests.statusCode).toBe(403);
    enqueue("board_access_requests", { data: null }); const emptyRequests = response(); await productHandler(request("GET", {}, { scope: "access-requests", boardId: "board" }), emptyRequests); expect(emptyRequests.body).toEqual({ requests: [] });
    enqueue("board_access_requests", { error: new Error("requests failed") }); const requestError = response(); await productHandler(request("GET", {}, { scope: "access-requests", boardId: "board" }), requestError); expect(requestError.statusCode).toBe(500);

    mocks.getAccess.mockResolvedValueOnce(null); const noShareLinks = response(); await productHandler(request("GET", {}, { scope: "share-links", boardId: "board" }), noShareLinks); expect(noShareLinks.statusCode).toBe(403);
    enqueue("board_share_links", { data: null }); const emptyLinks = response(); await productHandler(request("GET", {}, { scope: "share-links", boardId: "board" }), emptyLinks); expect(emptyLinks.body).toEqual({ links: [] });
    enqueue("board_share_links", { error: new Error("share links failed") }); const shareLinkError = response(); await productHandler(request("GET", {}, { scope: "share-links", boardId: "board" }), shareLinkError); expect(shareLinkError.statusCode).toBe(500);
  });

  it("covers folder and board-organization validation and query errors", async () => {
    const membership = { workspace_id: "workspace", role: "owner", workspaces: { id: "workspace" } };
    enqueue("workspace_members", { data: membership }); enqueue("workspace_folders", { error: new Error("parent failed") });
    const parentError = response(); await productHandler(request("POST", { action: "create-folder", parentId: "parent" }), parentError); expect(parentError.statusCode).toBe(500);

    mocks.getAccess.mockResolvedValueOnce(null);
    const malformedBoard = response(); await productHandler(request("POST", { action: "move-board", boardId: 42 }), malformedBoard); expect(malformedBoard.statusCode).toBe(404);
    enqueue("workspace_members", { data: membership }); enqueue("workspace_folders", { error: new Error("folder failed") });
    const folderError = response(); await productHandler(request("POST", { action: "move-board", boardId: "board", folderId: "folder" }), folderError); expect(folderError.statusCode).toBe(500);
  });

  it("covers every design-library publication branch and write failure", async () => {
    const document = { nodes: { component: { id: "component", type: "frame", componentDefinition: true } } };
    mocks.getDocument.mockResolvedValue(document);
    enqueue("design_libraries", { error: new Error("prior failed") });
    const priorError = response(); await productHandler(request("POST", { action: "publish-library", boardId: 42 }), priorError); expect(priorError.statusCode).toBe(500);

    enqueue("design_libraries", { data: { id: "library", latest_version: 2 } }); enqueue("design_library_versions", { error: new Error("release lookup failed") });
    const releaseLookupError = response(); await productHandler(request("POST", { action: "publish-library", boardId: "board" }), releaseLookupError); expect(releaseLookupError.statusCode).toBe(500);

    enqueue("design_libraries", { data: { id: "library", latest_version: 2 } }, { error: new Error("library update failed") }); enqueue("design_library_versions", { data: { version: 4 } });
    const libraryUpdateError = response(); await productHandler(request("POST", { action: "publish-library", boardId: "board", releaseStatus: "draft", visibility: "invalid", description: null, versionDescription: null, changelog: ["change"] }), libraryUpdateError); expect(libraryUpdateError.statusCode).toBe(500);

    enqueue("design_libraries", { data: { id: "library", latest_version: 2 } }, { error: null }); enqueue("design_library_versions", { data: { version: 2 } }, { error: new Error("version insert failed") });
    const versionInsertError = response(); await productHandler(request("POST", { action: "publish-library", boardId: "board", releaseStatus: "review", visibility: "workspace", changelog: "change" }), versionInsertError); expect(versionInsertError.statusCode).toBe(500);
  });

  it("approves, deprecates, and rolls back governed library releases", async () => {
    const library = { id: "library", source_board_id: "board", owner_id: "actor", latest_version: 2, name: "Core" };
    enqueue("design_libraries", { error: new Error("library failed") });
    const libraryError = response(); await productHandler(request("POST", { action: "approve-library-release", libraryId: 42, version: 1 }), libraryError); expect(libraryError.statusCode).toBe(500);
    enqueue("design_libraries", { data: { ...library, owner_id: "other" } });
    const foreign = response(); await productHandler(request("POST", { action: "approve-library-release", libraryId: "library", version: 1 }), foreign); expect(foreign.statusCode).toBe(403);
    for (const version of [0, 1.5]) {
      enqueue("design_libraries", { data: library });
      const invalid = response(); await productHandler(request("POST", { action: "approve-library-release", libraryId: "library", version }), invalid); expect(invalid.statusCode).toBe(400);
    }

    enqueue("design_libraries", { data: library }); enqueue("design_library_versions", { error: new Error("target failed") });
    const targetError = response(); await productHandler(request("POST", { action: "rollback-library", libraryId: "library", version: 1 }), targetError); expect(targetError.statusCode).toBe(500);
    for (const target of [null, { version: 1, release_status: "deprecated" }]) {
      enqueue("design_libraries", { data: library }); enqueue("design_library_versions", { data: target });
      const invalidTarget = response(); await productHandler(request("POST", { action: "rollback-library", libraryId: "library", version: 1 }), invalidTarget); expect(invalidTarget.statusCode).toBe(409);
    }
    enqueue("design_libraries", { data: library }, { error: new Error("rollback failed") }); enqueue("design_library_versions", { data: { version: 1, release_status: "published" } });
    const rollbackError = response(); await productHandler(request("POST", { action: "rollback-library", libraryId: "library", version: 1 }), rollbackError); expect(rollbackError.statusCode).toBe(500);

    enqueue("design_libraries", { data: library }); enqueue("design_library_versions", { error: new Error("status failed") });
    const statusError = response(); await productHandler(request("POST", { action: "deprecate-library-release", libraryId: "library", version: 2 }), statusError); expect(statusError.statusCode).toBe(500);
    enqueue("design_libraries", { data: library }, { error: new Error("current failed") }); enqueue("design_library_versions", { error: null });
    const currentError = response(); await productHandler(request("POST", { action: "approve-library-release", libraryId: "library", version: 3 }), currentError); expect(currentError.statusCode).toBe(500);

    enqueue("design_libraries", { data: library }); enqueue("design_library_versions", { error: null }); enqueue("design_library_subscriptions", { error: new Error("subscribers failed") });
    const subscriberError = response(); await productHandler(request("POST", { action: "deprecate-library-release", libraryId: "library", version: 2 }), subscriberError); expect(subscriberError.statusCode).toBe(500);

    enqueue("design_libraries", { data: library }); enqueue("design_library_versions", { error: null }); enqueue("design_library_subscriptions", { data: [{ subscribed_by: "subscriber", board_id: "board" }] }); enqueue("account_notifications", { error: new Error("notice failed") });
    const noticeError = response(); await productHandler(request("POST", { action: "deprecate-library-release", libraryId: "library", version: 2 }), noticeError); expect(noticeError.statusCode).toBe(500);

    enqueue("design_libraries", { data: library }); enqueue("design_library_versions", { error: null }); enqueue("design_library_subscriptions", { data: [{ subscribed_by: "subscriber", board_id: "board" }] }); enqueue("account_notifications", { error: null });
    mocks.sendPreferredPush.mockRejectedValueOnce(new Error("push failed"));
    const deprecated = response(); await productHandler(request("POST", { action: "deprecate-library-release", libraryId: "library", version: 2 }), deprecated); expect(deprecated.statusCode).toBe(200);

    enqueue("design_libraries", { data: library }, { error: null }); enqueue("design_library_versions", { data: { version: 1, release_status: "published" } }); enqueue("design_library_subscriptions", { data: null });
    const rolledBack = response(); await productHandler(request("POST", { action: "rollback-library", libraryId: "library", version: 1 }), rolledBack); expect(rolledBack.statusCode).toBe(200);

    enqueue("design_libraries", { data: library }, { error: null }); enqueue("design_library_versions", { error: null }); enqueue("design_library_subscriptions", { data: null });
    const approved = response(); await productHandler(request("POST", { action: "approve-library-release", libraryId: "library", version: 3 }), approved); expect(approved.statusCode).toBe(200);
  });

  it("covers remaining graph, action, publication, and governance fallbacks", async () => {
    enqueue("board_links", { data: null }); enqueue("boards", { data: null }); enqueue("board_members", { data: null });
    const emptyGraph = response(); await productHandler(request("GET", {}, { scope: "graph", boardId: "board" }), emptyGraph); expect(emptyGraph.statusCode).toBe(200);

    const malformedAction = response(); await productHandler(request("POST", { action: 42 }), malformedAction); expect(malformedAction.statusCode).toBe(400);

    mocks.getDocument.mockResolvedValue({ nodes: { component: { id: "component", type: "frame", componentDefinition: true } } });
    enqueue("design_libraries", { data: null }, { error: null }); enqueue("design_library_versions", { error: null });
    const draft = response(); await productHandler(request("POST", { action: "publish-library", boardId: "board", releaseStatus: "draft", changelog: ["change"] }), draft); expect(draft.statusCode).toBe(201);

    const library = { id: "library", source_board_id: "board", owner_id: "actor", latest_version: 2, name: "Core" };
    for (const action of ["rollback-library", "approve-library-release"] as const) {
      enqueue("design_libraries", { data: library }, ...(action === "rollback-library" ? [{ error: null }] : [{ error: null }]));
      if (action === "rollback-library") enqueue("design_library_versions", { data: { version: 1, release_status: "published" } });
      else enqueue("design_library_versions", { error: null });
      enqueue("design_library_subscriptions", { data: [{ subscribed_by: "subscriber", board_id: "board" }] }); enqueue("account_notifications", { error: null });
      const updated = response(); await productHandler(request("POST", { action, libraryId: "library", version: 1 }), updated); expect(updated.statusCode).toBe(200);
    }
  });

  it("covers library application query and commit failures", async () => {
    enqueue("design_libraries", { error: new Error("library failed") });
    const libraryError = response(); await productHandler(request("POST", { action: "library-diff", boardId: 42, libraryId: 42 }), libraryError); expect(libraryError.statusCode).toBe(500);
    enqueue("design_libraries", { data: { id: "library", latest_version: 1, visibility: "public", owner_id: "other" } }); enqueue("design_library_versions", { error: new Error("version failed") });
    const versionError = response(); await productHandler(request("POST", { action: "library-diff", boardId: "board", libraryId: "library" }), versionError); expect(versionError.statusCode).toBe(500);

    enqueue("design_libraries", { data: { id: "library", latest_version: 1, visibility: "public", owner_id: "other" } }); enqueue("design_library_versions", { data: { version: 1, assets: null } });
    const emptyDiff = response(); await productHandler(request("POST", { action: "library-diff", boardId: "board", libraryId: "library" }), emptyDiff); expect(emptyDiff.body).toEqual({ version: 1, diff: [] });

    enqueue("design_libraries", { data: { id: "library", latest_version: 1, visibility: "public", owner_id: "other" } }); enqueue("design_library_versions", { data: { version: 1, assets: null } }); enqueue("design_library_subscriptions", { error: new Error("subscription failed") });
    const subscriptionError = response(); await productHandler(request("POST", { action: "apply-library", boardId: "board", libraryId: "library" }), subscriptionError); expect(subscriptionError.statusCode).toBe(500);
  });

  it("covers template, access-request, and notification persistence failures", async () => {
    enqueue("board_templates", { data: { id: "template", visibility: "public" } });
    const publicTemplate = response(); await productHandler(request("POST", { action: "create-template", boardId: 42, visibility: "public", description: null }), publicTemplate); expect(publicTemplate.statusCode).toBe(201);
    enqueue("board_templates", { data: { owner_id: "actor", name: "Template", visibility: "private", document: {} } });
    const malformedTemplateId = response(); await productHandler(request("POST", { action: "instantiate-template", templateId: 42 }), malformedTemplateId); expect(malformedTemplateId.statusCode).toBe(201);

    enqueue("boards", { data: { id: "board", owner_id: "owner", title: "Board" } }); enqueue("board_access_requests", { error: new Error("request failed") });
    const requestError = response(); await productHandler(request("POST", { action: "request-access", boardId: 42, role: "viewer", message: null }), requestError); expect(requestError.statusCode).toBe(500);
    enqueue("boards", { data: { id: "board", owner_id: "owner", title: "Board" } }); enqueue("board_access_requests", { data: { id: "request" } }); enqueue("account_notifications", { error: new Error("notice failed") });
    const requestNoticeError = response(); await productHandler(request("POST", { action: "request-access", boardId: "board" }), requestNoticeError); expect(requestNoticeError.statusCode).toBe(500);

    const accessRequest = { id: "request", board_id: "board", requester_id: "collaborator", requested_role: "editor" };
    enqueue("board_access_requests", { data: accessRequest }); enqueue("board_members", { error: new Error("member failed") });
    const memberError = response(); await productHandler(request("POST", { action: "resolve-access", requestId: 42, decision: "approved" }), memberError); expect(memberError.statusCode).toBe(500);
    enqueue("board_access_requests", { data: accessRequest }, { error: new Error("update failed") }); enqueue("board_members", { error: null });
    const updateError = response(); await productHandler(request("POST", { action: "resolve-access", requestId: "request", decision: "approved" }), updateError); expect(updateError.statusCode).toBe(500);
    enqueue("board_access_requests", { data: accessRequest }, { error: null }); enqueue("account_notifications", { error: new Error("notice failed") });
    const resolveNoticeError = response(); await productHandler(request("POST", { action: "resolve-access", requestId: "request", decision: "denied" }), resolveNoticeError); expect(resolveNoticeError.statusCode).toBe(500);
  });

  it("covers governed share-link parsing and membership failures", async () => {
    enqueue("board_share_links", { data: { id: "link", role: "viewer" } });
    const validExpiry = response(); await productHandler(request("POST", { action: "create-share-link", boardId: 42, expiresAt: new Date(Date.now() + 60_000).toISOString() }), validExpiry); expect(validExpiry.statusCode).toBe(201);

    enqueue("board_share_links", { data: { id: "link", board_id: "board" } }, { error: new Error("revoke failed") });
    const revokeError = response(); await productHandler(request("POST", { action: "revoke-share-link", linkId: 42 }), revokeError); expect(revokeError.statusCode).toBe(500);

    enqueue("board_share_links", { data: { id: "link", board_id: "board", role: "viewer", allowed_domain: null, expires_at: null, revoked_at: null } }); enqueue("board_members", { error: new Error("member failed") });
    const memberError = response(); await productHandler(request("POST", { action: "redeem-share-link", token: 42 }), memberError); expect(memberError.statusCode).toBe(500);
  });
});
