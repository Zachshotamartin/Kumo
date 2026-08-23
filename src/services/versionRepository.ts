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

export const listBoardVersions = async (boardId: string): Promise<BoardVersion[]> => {
  const result = await authenticatedFetch<{ versions: BoardVersion[] }>(
    `/api/versions?boardId=${encodeURIComponent(boardId)}`
  );
  return result.versions;
};

export const getBoardVersion = async (
  boardId: string,
  versionId: string
): Promise<BoardVersionDetail> => {
  const result = await authenticatedFetch<{ version: BoardVersionDetail }>(
    `/api/versions?boardId=${encodeURIComponent(boardId)}&versionId=${encodeURIComponent(versionId)}`
  );
  return result.version;
};

export const createBoardCheckpoint = async (
  boardId: string,
  name: string,
  description = ""
): Promise<BoardVersion> => {
  const result = await authenticatedFetch<{ version: BoardVersion }>("/api/versions", {
    method: "POST",
    body: JSON.stringify({ action: "checkpoint", boardId, name, description }),
  });
  return result.version;
};

export const restoreBoardVersion = async (
  boardId: string,
  versionId: string
): Promise<{ restored: true; versionId: string; beforeRestoreId: string }> =>
  authenticatedFetch("/api/versions", {
    method: "POST",
    body: JSON.stringify({ action: "restore", boardId, versionId }),
  });
