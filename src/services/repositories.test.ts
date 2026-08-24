import { createClient } from "@supabase/supabase-js";
import { authenticatedFetch } from "./apiClient";
import {
  createBoard,
  deleteBoard,
  duplicateBoard,
  getBoard,
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

vi.mock("./apiClient", () => ({ authenticatedFetch: vi.fn() }));
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

  it("maps a board summary into editor state", async () => {
    vi.mocked(authenticatedFetch).mockResolvedValue({ board });
    await expect(getBoard("board")).resolves.toMatchObject({
      id: "board",
      sharedWith: ["editor"],
      backGroundColor: "#252629",
      linkedBoards: { target: expect.objectContaining({ accessible: false }) },
    });
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

  it("creates, duplicates, updates, and deletes boards", async () => {
    vi.mocked(authenticatedFetch).mockResolvedValue({ board });
    await expect(createBoard("New")).resolves.toBe("board");
    await expect(duplicateBoard("source")).resolves.toBe("board");
    await expect(updateBoardSettings("board", { visibility: "public" })).resolves.toBe(board);
    await expect(deleteBoard("board")).resolves.toBeUndefined();
    expect(authenticatedFetch).toHaveBeenCalledTimes(4);
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
  });
});

it("ensures the authenticated user profile", async () => {
  const profile = { uid: "user", email: "user@example.com", displayName: "User", username: "user", avatarUrl: null };
  vi.mocked(authenticatedFetch).mockResolvedValue({ profile });
  await expect(ensureUserProfile()).resolves.toEqual(profile);
  expect(authenticatedFetch).toHaveBeenCalledWith("/api/session", { method: "POST" });
});
