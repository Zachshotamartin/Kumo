import { authenticatedFetch } from "./apiClient";

export interface BoardCollaborator {
  id: string;
  email: string;
  name: string;
  avatar: string;
  role: "owner" | "editor" | "viewer";
}

export interface LinkedBoardShareItem {
  id: string;
  title: string;
  visibility: "private" | "public";
  depth: number;
  ownerId: string;
  manageable: boolean;
}

export interface BoardSharePlan {
  boards: LinkedBoardShareItem[];
  truncated: boolean;
}

export interface ShareBoardResult {
  uid: string;
  email: string;
  name: string;
  avatar: string | null;
  role: "editor" | "viewer";
  sharedBoards: LinkedBoardShareItem[];
  unavailableBoards: LinkedBoardShareItem[];
}

export const listBoardCollaborators = async (boardId: string): Promise<BoardCollaborator[]> => {
  const result = await authenticatedFetch<{ collaborators: BoardCollaborator[] }>(
    `/api/collaborators?boardId=${encodeURIComponent(boardId)}`
  );
  return result.collaborators;
};

export const getBoardSharePlan = async (boardId: string): Promise<BoardSharePlan> => {
  const result = await authenticatedFetch<{ plan: BoardSharePlan }>(
    `/api/share-board?boardId=${encodeURIComponent(boardId)}`
  );
  return result.plan;
};

export const inviteBoardCollaborator = (
  boardId: string,
  email: string,
  role: "editor" | "viewer",
  includeLinkedBoards: boolean
): Promise<ShareBoardResult> => authenticatedFetch("/api/share-board", {
  method: "POST",
  body: JSON.stringify({ boardId, action: "invite", email, role, includeLinkedBoards }),
});

export const inviteBoardFriend = (
  boardId: string,
  friendUid: string,
  role: "editor" | "viewer",
  includeLinkedBoards: boolean
): Promise<ShareBoardResult> => authenticatedFetch("/api/share-board", {
  method: "POST",
  body: JSON.stringify({ boardId, action: "invite", friendUid, role, includeLinkedBoards }),
});

export const removeBoardCollaborator = (
  boardId: string,
  memberUid: string,
  includeLinkedBoards: boolean
): Promise<void> =>
  authenticatedFetch("/api/share-board", {
    method: "POST",
    body: JSON.stringify({ boardId, action: "remove", memberUid, includeLinkedBoards }),
  });
