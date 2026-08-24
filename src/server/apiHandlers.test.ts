import type { VercelRequest, VercelResponse } from "@vercel/node";
import assetsHandler from "../../api/assets";
import boardsHandler from "../../api/boards";

const mocks = vi.hoisted(() => ({
  actor: { uid: "actor", email: "actor@example.com" },
  requireActor: vi.fn(),
  ensureProfile: vi.fn(),
  getAccess: vi.fn(),
  list: vi.fn(),
  search: vi.fn(),
  linkedBoards: vi.fn(),
  provision: vi.fn(),
  cloneAssets: vi.fn(),
  syncLinks: vi.fn(),
  getDocument: vi.fn(),
  deleteStorageDocument: vi.fn(),
  initializeStorageDocument: vi.fn(),
  deleteRoom: vi.fn(),
  database: { from: vi.fn(), rpc: vi.fn(), storage: { from: vi.fn() } },
}));

vi.mock("../../api/_auth", () => ({ requireActor: mocks.requireActor }));
vi.mock("../../api/_supabase", () => ({
  ensureActorProfile: mocks.ensureProfile,
  supabaseAdmin: () => mocks.database,
}));
vi.mock("../../api/_boards", () => ({
  getBoardAccess: mocks.getAccess,
  listBoardsForUser: mocks.list,
  searchPublicBoards: mocks.search,
  linkedBoardsForActor: mocks.linkedBoards,
  provisionBoard: mocks.provision,
  boardSummary: (board: Record<string, unknown>, role: string) => ({ id: board.id, role }),
}));
vi.mock("../../api/_assets", () => ({
  cloneAssetsToBoard: mocks.cloneAssets,
  documentAssetIds: () => ["asset"],
  rewriteDocumentAssetIds: (document: unknown) => ({ document, rewritten: true }),
}));
vi.mock("../../api/_boardLinks", () => ({ syncBoardLinks: mocks.syncLinks }));
vi.mock("../../api/_liveblocks", () => ({
  boardDocumentFromJson: (value: unknown) => value,
  liveblocksAdmin: () => ({
    getStorageDocument: mocks.getDocument,
    deleteStorageDocument: mocks.deleteStorageDocument,
    initializeStorageDocument: mocks.initializeStorageDocument,
    deleteRoom: mocks.deleteRoom,
  }),
}));

const response = () => {
  const result = {
    statusCode: 0,
    body: undefined as unknown,
    headers: {} as Record<string, string>,
    status(code: number) { this.statusCode = code; return this; },
    json(body: unknown) { this.body = body; return this; },
    send(body: unknown) { this.body = body; return this; },
    end() { return this; },
    setHeader(name: string, value: string) { this.headers[name] = value; return this; },
  };
  return result as unknown as VercelResponse & typeof result;
};

const request = (method: string, body: Record<string, unknown> = {}, query: Record<string, string> = {}) => ({
  method, body, query, headers: { authorization: "Bearer token" },
} as unknown as VercelRequest);

const boardRow = {
  id: "board", owner_id: "actor", title: "Board", visibility: "private",
  liveblocks_room_id: "board:board", legacy_rtdb_id: null,
  created_at: new Date(0).toISOString(), updated_at: new Date(1).toISOString(), deleted_at: null,
};

describe("boards API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireActor.mockResolvedValue(mocks.actor);
    mocks.ensureProfile.mockResolvedValue(undefined);
    mocks.getAccess.mockResolvedValue({ board: boardRow, role: "owner" });
    mocks.list.mockResolvedValue([{ id: "mine" }]);
    mocks.search.mockResolvedValue([{ id: "public" }]);
    mocks.linkedBoards.mockResolvedValue({ target: { id: "target", title: "Target", visibility: "private", accessible: false, role: null } });
    mocks.provision.mockResolvedValue(boardRow);
    mocks.getDocument.mockResolvedValue({ nodes: {} });
    mocks.cloneAssets.mockResolvedValue(new Map([["asset", "copy"]]));
    mocks.syncLinks.mockResolvedValue(undefined);
    mocks.database.from.mockImplementation((table: string) => table === "board_members" ? {
      select: () => ({ eq: vi.fn().mockResolvedValue({ data: [{ user_id: "actor", role: "owner" }], error: null }) }),
    } : table === "boards" ? {
      update: () => ({ eq: () => ({ eq: () => ({ select: () => ({ single: vi.fn().mockResolvedValue({ data: boardRow, error: null }) }) }) }) }),
      delete: () => ({ eq: vi.fn().mockResolvedValue({ error: null }) }),
    } : { insert: vi.fn().mockResolvedValue({ error: null }) });
    mocks.database.rpc.mockResolvedValue({ error: null });
  });

  it("reads board details, lists owned boards, and searches public boards", async () => {
    const detail = response();
    await boardsHandler(request("GET", {}, { id: "board" }), detail);
    expect(detail.statusCode).toBe(200);
    expect(detail.body).toMatchObject({ board: { id: "board", members: { actor: "owner" }, linkedBoards: { target: { accessible: false } } } });

    const list = response();
    await boardsHandler(request("GET"), list);
    expect(list.body).toEqual({ boards: [{ id: "mine" }] });
    const search = response();
    await boardsHandler(request("GET", {}, { scope: "public", query: "cloud" }), search);
    expect(mocks.search).toHaveBeenCalledWith("cloud");
  });

  it("creates and duplicates complete board documents with cloned assets", async () => {
    const created = response();
    await boardsHandler(request("POST", { title: "  New  " }), created);
    expect(created.statusCode).toBe(201);
    expect(mocks.provision).toHaveBeenCalledWith({ ownerId: "actor", title: "New" });

    const duplicated = response();
    await boardsHandler(request("POST", { action: "duplicate", boardId: "board" }), duplicated);
    expect(mocks.cloneAssets).toHaveBeenCalledWith(expect.objectContaining({ targetBoardId: "board" }));
    expect(mocks.deleteStorageDocument).toHaveBeenCalled();
    expect(mocks.initializeStorageDocument).toHaveBeenCalled();
    expect(mocks.syncLinks).toHaveBeenCalled();
  });

  it("patches and soft-deletes owner boards", async () => {
    const patched = response();
    await boardsHandler(request("PATCH", { boardId: "board", title: "Updated", visibility: "public" }), patched);
    expect(patched.statusCode).toBe(200);
    const deleted = response();
    await boardsHandler(request("DELETE", { boardId: "board" }), deleted);
    expect(deleted.statusCode).toBe(204);
    expect(mocks.database.rpc).toHaveBeenCalledWith("soft_delete_kumo_board", expect.any(Object));
  });

  it("enforces ownership, method, and authentication errors", async () => {
    mocks.getAccess.mockResolvedValueOnce(null);
    const missing = response();
    await boardsHandler(request("PATCH", { boardId: "missing" }), missing);
    expect(missing.statusCode).toBe(404);
    mocks.getAccess.mockResolvedValueOnce({ board: boardRow, role: "editor" });
    const forbidden = response();
    await boardsHandler(request("DELETE", { boardId: "board" }), forbidden);
    expect(forbidden.statusCode).toBe(403);
    const invalid = response();
    await boardsHandler(request("OPTIONS"), invalid);
    expect(invalid.statusCode).toBe(405);
    mocks.requireActor.mockRejectedValueOnce(new Error("Authentication required."));
    const unauthenticated = response();
    await boardsHandler(request("GET"), unauthenticated);
    expect(unauthenticated.statusCode).toBe(401);
  });
});

