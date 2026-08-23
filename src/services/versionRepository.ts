import { authenticatedFetch } from "./apiClient";

export type VersionKind = "autosave" | "checkpoint" | "before_restore" | "restored";

export interface BoardVersion {
  id: string;
  board_id: string;
  name: string | null;
  description: string | null;
  created_by: string | null;
  creatorName?: string | null;
  kind: VersionKind;
  created_at: string;
  checksum?: string | null;
}

export interface BoardVersionDetail extends BoardVersion {
  document: {
    backgroundColor?: string;
    nodes?: Record<string, Record<string, unknown>>;
  };
}

const branchQuery = (branchId?: string | null) => branchId
  ? `&branchId=${encodeURIComponent(branchId)}`
  : "";

export const listBoardVersions = async (boardId: string, branchId?: string | null): Promise<BoardVersion[]> => {
  const result = await authenticatedFetch<{ versions: BoardVersion[] }>(
    `/api/versions?boardId=${encodeURIComponent(boardId)}${branchQuery(branchId)}`
  );
  return result.versions;
};

export const getBoardVersion = async (
  boardId: string,
  versionId: string,
  branchId?: string | null
): Promise<BoardVersionDetail> => {
  const result = await authenticatedFetch<{ version: BoardVersionDetail }>(
    `/api/versions?boardId=${encodeURIComponent(boardId)}&versionId=${encodeURIComponent(versionId)}${branchQuery(branchId)}`
  );
  return result.version;
};

export const createBoardCheckpoint = async (
  boardId: string,
  name: string,
  description = "",
  branchId?: string | null
): Promise<BoardVersion> => {
  const result = await authenticatedFetch<{ version: BoardVersion }>("/api/versions", {
    method: "POST",
    body: JSON.stringify({ action: "checkpoint", boardId, name, description, branchId: branchId ?? undefined }),
  });
  return result.version;
};

export const restoreBoardVersion = async (
  boardId: string,
  versionId: string,
  branchId?: string | null
): Promise<{ restored: true; versionId: string; beforeRestoreId: string; revision: number }> =>
  authenticatedFetch("/api/versions", {
    method: "POST",
    body: JSON.stringify({ action: "restore", boardId, versionId, branchId: branchId ?? undefined }),
  });
