import type { VercelRequest, VercelResponse } from "@vercel/node";
import assetsHandler from "../../server/api/handlers/assets";
import boardsHandler from "../../server/api/handlers/boards";

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
  purgeBoard: vi.fn(),
  database: { from: vi.fn(), rpc: vi.fn(), storage: { from: vi.fn() } },
}));

vi.mock("../../server/api/_auth", () => ({ requireActor: mocks.requireActor }));
vi.mock("../../server/api/_supabase", () => ({
  ensureActorProfile: mocks.ensureProfile,
  supabaseAdmin: () => mocks.database,
}));
vi.mock("../../server/api/_boards", () => ({
  getBoardAccess: mocks.getAccess,
  listBoardsForUser: mocks.list,
  searchPublicBoards: mocks.search,
  linkedBoardsForActor: mocks.linkedBoards,
  provisionBoard: mocks.provision,
  boardSummary: (board: Record<string, unknown>, role: string) => ({ id: board.id, role }),
}));
vi.mock("../../server/api/_assets", () => ({
  cloneAssetsToBoard: mocks.cloneAssets,
  documentAssetIds: () => ["asset"],
  rewriteDocumentAssetIds: (document: unknown) => ({ document, rewritten: true }),
}));
vi.mock("../../server/api/_boardLinks", () => ({ syncBoardLinks: mocks.syncLinks }));
vi.mock("../../server/api/_lifecycle", () => ({ purgeBoardResources: mocks.purgeBoard }));
vi.mock("../../server/api/_liveblocks", () => ({
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
    mocks.purgeBoard.mockResolvedValue(undefined);
    mocks.database.rpc.mockImplementation((name: string) => Promise.resolve(
      name === "restore_kumo_board" ? { data: boardRow, error: null }
        : name === "claim_kumo_onboarding" ? { data: true, error: null }
          : { data: null, error: null }
    ));
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
    expect(mocks.search).toHaveBeenCalledWith("cloud", "actor");
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

  it("creates onboarding boards and lists, restores, and audits trashed boards", async () => {
    const onboarding = response();
    await boardsHandler(request("POST", { action: "create-onboarding" }), onboarding);
    expect(onboarding).toMatchObject({ statusCode: 201, body: { linkedBoardId: "board" } });
    expect(mocks.provision).toHaveBeenCalledTimes(2);
    expect(mocks.provision).toHaveBeenCalledWith(expect.objectContaining({ title: "Kumo tour · Linked ideas", document: expect.any(Object) }));
    expect(mocks.provision).toHaveBeenCalledWith(expect.objectContaining({ title: "Welcome to Kumo", document: expect.any(Object) }));
    expect(mocks.syncLinks).toHaveBeenCalledWith("board", expect.any(Object));
    expect(mocks.database.from).toHaveBeenCalledWith("document_snapshots");
    expect(mocks.database.rpc).toHaveBeenCalledWith("complete_kumo_onboarding", { p_user_id: "actor" });

    mocks.database.from.mockImplementationOnce(() => ({
      select: () => ({ eq: () => ({ not: () => ({ order: vi.fn().mockResolvedValue({ data: [boardRow], error: null }) }) }) }),
    }));
    const deleted = response();
    await boardsHandler(request("GET", {}, { scope: "deleted" }), deleted);
    expect(deleted.body).toEqual({ boards: [expect.objectContaining({ id: "board", role: "owner" })] });

    mocks.database.from.mockImplementationOnce(() => ({
      select: () => ({ eq: () => ({ not: () => ({ order: vi.fn().mockResolvedValue({ data: null, error: null }) }) }) }),
    }));
    const emptyTrash = response();
    await boardsHandler(request("GET", {}, { scope: "deleted" }), emptyTrash);
    expect(emptyTrash.body).toEqual({ boards: [] });

    const restored = response();
    await boardsHandler(request("POST", { action: "restore", boardId: "board" }), restored);
    expect(restored).toMatchObject({ statusCode: 200, body: { board: { id: "board" } } });

    mocks.database.rpc.mockResolvedValueOnce({ data: null, error: null });
    const missing = response();
    await boardsHandler(request("POST", { action: "restore", boardId: 42 }), missing);
    expect(missing.statusCode).toBe(404);
  });

  it("reports trash listing and restore persistence failures", async () => {
    mocks.database.from.mockImplementationOnce(() => ({
      select: () => ({ eq: () => ({ not: () => ({ order: vi.fn().mockResolvedValue({ data: null, error: new Error("trash failed") }) }) }) }),
    }));
    const trash = response();
    await boardsHandler(request("GET", {}, { scope: "deleted" }), trash);
    expect(trash.statusCode).toBe(500);

    mocks.database.rpc.mockResolvedValueOnce({ data: null, error: new Error("restore failed") });
    const restore = response();
    await boardsHandler(request("POST", { action: "restore", boardId: "board" }), restore);
    expect(restore.statusCode).toBe(500);
  });

  it("enforces first-run onboarding and rolls back every provisioned board when setup fails", async () => {
    mocks.database.rpc.mockResolvedValueOnce({ data: false, error: null });
    const existing = response();
    await boardsHandler(request("POST", { action: "create-onboarding" }), existing);
    expect(existing.statusCode).toBe(409);
    expect(mocks.provision).not.toHaveBeenCalled();

    mocks.list.mockResolvedValueOnce([]);
    mocks.syncLinks.mockRejectedValueOnce(new Error("links failed"));
    const failed = response();
    await boardsHandler(request("POST", { action: "create-onboarding" }), failed);
    expect(failed.statusCode).toBe(500);
    expect(mocks.purgeBoard).toHaveBeenCalledTimes(2);
    expect(mocks.database.rpc).toHaveBeenCalledWith("release_kumo_onboarding", { p_user_id: "actor" });

    mocks.list.mockResolvedValueOnce([]);
    mocks.database.from.mockImplementationOnce(() => ({ insert: vi.fn().mockResolvedValue({ error: new Error("snapshot failed") }) }));
    const snapshot = response();
    await boardsHandler(request("POST", { action: "create-onboarding" }), snapshot);
    expect(snapshot.statusCode).toBe(500);
  });

  it("surfaces onboarding claim and completion failures without retaining partial boards", async () => {
    mocks.database.rpc.mockResolvedValueOnce({ data: null, error: new Error("claim failed") });
    const claim = response();
    await boardsHandler(request("POST", { action: "create-onboarding" }), claim);
    expect(claim.statusCode).toBe(500);
    expect(mocks.provision).not.toHaveBeenCalled();

    mocks.database.rpc
      .mockResolvedValueOnce({ data: true, error: null })
      .mockResolvedValueOnce({ data: null, error: new Error("completion failed") })
      .mockResolvedValueOnce({ data: null, error: null });
    const completion = response();
    await boardsHandler(request("POST", { action: "create-onboarding" }), completion);
    expect(completion.statusCode).toBe(500);
    expect(mocks.purgeBoard).toHaveBeenCalledTimes(2);

    mocks.purgeBoard.mockRejectedValue(new Error("cleanup unavailable"));
    mocks.syncLinks.mockRejectedValueOnce(new Error("setup failed"));
    const cleanupFailure = response();
    await boardsHandler(request("POST", { action: "create-onboarding" }), cleanupFailure);
    expect(cleanupFailure.statusCode).toBe(500);
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
    mocks.getAccess.mockResolvedValueOnce(null);
    const malformed = response();
    await boardsHandler(request("PATCH", { boardId: 42 }), malformed);
    expect(malformed.statusCode).toBe(404);
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

  it("handles board read and settings persistence failures", async () => {
    mocks.getAccess.mockResolvedValueOnce(null);
    const missingDetail = response();
    await boardsHandler(request("GET", {}, { id: "missing" }), missingDetail);
    expect(missingDetail.statusCode).toBe(404);

    mocks.database.from.mockImplementationOnce(() => ({
      select: () => ({ eq: vi.fn().mockResolvedValue({ data: null, error: new Error("members failed") }) }),
    }));
    const memberError = response();
    await boardsHandler(request("GET", {}, { id: "board" }), memberError);
    expect(memberError.statusCode).toBe(500);

    mocks.database.from.mockImplementationOnce(() => ({
      select: () => ({ eq: vi.fn().mockResolvedValue({ data: null, error: null }) }),
    }));
    const noMembers = response();
    await boardsHandler(request("GET", {}, { id: "board" }), noMembers);
    expect(noMembers.body).toMatchObject({ board: { members: {} } });

    const invalidPatch = response();
    await boardsHandler(request("PATCH", { boardId: "board", visibility: "team" }), invalidPatch);
    expect(invalidPatch.statusCode).toBe(400);

    const privatePatch = response();
    await boardsHandler(request("PATCH", { boardId: "board", visibility: "private" }), privatePatch);
    expect(privatePatch.statusCode).toBe(200);

    mocks.database.rpc.mockResolvedValueOnce({ error: new Error("delete failed") });
    const deleteError = response();
    await boardsHandler(request("DELETE", { boardId: "board" }), deleteError);
    expect(deleteError.statusCode).toBe(500);

    mocks.database.from.mockImplementationOnce(() => ({
      update: () => ({ eq: () => ({ eq: () => ({ select: () => ({ single: vi.fn().mockResolvedValue({ data: null, error: new Error("update failed") }) }) }) }) }),
    }));
    const updateError = response();
    await boardsHandler(request("PATCH", { boardId: "board", title: "New" }), updateError);
    expect(updateError.statusCode).toBe(500);

    mocks.requireActor.mockRejectedValueOnce("offline");
    const fallback = response();
    await boardsHandler(request("GET"), fallback);
    expect(fallback).toMatchObject({ statusCode: 500, body: { error: "The board request failed." } });
  });

  it("covers duplicate validation, empty titles, and transactional cleanup", async () => {
    const untitled = response();
    await boardsHandler(request("POST", { title: 42 }), untitled);
    expect(mocks.provision).toHaveBeenLastCalledWith({ ownerId: "actor", title: "Untitled board" });

    const blank = response();
    await boardsHandler(request("POST", { title: "   " }), blank);
    expect(mocks.provision).toHaveBeenLastCalledWith({ ownerId: "actor", title: "Untitled board" });

    mocks.getAccess.mockResolvedValueOnce(null);
    const malformedDuplicate = response();
    await boardsHandler(request("POST", { action: "duplicate", boardId: 42 }), malformedDuplicate);
    expect(malformedDuplicate.statusCode).toBe(404);

    mocks.cloneAssets.mockResolvedValueOnce(new Map());
    const noAssets = response();
    await boardsHandler(request("POST", { action: "duplicate", boardId: "board" }), noAssets);
    expect(noAssets.statusCode).toBe(201);

    const remove = vi.fn().mockRejectedValue(new Error("storage cleanup failed"));
    mocks.database.storage.from.mockReturnValueOnce({ remove });
    mocks.database.from.mockImplementation((table: string) => table === "assets" ? {
      select: () => ({ eq: vi.fn().mockResolvedValue({ data: [{ storage_key: "board/copy.png" }], error: null }) }),
    } : {
      delete: () => ({ eq: vi.fn().mockResolvedValue({ error: null }) }),
    });
    mocks.cloneAssets.mockRejectedValueOnce(new Error("clone failed"));
    mocks.deleteRoom.mockRejectedValueOnce(new Error("room cleanup failed"));
    const cleaned = response();
    await boardsHandler(request("POST", { action: "duplicate", boardId: "board" }), cleaned);
    expect(cleaned.statusCode).toBe(500);
    expect(remove).toHaveBeenCalledWith(["board/copy.png"]);
    expect(mocks.deleteRoom).toHaveBeenCalled();

    mocks.database.from.mockImplementation((table: string) => table === "assets" ? {
      select: () => ({ eq: vi.fn().mockResolvedValue({ data: null, error: null }) }),
    } : {
      delete: () => ({ eq: vi.fn().mockResolvedValue({ error: null }) }),
    });
    mocks.syncLinks.mockRejectedValueOnce(new Error("link sync failed"));
    const cleanedWithoutAssets = response();
    await boardsHandler(request("POST", { action: "duplicate", boardId: "board" }), cleanedWithoutAssets);
    expect(cleanedWithoutAssets.statusCode).toBe(500);
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

  it("rejects empty uploaded objects and discards invalid media dimensions", async () => {
    storage.list.mockResolvedValueOnce({ data: [{ name: "empty.png", metadata: { mimetype: "image/png", size: 0 } }], error: null });
    const empty = response();
    await assetsHandler(request("POST", { action: "complete", boardId: "board", storageKey: "board/empty.png" }), empty);
    expect(empty.statusCode).toBe(400);
    expect(storage.remove).toHaveBeenCalledWith(["board/empty.png"]);

    storage.list.mockResolvedValueOnce({ data: [{ name: "image.png", metadata: { mimetype: "image/png", size: 4 } }], error: null });
    const invalidDimensions = response();
    await assetsHandler(request("POST", { action: "complete", boardId: "board", storageKey: "board/image.png", width: -10, height: 1_000_000 }), invalidDimensions);
    expect(invalidDimensions.statusCode).toBe(201);
    expect(mocks.database.from).toHaveBeenCalledWith("assets");
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

  it("handles asset lookup, deletion, and storage failures", async () => {
    const queryResult = (data: unknown, error: unknown = null) => ({
      select: () => ({ eq: () => ({ maybeSingle: vi.fn().mockResolvedValue({ data, error }) }) }),
      delete: () => ({ eq: vi.fn().mockResolvedValue({ error: null }) }),
    });

    mocks.database.from.mockReturnValueOnce(queryResult(null, new Error("lookup failed")));
    const lookupError = response();
    await assetsHandler(request("GET", {}, { id: "asset" }), lookupError);
    expect(lookupError).toMatchObject({ statusCode: 500, body: { error: "lookup failed" } });

    mocks.database.from.mockReturnValueOnce(queryResult(null));
    const missing = response();
    await assetsHandler(request("GET", {}, { id: "missing" }), missing);
    expect(missing.statusCode).toBe(404);

    mocks.database.from.mockReturnValueOnce(queryResult(asset));
    mocks.getAccess.mockResolvedValueOnce(null);
    const inaccessible = response();
    await assetsHandler(request("GET", {}, { id: "asset" }), inaccessible);
    expect(inaccessible.statusCode).toBe(404);

    storage.createSignedUrl.mockResolvedValueOnce({ data: null, error: new Error("sign failed") });
    const signError = response();
    await assetsHandler(request("GET", {}, { id: "asset" }), signError);
    expect(signError.statusCode).toBe(500);

    mocks.database.from.mockReturnValueOnce(queryResult(null));
    const missingDelete = response();
    await assetsHandler(request("DELETE", {}, { id: "missing" }), missingDelete);
    expect(missingDelete.statusCode).toBe(404);

    mocks.database.from.mockReturnValueOnce(queryResult(null, new Error("delete lookup failed")));
    const deleteLookupError = response();
    await assetsHandler(request("DELETE", {}, { id: "asset" }), deleteLookupError);
    expect(deleteLookupError.statusCode).toBe(500);

    mocks.getAccess.mockResolvedValueOnce({ board: boardRow, role: "viewer" });
    const viewerDelete = response();
    await assetsHandler(request("DELETE", {}, { id: "asset" }), viewerDelete);
    expect(viewerDelete.statusCode).toBe(403);

    mocks.database.from.mockReturnValueOnce(queryResult({ ...asset, uploader_id: "someone-else" }));
    mocks.getAccess.mockResolvedValueOnce({ board: boardRow, role: "editor" });
    const otherUploader = response();
    await assetsHandler(request("DELETE", {}, { id: "asset" }), otherUploader);
    expect(otherUploader.statusCode).toBe(403);

    storage.remove.mockResolvedValueOnce({ error: new Error("remove failed") });
    const removeError = response();
    await assetsHandler(request("DELETE", {}, { id: "asset" }), removeError);
    expect(removeError.statusCode).toBe(500);

    mocks.database.from.mockImplementationOnce(() => ({
      select: () => ({ eq: () => ({ maybeSingle: vi.fn().mockResolvedValue({ data: asset, error: null }) }) }),
    })).mockImplementationOnce(() => ({
      delete: () => ({ eq: vi.fn().mockResolvedValue({ error: new Error("delete failed") }) }),
    }));
    const deleteError = response();
    await assetsHandler(request("DELETE", {}, { id: "asset" }), deleteError);
    expect(deleteError.statusCode).toBe(500);
  });

  it("validates every asset action boundary and reports write failures", async () => {
    mocks.getAccess.mockResolvedValueOnce(null);
    const missingBoard = response();
    await assetsHandler(request("POST", { action: "prepare", boardId: 42, mimeType: "image/png", byteSize: 4 }), missingBoard);
    expect(missingBoard.statusCode).toBe(404);

    const emptyClone = response();
    await assetsHandler(request("POST", { action: "clone", boardId: "board", assetIds: "asset" }), emptyClone);
    expect(mocks.cloneAssets).toHaveBeenLastCalledWith(expect.objectContaining({ assetIds: [] }));

    const filteredClone = response();
    await assetsHandler(request("POST", { action: "clone", boardId: "board", assetIds: ["asset", 4] }), filteredClone);
    expect(mocks.cloneAssets).toHaveBeenLastCalledWith(expect.objectContaining({ assetIds: ["asset"] }));

    for (const body of [
      { action: "prepare", boardId: "board", mimeType: 4, byteSize: 4 },
      { action: "prepare", boardId: "board", mimeType: "image/png", byteSize: "nope" },
      { action: "prepare", boardId: "board", mimeType: "image/png", byteSize: -1 },
      { action: "prepare", boardId: "board", mimeType: "image/png", byteSize: 21 * 1024 * 1024 },
      { action: "prepare", boardId: "board", mimeType: "video/mp4", byteSize: 101 * 1024 * 1024 },
    ]) {
      const invalid = response();
      await assetsHandler(request("POST", body), invalid);
      expect(invalid.statusCode).toBe(400);
    }

    const video = response();
    await assetsHandler(request("POST", { action: "prepare", boardId: "board", mimeType: "video/mp4", byteSize: 100, fileName: 4 }), video);
    expect(video.statusCode).toBe(200);

    const noExtension = response();
    await assetsHandler(request("POST", { action: "prepare", boardId: "board", mimeType: "image/png", byteSize: 4, fileName: "???" }), noExtension);
    expect(noExtension.statusCode).toBe(200);

    storage.createSignedUploadUrl.mockResolvedValueOnce({ data: null, error: new Error("prepare failed") });
    const prepareError = response();
    await assetsHandler(request("POST", { action: "prepare", boardId: "board", mimeType: "image/png", byteSize: 4 }), prepareError);
    expect(prepareError.statusCode).toBe(500);

    const action = response();
    await assetsHandler(request("POST", { boardId: "board" }), action);
    expect(action.statusCode).toBe(400);

    const traversal = response();
    await assetsHandler(request("POST", { action: "complete", boardId: "board", storageKey: "board/../image.png" }), traversal);
    expect(traversal.statusCode).toBe(400);

    const nonStringPath = response();
    await assetsHandler(request("POST", { action: "complete", boardId: "board", storageKey: 42 }), nonStringPath);
    expect(nonStringPath.statusCode).toBe(400);

    storage.list.mockResolvedValueOnce({ data: null, error: new Error("list failed") });
    const listError = response();
    await assetsHandler(request("POST", { action: "complete", boardId: "board", storageKey: "board/image.png" }), listError);
    expect(listError.statusCode).toBe(500);

    storage.list.mockResolvedValueOnce({ data: [{ name: "different.png" }], error: null });
    const incomplete = response();
    await assetsHandler(request("POST", { action: "complete", boardId: "board", storageKey: "board/image.png" }), incomplete);
    expect(incomplete.statusCode).toBe(409);

    storage.list.mockResolvedValueOnce({ data: [{ name: "image.png", metadata: {} }], error: null });
    const missingMetadata = response();
    await assetsHandler(request("POST", { action: "complete", boardId: "board", storageKey: "board/image.png" }), missingMetadata);
    expect(missingMetadata.statusCode).toBe(400);

    mocks.database.from.mockImplementationOnce(() => ({
      insert: () => ({ select: () => ({ single: vi.fn().mockResolvedValue({ data: null, error: new Error("insert failed") }) }) }),
    }));
    const insertError = response();
    await assetsHandler(request("POST", { action: "complete", boardId: "board", storageKey: "board/image.png" }), insertError);
    expect(insertError.statusCode).toBe(500);

    mocks.requireActor.mockRejectedValueOnce("offline");
    const fallback = response();
    await assetsHandler(request("GET"), fallback);
    expect(fallback).toMatchObject({ statusCode: 500, body: { error: "The asset request failed." } });

    mocks.requireActor.mockRejectedValueOnce(new Error("Authentication required."));
    const unauthenticated = response();
    await assetsHandler(request("GET"), unauthenticated);
    expect(unauthenticated.statusCode).toBe(401);

    const invalidMethod = response();
    await assetsHandler(request("OPTIONS"), invalidMethod);
    expect(invalidMethod.statusCode).toBe(405);
  });
});
