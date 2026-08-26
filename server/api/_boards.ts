import { randomUUID } from "node:crypto";
import { boardDocumentFromJson, emptyBoardDocument, liveblocksAdmin } from "./_liveblocks.js";
import { supabaseAdmin } from "./_supabase.js";
import { boardThumbnailUrls, updateBoardThumbnail } from "./_boardThumbnail.js";
import { hiddenProfileIdsForActor } from "./_profiles.js";

export type BoardRole = "owner" | "editor" | "viewer";
export type BoardVisibility = "private" | "public";

export interface BoardRow {
  id: string;
  owner_id: string;
  title: string;
  visibility: BoardVisibility;
  liveblocks_room_id: string;
  thumbnail_asset_id: string | null;
  legacy_rtdb_id: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  workspace_id?: string | null;
}

export interface BoardAccess {
  board: BoardRow;
  role: BoardRole;
}

export interface LinkedBoardAccessSummary {
  id: string;
  title: string;
  visibility: BoardVisibility;
  accessible: boolean;
  role: BoardRole | null;
  updatedAt: number | null;
  thumbnailUrl: string | null;
}

export const boardSummary = (board: BoardRow, role?: BoardRole, thumbnailUrl?: string | null) => ({
  id: board.id,
  title: board.title,
  ownerId: board.owner_id,
  visibility: board.visibility,
  roomId: board.liveblocks_room_id,
  role,
  updatedAt: new Date(board.updated_at).getTime(),
  thumbnailUrl: thumbnailUrl ?? null,
  deletedAt: board.deleted_at ? new Date(board.deleted_at).getTime() : null,
});

export const boardSummaries = async (boards: BoardRow[], roles: Map<string, BoardRole>) => {
  const thumbnailUrls = await boardThumbnailUrls(boards);
  return boards.map((board) => boardSummary(
    board,
    roles.get(board.id),
    board.thumbnail_asset_id ? thumbnailUrls.get(board.thumbnail_asset_id) ?? null : null
  ));
};

export const publicBoardsForOwner = async (ownerUid: string) => {
  const { data, error } = await supabaseAdmin()
    .from("boards")
    .select("id, owner_id, title, visibility, liveblocks_room_id, thumbnail_asset_id, legacy_rtdb_id, created_at, updated_at, deleted_at, workspace_id")
    .eq("owner_id", ownerUid)
    .eq("visibility", "public")
    .is("deleted_at", null)
    .order("updated_at", { ascending: false })
    .limit(24);
  if (error) throw error;
  const boards = data as BoardRow[];
  return boardSummaries(boards, new Map(boards.map((board) => [board.id, "viewer" as const])));
};

export const getBoardAccess = async (
  boardId: string,
  actorUid: string
): Promise<BoardAccess | null> => {
  const database = supabaseAdmin();
  const { data: boardData, error: boardError } = await database
    .from("boards")
    .select("id, owner_id, title, visibility, liveblocks_room_id, thumbnail_asset_id, legacy_rtdb_id, created_at, updated_at, deleted_at, workspace_id")
    .eq("id", boardId)
    .is("deleted_at", null)
    .maybeSingle();
  if (boardError) throw boardError;
  if (!boardData) return null;
  const board = boardData as BoardRow;

  const { data: member, error: memberError } = await database
    .from("board_members")
    .select("role")
    .eq("board_id", boardId)
    .eq("user_id", actorUid)
    .maybeSingle();
  if (memberError) throw memberError;
  const directRole = member?.role as BoardRole | undefined;
  if (directRole === "owner" || directRole === "editor") return { board, role: directRole };
  if (board.workspace_id) {
    const { data: workspaceMember, error: workspaceError } = await database
      .from("workspace_members")
      .select("role")
      .eq("workspace_id", board.workspace_id)
      .eq("user_id", actorUid)
      .maybeSingle();
    if (workspaceError) throw workspaceError;
    if (workspaceMember && workspaceMember.role !== "guest") return { board, role: "editor" };
  }
  if (directRole) return { board, role: directRole };
  if (board.visibility === "public") return { board, role: "viewer" };
  return null;
};

export const linkedBoardsForActor = async (
  sourceBoardId: string,
  actorUid: string
): Promise<Record<string, LinkedBoardAccessSummary>> => {
  const database = supabaseAdmin();
  const { data: links, error: linkError } = await database
    .from("board_links")
    .select("target_board_id")
    .eq("source_board_id", sourceBoardId);
  if (linkError) throw linkError;
  const targetIds = [...new Set((links ?? []).map((link) => link.target_board_id as string))];
  if (!targetIds.length) return {};

  const [{ data: boards, error: boardError }, { data: memberships, error: memberError }] = await Promise.all([
    database
      .from("boards")
      .select("id, title, visibility, thumbnail_asset_id, updated_at, workspace_id")
      .in("id", targetIds)
      .is("deleted_at", null),
    database
      .from("board_members")
      .select("board_id, role")
      .eq("user_id", actorUid)
      .in("board_id", targetIds),
  ]);
  if (boardError) throw boardError;
  if (memberError) throw memberError;
  const boardRows = boards ?? [];
  const roles = new Map((memberships ?? []).map((member) => [
    member.board_id as string,
    member.role as BoardRole,
  ]));
  const workspaceIds = [...new Set(boardRows
    .map((board) => board.workspace_id as string | null)
    .filter((workspaceId): workspaceId is string => Boolean(workspaceId)))];
  if (workspaceIds.length) {
    const { data: workspaceMemberships, error: workspaceError } = await database
      .from("workspace_members")
      .select("workspace_id, role")
      .eq("user_id", actorUid)
      .in("workspace_id", workspaceIds);
    if (workspaceError) throw workspaceError;
    const editableWorkspaces = new Set((workspaceMemberships ?? [])
      .filter((membership) => membership.role !== "guest")
      .map((membership) => membership.workspace_id as string));
    boardRows.forEach((board) => {
      const currentRole = roles.get(board.id as string);
      if (board.workspace_id && editableWorkspaces.has(board.workspace_id as string) && currentRole !== "owner" && currentRole !== "editor") {
        roles.set(board.id as string, "editor");
      }
    });
  }
  const thumbnailUrls = await boardThumbnailUrls(boardRows.map((board) => ({
    thumbnail_asset_id: board.thumbnail_asset_id as string | null,
  })));
  return Object.fromEntries(boardRows.map((board) => {
    const role = roles.get(board.id as string) ?? null;
    const visibility = board.visibility as BoardVisibility;
    const accessible = Boolean(role) || visibility === "public";
    return [board.id, {
      id: board.id as string,
      title: accessible ? board.title as string : "Private board",
      visibility,
      accessible,
      role: role ?? (visibility === "public" ? "viewer" : null),
      updatedAt: accessible && board.updated_at ? new Date(board.updated_at as string).getTime() : null,
      thumbnailUrl: accessible && board.thumbnail_asset_id
        ? thumbnailUrls.get(board.thumbnail_asset_id as string) ?? null
        : null,
    } satisfies LinkedBoardAccessSummary];
  }));
};

