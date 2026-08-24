import {
  boardSummary,
  getBoardAccess,
  listBoardsForUser,
  provisionBoard,
  searchPublicBoards,
} from "../../server/api/_boards";

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  rpc: vi.fn(),
  createRoom: vi.fn(),
  initializeStorageDocument: vi.fn(),
  deleteRoom: vi.fn(),
  updateBoardThumbnail: vi.fn(),
}));

vi.mock("../../server/api/_supabase", () => ({
  supabaseAdmin: () => ({ from: mocks.from, rpc: mocks.rpc }),
}));
vi.mock("../../server/api/_liveblocks", () => ({
  liveblocksAdmin: () => ({
    createRoom: mocks.createRoom,
    initializeStorageDocument: mocks.initializeStorageDocument,
    deleteRoom: mocks.deleteRoom,
  }),
  emptyBoardDocument: () => ({ empty: true }),
  boardDocumentFromJson: (value: unknown) => ({ converted: value }),
}));
vi.mock("../../server/api/_boardThumbnail", () => ({
  boardThumbnailUrls: () => Promise.resolve(new Map()),
  updateBoardThumbnail: mocks.updateBoardThumbnail,
}));

const board = {
  id: "board", owner_id: "owner", title: "Board", visibility: "private" as const,
  liveblocks_room_id: "board:board", thumbnail_asset_id: null, legacy_rtdb_id: null,
  created_at: new Date(0).toISOString(), updated_at: new Date(10).toISOString(), deleted_at: null,
};

describe("board persistence helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createRoom.mockResolvedValue(undefined);
    mocks.initializeStorageDocument.mockResolvedValue(undefined);
    mocks.deleteRoom.mockResolvedValue(undefined);
    mocks.updateBoardThumbnail.mockResolvedValue("thumbnail");
    mocks.rpc.mockResolvedValue({ data: board, error: null });
  });

  it("summarizes and resolves member/public board access", async () => {
    expect(boardSummary(board, "owner")).toEqual(expect.objectContaining({
      id: "board", ownerId: "owner", role: "owner", updatedAt: 10,
    }));
    mocks.from
      .mockReturnValueOnce({ select: () => ({ eq: () => ({ is: () => ({ maybeSingle: vi.fn().mockResolvedValue({ data: board, error: null }) }) }) }) })
      .mockReturnValueOnce({ select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: vi.fn().mockResolvedValue({ data: { role: "editor" }, error: null }) }) }) }) });
    await expect(getBoardAccess("board", "member")).resolves.toMatchObject({ role: "editor" });

    mocks.from
      .mockReturnValueOnce({ select: () => ({ eq: () => ({ is: () => ({ maybeSingle: vi.fn().mockResolvedValue({ data: { ...board, visibility: "public" }, error: null }) }) }) }) })
      .mockReturnValueOnce({ select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) }) }) }) });
    await expect(getBoardAccess("board", "visitor")).resolves.toMatchObject({ role: "viewer" });

    mocks.from.mockReturnValueOnce({ select: () => ({ eq: () => ({ is: () => ({ maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) }) }) }) });
    await expect(getBoardAccess("missing", "visitor")).resolves.toBeNull();
  });

  it("lists memberships and searches escaped public titles", async () => {
    mocks.from
      .mockReturnValueOnce({ select: () => ({ eq: vi.fn().mockResolvedValue({ data: [{ board_id: "board", role: "owner" }], error: null }) }) })
      .mockReturnValueOnce({ select: () => ({ in: () => ({ is: () => ({ order: vi.fn().mockResolvedValue({ data: [board], error: null }) }) }) }) });
    await expect(listBoardsForUser("owner")).resolves.toEqual([
      expect.objectContaining({ id: "board", role: "owner" }),
    ]);

    mocks.from.mockReturnValueOnce({
      select: () => ({ eq: () => ({ is: () => ({ ilike: () => ({ order: () => ({ limit: vi.fn().mockResolvedValue({ data: [board], error: null }) }) }) }) }) }),
    });
    await expect(searchPublicBoards("  100%,_ clouds  ")).resolves.toEqual([
      expect.objectContaining({ id: "board", role: "viewer" }),
    ]);
    await expect(searchPublicBoards("   ")).resolves.toEqual([]);
  });

  it("provisions Liveblocks storage and the atomic database board record", async () => {
    await expect(provisionBoard({ id: "new", ownerId: "owner", title: "New" })).resolves.toEqual(board);
    expect(mocks.createRoom).toHaveBeenCalledWith("board:new", expect.objectContaining({ metadata: { boardId: "new" } }));
    expect(mocks.initializeStorageDocument).toHaveBeenCalledWith("board:new", { empty: true });
    expect(mocks.rpc).toHaveBeenCalledWith("create_kumo_board", expect.objectContaining({ p_id: "new" }));
    expect(mocks.updateBoardThumbnail).toHaveBeenCalledWith(
      board,
      { backgroundColor: "#252629", nodes: {} }
    );

    mocks.updateBoardThumbnail.mockRejectedValueOnce(new Error("preview failed"));
    await expect(provisionBoard({ id: "preview-failed", ownerId: "owner", title: "Still created" }))
      .resolves.toEqual(board);

    mocks.rpc.mockResolvedValueOnce({ data: null, error: new Error("database failed") });
    await expect(provisionBoard({ id: "failed", ownerId: "owner", title: "Failed", document: { nodes: {} } }))
      .rejects.toThrow("database failed");
    expect(mocks.deleteRoom).toHaveBeenCalledWith("board:failed");
  });
});