describe("assets API", () => {
  const asset = {
    id: "asset", board_id: "board", storage_key: "board/image.png", uploader_id: "actor",
    mime_type: "image/png", byte_size: 4, width: 10, height: 10,
  };
  const storage = {
    createSignedUrl: vi.fn(), createSignedUploadUrl: vi.fn(), remove: vi.fn(), list: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireActor.mockResolvedValue(mocks.actor);
    mocks.ensureProfile.mockResolvedValue(undefined);
    mocks.getAccess.mockResolvedValue({ board: boardRow, role: "owner" });
    mocks.cloneAssets.mockResolvedValue(new Map([["asset", "copy"]]));
    storage.createSignedUrl.mockResolvedValue({ data: { signedUrl: "signed" }, error: null });
    storage.createSignedUploadUrl.mockResolvedValue({ data: { path: "board/path", token: "token" }, error: null });
    storage.remove.mockResolvedValue({ error: null });
    storage.list.mockResolvedValue({ data: [{ name: "image.png", metadata: { mimetype: "image/png", size: 4 } }], error: null });
    mocks.database.storage.from.mockReturnValue(storage);
    mocks.database.from.mockImplementation(() => ({
      select: () => ({
        eq: () => ({ maybeSingle: vi.fn().mockResolvedValue({ data: asset, error: null }) }),
      }),
      delete: () => ({ eq: vi.fn().mockResolvedValue({ error: null }) }),
      insert: () => ({ select: () => ({ single: vi.fn().mockResolvedValue({ data: asset, error: null }) }) }),
    }));
  });

  it("gets, prepares, completes, and clones board assets", async () => {
    const fetched = response();
    await assetsHandler(request("GET", {}, { id: "asset" }), fetched);
    expect(fetched.body).toMatchObject({ asset: { id: "asset", url: "signed" } });

    const prepared = response();
    await assetsHandler(request("POST", { action: "prepare", boardId: "board", mimeType: "image/png", byteSize: 4, fileName: "image.png" }), prepared);
    expect(prepared.statusCode).toBe(200);

    const completed = response();
    await assetsHandler(request("POST", { action: "complete", boardId: "board", storageKey: "board/image.png", width: 10, height: 10 }), completed);
    expect(completed.statusCode).toBe(201);

    const cloned = response();
    await assetsHandler(request("POST", { action: "clone", boardId: "board", assetIds: ["asset"] }), cloned);
    expect(cloned.body).toEqual({ assetIds: { asset: "copy" } });
  });

  it("deletes owned assets and validates permissions and upload input", async () => {
    const deleted = response();
    await assetsHandler(request("DELETE", {}, { id: "asset" }), deleted);
    expect(deleted.statusCode).toBe(204);
    expect(storage.remove).toHaveBeenCalledWith(["board/image.png"]);

    mocks.getAccess.mockResolvedValueOnce({ board: boardRow, role: "viewer" });
    const viewer = response();
    await assetsHandler(request("POST", { action: "prepare", boardId: "board", mimeType: "image/png", byteSize: 4 }), viewer);
    expect(viewer.statusCode).toBe(403);

    const invalid = response();
    await assetsHandler(request("POST", { action: "prepare", boardId: "board", mimeType: "text/plain", byteSize: 4 }), invalid);
    expect(invalid.statusCode).toBe(400);
    const path = response();
    await assetsHandler(request("POST", { action: "complete", boardId: "board", storageKey: "other/image.png" }), path);
    expect(path.statusCode).toBe(400);
  });
});
