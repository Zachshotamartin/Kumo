import { WhiteBoardState } from "../features/whiteBoard/whiteBoardSlice";
import { authenticatedFetch } from "./apiClient";

export type BoardVisibility = "private" | "public";
export type BoardRole = "owner" | "editor" | "viewer";

export interface BoardSummary {
  id: string;
  title: string;
  ownerId: string;
  visibility: BoardVisibility;
  roomId: string;
  role: BoardRole;
  updatedAt: number | null;
  thumbnailUrl?: string | null;
  members?: Record<string, BoardRole>;
}

const asBoardState = (board: BoardSummary): WhiteBoardState => ({
  id: board.id,
  roomId: board.roomId,
  baseRoomId: board.roomId,
  activeBranchId: null,
  activeBranchName: null,
  role: board.role,
  shapes: [],
  title: board.title,
  uid: board.ownerId,
  type: board.visibility,
  sharedWith: Object.keys(board.members ?? {}).filter((uid) => uid !== board.ownerId),
  members: board.members ?? { [board.ownerId]: "owner" },
  backGroundColor: "#252629",
  lastChangedBy: null,
  currentUsers: [],
  schemaVersion: 4,
  revision: 0,
  updatedAt: board.updatedAt,
});

export const listBoards = async (): Promise<BoardSummary[]> => {
  const result = await authenticatedFetch<{ boards: BoardSummary[] }>("/api/boards");
  return result.boards;
};

export const searchPublicBoards = async (query: string): Promise<BoardSummary[]> => {
  if (!query.trim()) return [];
  const result = await authenticatedFetch<{ boards: BoardSummary[] }>(
    `/api/boards?scope=public&query=${encodeURIComponent(query)}`
  );
  return result.boards;
};

const migrateLegacyBoard = (boardId: string) =>
  authenticatedFetch<{ migrated: boolean; boardId: string }>("/api/migrate-board", {
    method: "POST",
    body: JSON.stringify({ boardId }),
  });

export const getBoard = async (boardId: string): Promise<WhiteBoardState> => {
  try {
    const result = await authenticatedFetch<{ board: BoardSummary }>(
      `/api/boards?id=${encodeURIComponent(boardId)}`
    );
    return asBoardState(result.board);
  } catch (error) {
    if (!(error instanceof Error) || !/not found/i.test(error.message)) throw error;
    await migrateLegacyBoard(boardId);
    const result = await authenticatedFetch<{ board: BoardSummary }>(
      `/api/boards?id=${encodeURIComponent(boardId)}`
    );
    return asBoardState(result.board);
  }
};

export const createBoard = async (title = "Untitled board"): Promise<string> => {
  const result = await authenticatedFetch<{ board: BoardSummary }>("/api/boards", {
    method: "POST",
    body: JSON.stringify({ action: "create", title }),
  });
  return result.board.id;
};

export const duplicateBoard = async (sourceBoardId: string): Promise<string> => {
  const result = await authenticatedFetch<{ board: BoardSummary }>("/api/boards", {
    method: "POST",
    body: JSON.stringify({ action: "duplicate", boardId: sourceBoardId }),
  });
  return result.board.id;
};

export const updateBoardSettings = async (
  boardId: string,
  patch: { title?: string; visibility?: BoardVisibility }
): Promise<BoardSummary> => {
  const result = await authenticatedFetch<{ board: BoardSummary }>("/api/boards", {
    method: "PATCH",
    body: JSON.stringify({ boardId, ...patch }),
  });
  return result.board;
};

export const deleteBoard = async (boardId: string): Promise<void> => {
  await authenticatedFetch<void>("/api/boards", {
    method: "DELETE",
    body: JSON.stringify({ boardId }),
  });
};
