import { authenticatedFetch } from "./apiClient";

export interface BoardCollaborator {
  id: string;
  email: string;
  name: string;
  avatar: string;
  role: "owner" | "editor" | "viewer";
}

export const listBoardCollaborators = async (boardId: string): Promise<BoardCollaborator[]> => {
  const result = await authenticatedFetch<{ collaborators: BoardCollaborator[] }>(
    `/api/collaborators?boardId=${encodeURIComponent(boardId)}`
  );
  return result.collaborators;
};