export const listBoardsForUser = async (actorUid: string) => {
  const database = supabaseAdmin();
  const [{ data: members, error: memberError }, { data: workspaceMemberships, error: workspaceError }] = await Promise.all([
    database.from("board_members").select("board_id, role").eq("user_id", actorUid),
    database.from("workspace_members").select("workspace_id, role").eq("user_id", actorUid).neq("role", "guest"),
  ]);
  if (memberError) throw memberError;
  if (workspaceError) throw workspaceError;
  if (!members?.length && !workspaceMemberships?.length) return [];

  const roles = new Map(members.map((member) => [member.board_id as string, member.role as BoardRole]));
  const explicitIds = [...roles.keys()];
  const workspaceIds = (workspaceMemberships ?? []).map((membership) => membership.workspace_id as string);
  let boardQuery = database
    .from("boards")
    .select("id, owner_id, title, visibility, liveblocks_room_id, thumbnail_asset_id, legacy_rtdb_id, created_at, updated_at, deleted_at, workspace_id")
    .is("deleted_at", null);
  if (explicitIds.length && workspaceIds.length) boardQuery = boardQuery.or(`id.in.(${explicitIds.join(",")}),workspace_id.in.(${workspaceIds.join(",")})`);
  else if (explicitIds.length) boardQuery = boardQuery.in("id", explicitIds);
  else boardQuery = boardQuery.in("workspace_id", workspaceIds);
  const { data: boards, error: boardError } = await boardQuery.order("updated_at", { ascending: false });
  if (boardError) throw boardError;
  (boards as BoardRow[]).forEach((board) => {
    const currentRole = roles.get(board.id);
    if (currentRole !== "owner" && currentRole !== "editor" && board.workspace_id && workspaceIds.includes(board.workspace_id)) roles.set(board.id, "editor");
  });
  return boardSummaries(boards as BoardRow[], roles);
};

export const searchPublicBoards = async (query: string, actorUid?: string) => {
  const normalized = query.trim().slice(0, 120);
  if (!normalized) return [];
  const escaped = normalized.replace(/[%,_]/g, "");
  const { data, error } = await supabaseAdmin()
    .from("boards")
    .select("id, owner_id, title, visibility, liveblocks_room_id, thumbnail_asset_id, legacy_rtdb_id, created_at, updated_at, deleted_at, workspace_id")
    .eq("visibility", "public")
    .is("deleted_at", null)
    .ilike("title", `%${escaped}%`)
    .order("updated_at", { ascending: false })
    .limit(actorUid ? 48 : 12);
  if (error) throw error;
  const hidden = actorUid ? await hiddenProfileIdsForActor(actorUid) : new Set<string>();
  const visible = ((data ?? []) as BoardRow[]).filter((board) => !hidden.has(board.owner_id)).slice(0, 12);
  return boardSummaries(visible, new Map(visible.map((board) => [board.id, "viewer" as const])));
};

export const provisionBoard = async ({
  id = randomUUID(),
  ownerId,
  title,
  visibility = "private",
  document,
  legacyRtdbId = null,
}: {
  id?: string;
  ownerId: string;
  title: string;
  visibility?: BoardVisibility;
  document?: unknown;
  legacyRtdbId?: string | null;
}): Promise<BoardRow> => {
  const roomId = `board:${id}`;
  const liveblocks = liveblocksAdmin();
  await liveblocks.createRoom(roomId, {
    defaultAccesses: [],
    metadata: { boardId: id },
  });

  try {
    await liveblocks.initializeStorageDocument(
      roomId,
      document === undefined ? emptyBoardDocument() : boardDocumentFromJson(document)
    );
    const { data, error } = await supabaseAdmin().rpc("create_kumo_board", {
      p_id: id,
      p_owner_id: ownerId,
      p_title: title,
      p_room_id: roomId,
      p_visibility: visibility,
      p_legacy_rtdb_id: legacyRtdbId,
    });
    if (error) throw error;
    const board = data as BoardRow;
    void updateBoardThumbnail(
      board,
      document === undefined ? { backgroundColor: "#252629", nodes: {} } : document
    ).catch(() => undefined);
    return board;
  } catch (error) {
    await liveblocks.deleteRoom(roomId).catch(() => undefined);
    throw error;
  }
};
