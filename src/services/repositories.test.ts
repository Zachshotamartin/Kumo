import { createClient } from "@supabase/supabase-js";
import { authenticatedFetch, authenticatedRequest } from "./apiClient";
import {
  createBoard,
  deleteBoard,
  duplicateBoard,
  getBoard,
  loadBoardPreview,
  listBoards,
  searchPublicBoards,
  updateBoardSettings,
} from "./boardRepository";
import {
  cloneBoardAssets,
  deleteBoardAsset,
  resolveAssetUrl,
  uploadBoardImage,
} from "./assetRepository";
import { ensureUserProfile } from "./userRepository";

vi.mock("./apiClient", () => ({ authenticatedFetch: vi.fn(), authenticatedRequest: vi.fn() }));
vi.mock("@supabase/supabase-js", () => ({ createClient: vi.fn() }));

const board = {
  id: "board",
  title: "Board",
  ownerId: "owner",
  visibility: "private" as const,
  roomId: "board:board",
  role: "owner" as const,
  updatedAt: 10,
  members: { owner: "owner" as const, editor: "editor" as const },
  linkedBoards: { target: { id: "target", title: "Private", visibility: "private" as const, accessible: false, role: null } },
};

describe("board repositories", () => {
  beforeEach(() => vi.clearAllMocks());

  it("lists and searches board summaries", async () => {
    vi.mocked(authenticatedFetch).mockResolvedValue({ boards: [board] });
    await expect(listBoards()).resolves.toEqual([board]);
    await expect(searchPublicBoards("  ")).resolves.toEqual([]);
    await expect(searchPublicBoards("cloud map")).resolves.toEqual([board]);
    expect(authenticatedFetch).toHaveBeenLastCalledWith(
      "/api/boards?scope=public&query=cloud%20map"
    );
  });

  it("retries transient read timeouts without retrying mutations", async () => {
    const aborted = Object.assign(new Error("timed out"), { name: "AbortError" });
    vi.mocked(authenticatedFetch).mockRejectedValueOnce(aborted).mockResolvedValueOnce({ boards: [board] });
    await expect(listBoards()).resolves.toEqual([board]);
    expect(authenticatedFetch).toHaveBeenCalledTimes(2);
  });

  it("maps a board summary into editor state", async () => {
    vi.mocked(authenticatedFetch).mockResolvedValue({ board });
    await expect(getBoard("board")).resolves.toMatchObject({
      id: "board",
      sharedWith: ["editor"],
      backGroundColor: "#252629",
      linkedBoards: { target: expect.objectContaining({ accessible: false }) },
    });
    vi.mocked(authenticatedFetch).mockResolvedValueOnce({ board: { ...board, members: undefined, linkedBoards: undefined } });
    await expect(getBoard("minimal")).resolves.toMatchObject({ members: { owner: "owner" }, sharedWith: [], linkedBoards: {} });
  });

  it("migrates a legacy board only after a not-found response", async () => {
    vi.mocked(authenticatedFetch)
      .mockRejectedValueOnce(new Error("Board not found"))
      .mockResolvedValueOnce({ migrated: true, boardId: "legacy" })
      .mockResolvedValueOnce({ board: { ...board, id: "legacy" } });
    await expect(getBoard("legacy")).resolves.toMatchObject({ id: "legacy" });
    expect(authenticatedFetch).toHaveBeenNthCalledWith(2, "/api/migrate-board", {
      method: "POST",
      body: JSON.stringify({ boardId: "legacy" }),
    });
  });

  it("does not migrate unrelated or non-error board failures", async () => {
    vi.mocked(authenticatedFetch).mockRejectedValueOnce(new Error("offline"));
    await expect(getBoard("board")).rejects.toThrow("offline");
    vi.mocked(authenticatedFetch).mockRejectedValueOnce("offline");
    await expect(getBoard("board")).rejects.toBe("offline");
  });

  it("honors already-aborted and newly-aborted preview signals", async () => {
    const already = new AbortController(); already.abort();
    await expect(loadBoardPreview("board", already.signal)).rejects.toMatchObject({ name: "AbortError" });
    const active = new AbortController();
    vi.mocked(authenticatedRequest).mockImplementationOnce((_url, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true });
    }));
    const pending = loadBoardPreview("board", active.signal);
    active.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  });

  it("creates, duplicates, updates, and deletes boards", async () => {
    vi.mocked(authenticatedFetch).mockResolvedValue({ board });
    await expect(createBoard("New")).resolves.toBe("board");
    await expect(duplicateBoard("source")).resolves.toBe("board");
    await expect(updateBoardSettings("board", { visibility: "public" })).resolves.toBe(board);
    await expect(deleteBoard("board")).resolves.toBeUndefined();
    expect(authenticatedFetch).toHaveBeenCalledTimes(4);
  });

  it("limits, signs, and completes board preview requests without blocking navigation", async () => {
    const releases: Array<() => void> = [];
    const previewResponse = { blob: vi.fn().mockResolvedValue(new Blob(["<svg />"], { type: "image/svg+xml" })) } as unknown as Response;
    vi.mocked(authenticatedRequest).mockImplementation(() => new Promise((resolve) => releases.push(() => resolve(previewResponse))));
    const createObjectUrl = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:preview");
    const requests = [loadBoardPreview("one"), loadBoardPreview("two"), loadBoardPreview("three")];
    await Promise.resolve();
    expect(authenticatedRequest).toHaveBeenCalledTimes(2);
    releases.shift()?.();
    await vi.waitFor(() => expect(authenticatedRequest).toHaveBeenCalledTimes(3));
    releases.splice(0).forEach((release) => release());
    await expect(Promise.all(requests)).resolves.toEqual(["blob:preview", "blob:preview", "blob:preview"]);
    expect(vi.mocked(authenticatedRequest).mock.calls[0]?.[1]?.signal).toBeInstanceOf(AbortSignal);
    createObjectUrl.mockRestore();
  });
});

