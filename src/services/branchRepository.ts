import { authenticatedFetch } from "./apiClient";

export interface DesignBranch {
  id: string;
  board_id: string;
  name: string;
  room_id: string;
  created_by: string | null;
  status: "open" | "merged" | "archived";
  base_checksum?: string | null;
  created_at: string;
  updated_at: string;
  merged_at: string | null;
  updated_from_main_at?: string | null;
  merge_description?: string | null;
  branch_reviews?: Array<{
    reviewer_id: string;
    status: "requested" | "approved" | "changes-requested";
    note: string;
    reviewed_checksum: string | null;
    updated_at: string;
  }>;
}

export interface BranchDiffItem { shapeId: string; status: "added" | "changed" | "removed"; name: string; before: Record<string, unknown> | null; after: Record<string, unknown> | null }
export interface BranchConflict { shapeId: string; baseValue: Record<string, unknown> | null; mainValue: Record<string, unknown> | null; branchValue: Record<string, unknown> | null }

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

export const mergeDesignBranch = (boardId: string, branchId: string, description = "", coverageOverrideReason = ""): Promise<{ merged: true; checkpointId: string; revision: number }> =>
  authenticatedFetch("/api/branches", { method: "POST", body: JSON.stringify({ action: "merge", boardId, branchId, description, coverageOverrideReason }) });

export const archiveDesignBranch = (boardId: string, branchId: string): Promise<{ archived: true }> =>
  authenticatedFetch("/api/branches", { method: "POST", body: JSON.stringify({ action: "archive", boardId, branchId }) });

export const diffDesignBranch = (boardId: string, branchId: string) =>
  authenticatedFetch<{ diff: BranchDiffItem[] }>("/api/branches", { method: "POST", body: JSON.stringify({ action: "diff", boardId, branchId }) });

export const reviewDesignBranch = (boardId: string, branchId: string, status: "approved" | "changes-requested", note: string) =>
  authenticatedFetch<{ reviewed: true; status: string }>("/api/branches", { method: "POST", body: JSON.stringify({ action: "review", boardId, branchId, status, note }) });

export const renameDesignBranch = (boardId: string, branchId: string, name: string) =>
  authenticatedFetch<{ branch: DesignBranch }>("/api/branches", { method: "POST", body: JSON.stringify({ action: "rename", boardId, branchId, name }) }).then((result) => result.branch);

export const restoreDesignBranch = (boardId: string, branchId: string) =>
  authenticatedFetch<{ restored: true }>("/api/branches", { method: "POST", body: JSON.stringify({ action: "restore", boardId, branchId }) });

export const requestBranchReview = (boardId: string, branchId: string, reviewers: string[], note: string) =>
  authenticatedFetch<{ requested: string[] }>("/api/branches", { method: "POST", body: JSON.stringify({ action: "request-review", boardId, branchId, reviewers, note }) });

export const updateBranchFromMain = (boardId: string, branchId: string, resolutions: Record<string, "main" | "branch"> = {}) =>
  authenticatedFetch<{ updated: true; branchId: string; diff: BranchDiffItem[] }>("/api/branches", { method: "POST", body: JSON.stringify({ action: "update-from-main", boardId, branchId, resolutions }) });
