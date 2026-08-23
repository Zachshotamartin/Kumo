import { randomUUID } from "node:crypto";
import { boardDocumentFromJson, emptyBoardDocument, liveblocksAdmin } from "./_liveblocks";
import { supabaseAdmin } from "./_supabase";

export type BoardRole = "owner" | "editor" | "viewer";
export type BoardVisibility = "private" | "public";

export interface BoardRow {
  id: string;
  owner_id: string;
  title: string;
  visibility: BoardVisibility;
  liveblocks_room_id: string;
  legacy_rtdb_id: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface BoardAccess {
  board: BoardRow;
  role: BoardRole;
}

export const boardSummary = (board: BoardRow, role?: BoardRole) => ({
  id: board.id,
  title: board.title,
  ownerId: board.owner_id,
  visibility: board.visibility,
  roomId: board.liveblocks_room_id,
  role,
  updatedAt: new Date(board.updated_at).getTime(),
});

export const getBoardAccess = async (
  boardId: string,
  actorUid: string
): Promise<BoardAccess | null> => {
  const database = supabaseAdmin();
  const { data: boardData, error: boardError } = await database
    .from("boards")
    .select("id, owner_id, title, visibility, liveblocks_room_id, legacy_rtdb_id, created_at, updated_at, deleted_at")
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
  if (member) return { board, role: member.role as BoardRole };
  if (board.visibility === "public") return { board, role: "viewer" };
  return null;
};

export const listBoardsForUser = async (actorUid: string) => {
  const database = supabaseAdmin();
  const { data: members, error: memberError } = await database
    .from("board_members")
    .select("board_id, role")
    .eq("user_id", actorUid);
  if (memberError) throw memberError;
  if (!members?.length) return [];

  const roles = new Map(members.map((member) => [member.board_id as string, member.role as BoardRole]));
  const { data: boards, error: boardError } = await database
    .from("boards")
    .select("id, owner_id, title, visibility, liveblocks_room_id, legacy_rtdb_id, created_at, updated_at, deleted_at")
    .in("id", [...roles.keys()])
    .is("deleted_at", null)
    .order("updated_at", { ascending: false });
  if (boardError) throw boardError;
  return (boards as BoardRow[]).map((board) => boardSummary(board, roles.get(board.id)));
};

export const searchPublicBoards = async (query: string) => {
  const normalized = query.trim().slice(0, 120);
  if (!normalized) return [];
  const escaped = normalized.replace(/[%,_]/g, "");
  const { data, error } = await supabaseAdmin()
    .from("boards")
    .select("id, owner_id, title, visibility, liveblocks_room_id, legacy_rtdb_id, created_at, updated_at, deleted_at")
    .eq("visibility", "public")
    .is("deleted_at", null)
    .ilike("title", `%${escaped}%`)
    .order("updated_at", { ascending: false })
    .limit(12);
  if (error) throw error;
  return (data as BoardRow[]).map((board) => boardSummary(board, "viewer"));
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
    return data as BoardRow;
  } catch (error) {
    await liveblocks.deleteRoom(roomId).catch(() => undefined);
    throw error;
  }
};