describe("asset repositories", () => {
  const asset = {
    id: "asset",
    board_id: "board",
    storage_key: "board/asset.png",
    mime_type: "image/png",
    byte_size: 4,
    width: 100,
    height: 80,
    url: "signed-url",
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("VITE_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("VITE_SUPABASE_PUBLISHABLE_KEY", "publishable-key");
    vi.mocked(createClient).mockReturnValue({
      storage: {
        from: () => ({ uploadToSignedUrl: vi.fn().mockResolvedValue({ error: null }) }),
      },
    } as unknown as ReturnType<typeof createClient>);
  });

  afterEach(() => vi.unstubAllEnvs());

  it("uploads through a prepared signed URL and completes the asset", async () => {
    vi.mocked(authenticatedFetch)
      .mockResolvedValueOnce({ upload: { path: "board/path", token: "token", signedUrl: "url" } })
      .mockResolvedValueOnce({ asset });
    const file = new File(["data"], "asset.png", { type: "image/png" });
    await expect(uploadBoardImage("board", file, { width: 100, height: 80 }))
      .resolves.toEqual(asset);
    expect(authenticatedFetch).toHaveBeenCalledTimes(2);
  });

  it("rejects missing upload configuration and signed-upload failures", async () => {
    vi.mocked(authenticatedFetch).mockResolvedValue({ upload: { path: "board/path", token: "token", signedUrl: "url" } });
    vi.stubEnv("VITE_SUPABASE_URL", "");
    await expect(uploadBoardImage("board", new File(["data"], "asset.png", { type: "image/png" }), { width: 1, height: 1 }))
      .rejects.toThrow("configuration is incomplete");
    vi.stubEnv("VITE_SUPABASE_URL", "https://example.supabase.co");
    vi.mocked(createClient).mockReturnValue({ storage: { from: () => ({ uploadToSignedUrl: vi.fn().mockResolvedValue({ error: new Error("upload failed") }) }) } } as unknown as ReturnType<typeof createClient>);
    await expect(uploadBoardImage("board", new File(["data"], "asset.png", { type: "image/png" }), { width: 1, height: 1 }))
      .rejects.toThrow("upload failed");
  });

  it("caches signed URLs, clones assets, and deletes stale uploads", async () => {
    vi.mocked(authenticatedFetch)
      .mockResolvedValueOnce({ asset })
      .mockResolvedValueOnce({ assetIds: { asset: "copy" } })
      .mockResolvedValueOnce(undefined);
    await expect(resolveAssetUrl("asset-cache-test")).resolves.toBe("signed-url");
    await expect(resolveAssetUrl("asset-cache-test")).resolves.toBe("signed-url");
    await expect(cloneBoardAssets("board-b", ["asset", "asset"])).resolves.toEqual({ asset: "copy" });
    await expect(deleteBoardAsset("asset-cache-test")).resolves.toBeUndefined();
    expect(authenticatedFetch).toHaveBeenCalledTimes(3);
    await expect(cloneBoardAssets("board", [])).resolves.toEqual({});
  });
});

it("ensures the authenticated user profile", async () => {
  const profile = { uid: "user", email: "user@example.com", displayName: "User", username: "user", avatarUrl: null };
  vi.mocked(authenticatedFetch).mockResolvedValue({ profile });
  await expect(ensureUserProfile()).resolves.toEqual(profile);
  expect(authenticatedFetch).toHaveBeenCalledWith("/api/session", { method: "POST" });
});
