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

export interface PendingBoardInvitation {
  id: string;
  email: string;
  role: "editor" | "viewer";
  status: "pending";
  expires_at: string;
  last_sent_at: string;
  created_at: string;
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

export interface PendingShareResult { pending: true; invitation: PendingBoardInvitation; url: string }
export type InviteBoardResult = ShareBoardResult | PendingShareResult;

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

export const getBoardSharingOverview = (boardId: string) => authenticatedFetch<{ plan: BoardSharePlan; invitations: PendingBoardInvitation[] }>(`/api/share-board?boardId=${encodeURIComponent(boardId)}`);

export const inviteBoardCollaborator = (
  boardId: string,
  email: string,
  role: "editor" | "viewer",
  includeLinkedBoards: boolean
): Promise<InviteBoardResult> => authenticatedFetch("/api/share-board", {
  method: "POST",
  body: JSON.stringify({ boardId, action: "invite", email, role, includeLinkedBoards }),
});

export const inviteBoardFriend = (
  boardId: string,
  friendUid: string,
  role: "editor" | "viewer",
  includeLinkedBoards: boolean
): Promise<InviteBoardResult> => authenticatedFetch("/api/share-board", {
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

export const updateBoardCollaboratorRole = (boardId: string, memberUid: string, role: "editor" | "viewer", includeLinkedBoards: boolean) =>
  authenticatedFetch<{ uid: string; role: "editor" | "viewer" }>("/api/share-board", { method: "POST", body: JSON.stringify({ boardId, action: "update-role", memberUid, role, includeLinkedBoards }) });

export const transferBoardOwnership = (boardId: string, memberUid: string) =>
  authenticatedFetch<{ transferred: true; newOwnerId: string }>("/api/share-board", { method: "POST", body: JSON.stringify({ boardId, action: "transfer-owner", memberUid }) });

export const leaveSharedBoard = (boardId: string) =>
  authenticatedFetch<{ left: true }>("/api/share-board", { method: "POST", body: JSON.stringify({ boardId, action: "leave" }) });

export const cancelBoardInvitation = (boardId: string, invitationId: string) =>
  authenticatedFetch<{ cancelled: true }>("/api/share-board", { method: "POST", body: JSON.stringify({ boardId, action: "cancel-invitation", invitationId }) });

export const refreshBoardInvitation = (boardId: string, invitationId: string) =>
  authenticatedFetch<{ refreshed: true; url: string }>("/api/share-board", { method: "POST", body: JSON.stringify({ boardId, action: "refresh-invitation", invitationId }) });

export const acceptBoardInvitation = (token: string) =>
  authenticatedFetch<{ accepted: true; boardId: string }>("/api/share-board", { method: "POST", body: JSON.stringify({ action: "accept-invitation", token }) });
