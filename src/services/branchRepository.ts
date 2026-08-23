import { authenticatedFetch } from "./apiClient";

export interface DesignBranch {
  id: string;
  board_id: string;
  name: string;
  room_id: string;
  created_by: string | null;
  status: "open" | "merged" | "archived";
  created_at: string;
  updated_at: string;
  merged_at: string | null;
}

export const listDesignBranches = async (boardId: string): Promise<DesignBranch[]> => {
  const result = await authenticatedFetch<{ branches: DesignBranch[] }>(`/api/branches?boardId=${encodeURIComponent(boardId)}`);
  return result.branches;
};

export const createDesignBranch = async (boardId: string, name: string): Promise<DesignBranch> => {
  const result = await authenticatedFetch<{ branch: DesignBranch }>("/api/branches", {
    method: "POST", body: JSON.stringify({ action: "create", boardId, name }),
  });
  return result.branch;
};

export const mergeDesignBranch = (boardId: string, branchId: string): Promise<{ merged: true; checkpointId: string }> =>
  authenticatedFetch("/api/branches", { method: "POST", body: JSON.stringify({ action: "merge", boardId, branchId }) });

export const archiveDesignBranch = (boardId: string, branchId: string): Promise<{ archived: true }> =>
  authenticatedFetch("/api/branches", { method: "POST", body: JSON.stringify({ action: "archive", boardId, branchId }) });
