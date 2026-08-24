import { supabaseAdmin } from "./_supabase.js";

export const MAX_LINKED_BOARD_DEPTH = 8;
export const MAX_LINKED_BOARD_COUNT = 100;

export interface LinkedBoardShareItem {
  id: string;
  title: string;
  visibility: "private" | "public";
  depth: number;
  ownerId: string;
  manageable: boolean;
}

export interface LinkedBoardSharePlan {
  boards: LinkedBoardShareItem[];
  truncated: boolean;
}

interface LinkRow {
  source_board_id: string;
  target_board_id: string;
}

interface BoardRow {
  id: string;
  title: string;
  visibility: "private" | "public";
  owner_id: string;
}

/**
 * Resolves the directed Kumo board graph without trusting client-supplied IDs.
 * Cycles are ignored and both depth and node count are bounded so a malformed
 * workspace cannot turn sharing into an unbounded database walk.
 */
export const linkedBoardSharePlan = async (
  sourceBoardId: string,
  actorUid: string
): Promise<LinkedBoardSharePlan> => {
  const database = supabaseAdmin();
  const depthById = new Map<string, number>([[sourceBoardId, 0]]);
  let frontier = [sourceBoardId];
  let truncated = false;

  for (let depth = 1; frontier.length && depth <= MAX_LINKED_BOARD_DEPTH; depth += 1) {
    const { data, error } = await database
      .from("board_links")
      .select("source_board_id, target_board_id")
      .in("source_board_id", frontier);
    if (error) throw error;

    const next: string[] = [];
    for (const row of (data ?? []) as LinkRow[]) {
      if (depthById.has(row.target_board_id)) continue;
      if (depthById.size >= MAX_LINKED_BOARD_COUNT) {
        truncated = true;
        break;
      }
      depthById.set(row.target_board_id, depth);
      next.push(row.target_board_id);
    }
    if (!next.length) {
      frontier = [];
      continue;
    }
    const { data: targetBoards, error: targetError } = await database
      .from("boards")
      .select("id, owner_id, visibility")
      .in("id", next)
      .is("deleted_at", null);
    if (targetError) throw targetError;
    // A source owner can disclose a direct dependency they placed on the
    // canvas, but must not traverse and expose another owner's private graph.
    frontier = (targetBoards ?? [])
      .filter((board) => board.owner_id === actorUid || board.visibility === "public")
      .map((board) => board.id as string);
  }
  if (frontier.length) truncated = true;

  const ids = [...depthById.keys()];
  const { data, error } = await database
    .from("boards")
    .select("id, title, visibility, owner_id")
    .in("id", ids)
    .is("deleted_at", null);
  if (error) throw error;

  const rows = (data ?? []) as BoardRow[];
  const boards = rows
    .map((board) => ({
      id: board.id,
      title: board.owner_id === actorUid || board.visibility === "public"
        ? board.title
        : "Private linked board",
      visibility: board.visibility,
      depth: depthById.get(board.id) ?? 0,
      ownerId: board.owner_id,
      manageable: board.owner_id === actorUid,
    }))
    .sort((left, right) => left.depth - right.depth || left.title.localeCompare(right.title));

  return { boards, truncated };
};

export const membershipBoardIds = async (
  userId: string,
  boardIds: string[]
): Promise<Set<string>> => {
  if (!boardIds.length) return new Set();
  const { data, error } = await supabaseAdmin()
    .from("board_members")
    .select("board_id")
    .eq("user_id", userId)
    .in("board_id", boardIds);
  if (error) throw error;
  return new Set((data ?? []).map((row) => row.board_id as string));
};
