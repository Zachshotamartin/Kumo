import {
  boardSummary,
  boardSummaries,
  getBoardAccess,
  linkedBoardsForActor,
  listBoardsForUser,
  publicBoardsForOwner,
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
  thumbnailUrls: vi.fn(),
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
  boardThumbnailUrls: mocks.thumbnailUrls,
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
    mocks.thumbnailUrls.mockResolvedValue(new Map());
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

  it("summarizes thumbnail and missing-role variants", async () => {
    const withThumbnail = { ...board, thumbnail_asset_id: "thumbnail" };
    mocks.thumbnailUrls.mockResolvedValueOnce(new Map([["thumbnail", "https://signed/thumbnail"]]));
    await expect(boardSummaries([withThumbnail, board], new Map([[board.id, "editor"]]))).resolves.toEqual([
      expect.objectContaining({ thumbnailUrl: "https://signed/thumbnail", role: "editor" }),
      expect.objectContaining({ thumbnailUrl: null, role: "editor" }),
    ]);
    expect(boardSummary(board)).toMatchObject({ role: undefined, thumbnailUrl: null });
    expect(boardSummary(board, "viewer", "https://thumbnail")).toMatchObject({ role: "viewer", thumbnailUrl: "https://thumbnail" });
    mocks.thumbnailUrls.mockResolvedValueOnce(new Map());
    await expect(boardSummaries([withThumbnail], new Map())).resolves.toEqual([expect.objectContaining({ thumbnailUrl: null, role: undefined })]);
  });

  it("lists public owner boards and surfaces access query failures", async () => {
    mocks.from.mockReturnValueOnce({ select: () => ({ eq: () => ({ eq: () => ({ is: () => ({ order: () => ({ limit: vi.fn().mockResolvedValue({ data: [board], error: null }) }) }) }) }) }) });
    await expect(publicBoardsForOwner("owner")).resolves.toEqual([expect.objectContaining({ id: "board", role: "viewer" })]);
    mocks.from.mockReturnValueOnce({ select: () => ({ eq: () => ({ eq: () => ({ is: () => ({ order: () => ({ limit: vi.fn().mockResolvedValue({ data: null, error: new Error("public boards offline") }) }) }) }) }) }) });
    await expect(publicBoardsForOwner("owner")).rejects.toThrow("public boards offline");

    mocks.from.mockReturnValueOnce({ select: () => ({ eq: () => ({ is: () => ({ maybeSingle: vi.fn().mockResolvedValue({ data: null, error: new Error("board offline") }) }) }) }) });
    await expect(getBoardAccess("board", "actor")).rejects.toThrow("board offline");
    mocks.from
      .mockReturnValueOnce({ select: () => ({ eq: () => ({ is: () => ({ maybeSingle: vi.fn().mockResolvedValue({ data: board, error: null }) }) }) }) })
      .mockReturnValueOnce({ select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: vi.fn().mockResolvedValue({ data: null, error: new Error("member offline") }) }) }) }) });
    await expect(getBoardAccess("board", "actor")).rejects.toThrow("member offline");
    mocks.from
      .mockReturnValueOnce({ select: () => ({ eq: () => ({ is: () => ({ maybeSingle: vi.fn().mockResolvedValue({ data: board, error: null }) }) }) }) })
      .mockReturnValueOnce({ select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) }) }) }) });
    await expect(getBoardAccess("board", "actor")).resolves.toBeNull();
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

  it("handles empty lists and board/search query failures", async () => {
    mocks.from.mockReturnValueOnce({ select: () => ({ eq: vi.fn().mockResolvedValue({ data: null, error: null }) }) });
    await expect(listBoardsForUser("owner")).resolves.toEqual([]);
    mocks.from.mockReturnValueOnce({ select: () => ({ eq: vi.fn().mockResolvedValue({ data: null, error: new Error("members offline") }) }) });
    await expect(listBoardsForUser("owner")).rejects.toThrow("members offline");
    mocks.from
      .mockReturnValueOnce({ select: () => ({ eq: vi.fn().mockResolvedValue({ data: [{ board_id: "board", role: "owner" }], error: null }) }) })
      .mockReturnValueOnce({ select: () => ({ in: () => ({ is: () => ({ order: vi.fn().mockResolvedValue({ data: null, error: new Error("boards offline") }) }) }) }) });
    await expect(listBoardsForUser("owner")).rejects.toThrow("boards offline");
    mocks.from.mockReturnValueOnce({ select: () => ({ eq: () => ({ is: () => ({ ilike: () => ({ order: () => ({ limit: vi.fn().mockResolvedValue({ data: null, error: new Error("search offline") }) }) }) }) }) }) });
    await expect(searchPublicBoards("cloud")).rejects.toThrow("search offline");
  });

  it("handles empty and failed linked-board queries plus inaccessible summaries", async () => {
    mocks.from.mockReturnValueOnce({ select: () => ({ eq: vi.fn().mockResolvedValue({ data: null, error: null }) }) });
    await expect(linkedBoardsForActor("source", "actor")).resolves.toEqual({});
    mocks.from.mockReturnValueOnce({ select: () => ({ eq: vi.fn().mockResolvedValue({ data: null, error: new Error("links offline") }) }) });
    await expect(linkedBoardsForActor("source", "actor")).rejects.toThrow("links offline");

    const links = [{ target_board_id: "private" }, { target_board_id: "private" }, { target_board_id: "public" }];
    const linkedRows = [
      { id: "private", title: "Secret", visibility: "private", thumbnail_asset_id: "private-thumb", updated_at: "now" },
      { id: "public", title: "Public", visibility: "public", thumbnail_asset_id: null, updated_at: null },
    ];
    mocks.from
      .mockReturnValueOnce({ select: () => ({ eq: vi.fn().mockResolvedValue({ data: links, error: null }) }) })
      .mockReturnValueOnce({ select: () => ({ in: () => ({ is: vi.fn().mockResolvedValue({ data: linkedRows, error: null }) }) }) })
      .mockReturnValueOnce({ select: () => ({ eq: () => ({ in: vi.fn().mockResolvedValue({ data: null, error: null }) }) }) });
    await expect(linkedBoardsForActor("source", "actor")).resolves.toEqual({
      private: expect.objectContaining({ title: "Private board", accessible: false, role: null, updatedAt: null, thumbnailUrl: null }),
      public: expect.objectContaining({ title: "Public", accessible: true, role: "viewer", updatedAt: null, thumbnailUrl: null }),
    });

    mocks.from
      .mockReturnValueOnce({ select: () => ({ eq: vi.fn().mockResolvedValue({ data: [{ target_board_id: "one" }], error: null }) }) })
      .mockReturnValueOnce({ select: () => ({ in: () => ({ is: vi.fn().mockResolvedValue({ data: null, error: new Error("boards offline") }) }) }) })
      .mockReturnValueOnce({ select: () => ({ eq: () => ({ in: vi.fn().mockResolvedValue({ data: [], error: null }) }) }) });
    await expect(linkedBoardsForActor("source", "actor")).rejects.toThrow("boards offline");

    mocks.from
      .mockReturnValueOnce({ select: () => ({ eq: vi.fn().mockResolvedValue({ data: [{ target_board_id: "one" }], error: null }) }) })
      .mockReturnValueOnce({ select: () => ({ in: () => ({ is: vi.fn().mockResolvedValue({ data: [], error: null }) }) }) })
      .mockReturnValueOnce({ select: () => ({ eq: () => ({ in: vi.fn().mockResolvedValue({ data: null, error: new Error("roles offline") }) }) }) });
    await expect(linkedBoardsForActor("source", "actor")).rejects.toThrow("roles offline");

    mocks.from
      .mockReturnValueOnce({ select: () => ({ eq: vi.fn().mockResolvedValue({ data: [{ target_board_id: "one" }], error: null }) }) })
      .mockReturnValueOnce({ select: () => ({ in: () => ({ is: vi.fn().mockResolvedValue({ data: null, error: null }) }) }) })
      .mockReturnValueOnce({ select: () => ({ eq: () => ({ in: vi.fn().mockResolvedValue({ data: null, error: null }) }) }) });
    await expect(linkedBoardsForActor("source", "actor")).resolves.toEqual({});

    mocks.thumbnailUrls.mockResolvedValueOnce(new Map([["thumb", "https://signed/thumb"]]));
    mocks.from
      .mockReturnValueOnce({ select: () => ({ eq: vi.fn().mockResolvedValue({ data: [{ target_board_id: "one" }], error: null }) }) })
      .mockReturnValueOnce({ select: () => ({ in: () => ({ is: vi.fn().mockResolvedValue({ data: [{ id: "one", title: "One", visibility: "private", thumbnail_asset_id: "thumb", updated_at: new Date(12).toISOString() }], error: null }) }) }) })
      .mockReturnValueOnce({ select: () => ({ eq: () => ({ in: vi.fn().mockResolvedValue({ data: [{ board_id: "one", role: "editor" }], error: null }) }) }) });
    await expect(linkedBoardsForActor("source", "actor")).resolves.toEqual({
      one: expect.objectContaining({ accessible: true, role: "editor", updatedAt: 12, thumbnailUrl: "https://signed/thumb" }),
    });

    mocks.thumbnailUrls.mockResolvedValueOnce(new Map());
    mocks.from
      .mockReturnValueOnce({ select: () => ({ eq: vi.fn().mockResolvedValue({ data: [{ target_board_id: "one" }], error: null }) }) })
      .mockReturnValueOnce({ select: () => ({ in: () => ({ is: vi.fn().mockResolvedValue({ data: [{ id: "one", title: "One", visibility: "public", thumbnail_asset_id: "thumb", updated_at: new Date(12).toISOString() }], error: null }) }) }) })
      .mockReturnValueOnce({ select: () => ({ eq: () => ({ in: vi.fn().mockResolvedValue({ data: [], error: null }) }) }) });
    await expect(linkedBoardsForActor("source", "actor")).resolves.toEqual({
      one: expect.objectContaining({ thumbnailUrl: null }),
    });
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

    mocks.updateBoardThumbnail.mockReturnValueOnce(new Promise(() => undefined));
    await expect(provisionBoard({ id: "preview-pending", ownerId: "owner", title: "Created immediately" }))
      .resolves.toEqual(board);

    mocks.updateBoardThumbnail.mockRejectedValueOnce(new Error("preview failed"));
    await expect(provisionBoard({ id: "preview-failed", ownerId: "owner", title: "Still created" }))
      .resolves.toEqual(board);

    mocks.rpc.mockResolvedValueOnce({ data: null, error: new Error("database failed") });
    await expect(provisionBoard({ id: "failed", ownerId: "owner", title: "Failed", document: { nodes: {} } }))
      .rejects.toThrow("database failed");
    expect(mocks.deleteRoom).toHaveBeenCalledWith("board:failed");
  });

  it("cleans up a room when storage initialization fails even if deletion also fails", async () => {
    mocks.initializeStorageDocument.mockRejectedValueOnce(new Error("storage failed"));
    mocks.deleteRoom.mockRejectedValueOnce(new Error("delete failed"));
    await expect(provisionBoard({ id: "failed-storage", ownerId: "owner", title: "Failed", visibility: "public", legacyRtdbId: "legacy", document: { nodes: {} } }))
      .rejects.toThrow("storage failed");
    expect(mocks.initializeStorageDocument).toHaveBeenCalledWith("board:failed-storage", { converted: { nodes: {} } });
    expect(mocks.deleteRoom).toHaveBeenCalledWith("board:failed-storage");
  });

  it("provisions a caller-supplied document and thumbnails that document", async () => {
    const supplied = { backgroundColor: "#fff", nodes: { shape: { id: "shape" } } };
    await expect(provisionBoard({ id: "supplied", ownerId: "owner", title: "Supplied", document: supplied }))
      .resolves.toEqual(board);
    expect(mocks.initializeStorageDocument).toHaveBeenCalledWith("board:supplied", { converted: supplied });
    expect(mocks.updateBoardThumbnail).toHaveBeenCalledWith(board, supplied);
  });
});
