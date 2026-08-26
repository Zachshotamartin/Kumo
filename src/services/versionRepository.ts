import { authenticatedFetch, publicFetch } from "./apiClient";

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

export const createBoardAutosave = async (boardId: string, branchId?: string | null) => {
  const result = await authenticatedFetch<{ version: BoardVersion | null; skipped: boolean }>("/api/versions", {
    method: "POST",
    body: JSON.stringify({ action: "autosave", boardId, branchId: branchId ?? undefined }),
  });
  return result;
};

export const renameBoardVersion = async (boardId: string, versionId: string, name: string, description = "", branchId?: string | null) => {
  const result = await authenticatedFetch<{ version: BoardVersion }>("/api/versions", {
    method: "POST", body: JSON.stringify({ action: "rename", boardId, versionId, name, description, branchId: branchId ?? undefined }),
  });
  return result.version;
};

export const compareBoardVersion = (boardId: string, versionId: string, branchId?: string | null) =>
  authenticatedFetch<{ diff: Array<{ shapeId: string; status: "added" | "changed" | "removed"; name: string; before: Record<string, unknown> | null; after: Record<string, unknown> | null }> }>("/api/versions", {
    method: "POST", body: JSON.stringify({ action: "compare", boardId, versionId, branchId: branchId ?? undefined }),
  });

export const duplicateBoardVersion = (boardId: string, versionId: string, name?: string, branchId?: string | null) =>
  authenticatedFetch<{ boardId: string }>("/api/versions", {
    method: "POST", body: JSON.stringify({ action: "duplicate", boardId, versionId, name, branchId: branchId ?? undefined }),
  });

export const shareBoardVersion = (boardId: string, versionId: string, expiresAt?: string, branchId?: string | null) =>
  authenticatedFetch<{ token: string; url: string }>("/api/versions", {
    method: "POST", body: JSON.stringify({ action: "share", boardId, versionId, expiresAt, branchId: branchId ?? undefined }),
  });

export const getSharedBoardVersion = (versionId: string, token: string) => {
  const params = new URLSearchParams({ versionId, token });
  return publicFetch<{ version: BoardVersionDetail & { boardTitle: string } }>(`/api/versions?${params.toString()}`).then((result) => result.version);
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

export const restoreBoardVersionLayers = (boardId: string, versionId: string, shapeIds: string[], branchId?: string | null): Promise<{ restored: true; versionId: string; beforeRestoreId: string; revision: number; restoredShapeIds: string[] }> =>
  authenticatedFetch("/api/versions", { method: "POST", body: JSON.stringify({ action: "restore-layers", boardId, versionId, shapeIds, branchId: branchId ?? undefined }) });
