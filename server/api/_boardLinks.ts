import { supabaseAdmin } from "./_supabase.js";
import type { Shape } from "../../src/classes/shape.js";
import { normalizeProductFrameMetadata } from "../../src/platform/productCoverage.js";

export interface BoardLinkRow {
  source_board_id: string;
  target_board_id: string;
  shape_id: string;
}

export interface CoverageProjection {
  nodes: Array<{
    frame_id: string;
    screen_key: string;
    state_kind: string;
    custom_state?: string;
    flow_ids: string[];
    roles: string[];
    viewport: string;
    criticality: string;
    requirement_refs: string[];
    annotated: boolean;
  }>;
  edges: Array<{
    interaction_id: string;
    source_frame_id: string;
    target_board_id: string | null;
    target_frame_id: string | null;
    trigger_kind: string;
    action_kind: string;
    condition?: Record<string, unknown>;
    is_fallback: boolean;
  }>;
}

const documentNodes = (document: unknown): Record<string, Shape> => {
  if (!document || typeof document !== "object") return {};
  const nodes = (document as Record<string, unknown>).nodes;
  return nodes && typeof nodes === "object" ? nodes as Record<string, Shape> : {};
};

const containingFrameId = (shape: Shape | undefined, byId: Map<string, Shape>) => {
  const seen = new Set<string>();
  let current = shape;
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    if (current.type === "frame" && !current.parentId) return current.id;
    current = typeof current.parentId === "string" ? byId.get(current.parentId) : undefined;
  }
  return null;
};

export const coverageProjection = (sourceBoardId: string, document: unknown): CoverageProjection => {
  const nodes = documentNodes(document);
  const byId = new Map(Object.entries(nodes).map(([id, shape]) => [id, { ...shape, id: shape.id ?? id }]));
  const projection: CoverageProjection = { nodes: [], edges: [] };
  byId.forEach((shape) => {
    if (shape.type === "frame" && !shape.parentId && !shape.hidden) {
      const metadata = normalizeProductFrameMetadata(shape.productState, shape.name);
      projection.nodes.push({
        frame_id: shape.id,
        screen_key: metadata.screenKey,
        state_kind: metadata.state,
        ...(metadata.customState ? { custom_state: metadata.customState } : {}),
        flow_ids: metadata.flowIds,
        roles: metadata.roles,
        viewport: metadata.viewport,
        criticality: metadata.criticality,
        requirement_refs: metadata.requirementRefs,
        annotated: Boolean(shape.productState),
      });
    }
    const sourceFrameId = containingFrameId(shape, byId);
    if (!sourceFrameId) return;
    (shape.prototypeInteractions ?? []).forEach((interaction) => {
      if (!["navigate", "open-board", "change-to", "open-overlay", "scroll-to"].includes(interaction.action)) return;
      const targetBoardId = interaction.action === "open-board" ? interaction.boardId ?? null : sourceBoardId;
      const destination = interaction.action === "open-board" ? interaction.destinationFrameId ?? null : containingFrameId(interaction.destinationId ? byId.get(interaction.destinationId) : undefined, byId);
      projection.edges.push({
        interaction_id: interaction.id,
        source_frame_id: sourceFrameId,
        target_board_id: targetBoardId,
        target_frame_id: destination,
        trigger_kind: interaction.trigger,
        action_kind: interaction.action,
        ...(interaction.condition ? { condition: interaction.condition } : {}),
        is_fallback: interaction.fallback === true,
      });
    });
    if (shape.type === "board" && typeof shape.boardId === "string" && !shape.prototypeInteractions?.some((interaction) => interaction.action === "open-board")) {
      projection.edges.push({ interaction_id: `${shape.id}:board-link`, source_frame_id: sourceFrameId, target_board_id: shape.boardId, target_frame_id: null, trigger_kind: "click", action_kind: "open-board", is_fallback: false });
    }
  });
  projection.nodes.sort((left, right) => left.frame_id.localeCompare(right.frame_id));
  projection.edges.sort((left, right) => left.interaction_id.localeCompare(right.interaction_id));
  return projection;
};

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
  const database = supabaseAdmin();
  const coverage = coverageProjection(sourceBoardId, document);
  const { error } = await database.rpc("sync_kumo_board_links_and_product_coverage", {
    p_source_board_id: sourceBoardId,
    p_links: links,
    p_nodes: coverage.nodes,
    p_edges: coverage.edges,
  });
  if (error) throw error;
};
