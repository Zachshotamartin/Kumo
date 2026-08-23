import { supabaseAdmin } from "./_supabase.js";

export interface BoardLinkRow {
  source_board_id: string;
  target_board_id: string;
  shape_id: string;
}

export const boardLinkRows = (
  sourceBoardId: string,
  document: unknown
): BoardLinkRow[] => {
  const source = document && typeof document === "object"
    ? document as Record<string, unknown>
    : {};
  const nodes = source.nodes && typeof source.nodes === "object"
    ? source.nodes as Record<string, unknown>
    : {};
  return Object.entries(nodes).flatMap(([shapeId, value]) => {
    if (!value || typeof value !== "object") return [];
    const shape = value as Record<string, unknown>;
    return shape.type === "board" &&
      typeof shape.boardId === "string" &&
      shape.boardId !== sourceBoardId
      ? [{
          source_board_id: sourceBoardId,
          target_board_id: shape.boardId,
          shape_id: shapeId,
        }]
      : [];
  });
};

export const syncBoardLinks = async (
  sourceBoardId: string,
  document: unknown
): Promise<void> => {
  const links = boardLinkRows(sourceBoardId, document).map((link) => ({
    target_board_id: link.target_board_id,
    shape_id: link.shape_id,
  }));
  const { error } = await supabaseAdmin().rpc("sync_kumo_board_links", {
    p_source_board_id: sourceBoardId,
    p_links: links,
  });
  if (error) throw error;
};
