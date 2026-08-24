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
});
