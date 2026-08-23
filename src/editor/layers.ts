import type { Shape } from "../classes/shape";

export interface LayerUnit {
  key: string;
  groupId: string | null;
  ids: string[];
  members: Shape[];
}

/** Builds the front-to-back logical stack rendered by the Layers panel. */
export const buildLayerUnits = (shapes: Shape[], parentId: string | null = null): LayerUnit[] => {
  const frontToBack = shapes
    .filter((shape) => (shape.parentId ?? null) === parentId && shape.type !== "resource" && shape.type !== "guide")
    .map((shape, index) => ({ shape, index }))
    .sort((left, right) =>
      right.shape.zIndex - left.shape.zIndex || right.index - left.index
    )
    .map(({ shape }) => shape);
  const visitedGroups = new Set<string>();
  const units: LayerUnit[] = [];

  frontToBack.forEach((shape) => {
    if (!shape.groupId) {
      units.push({ key: `shape:${shape.id}`, groupId: null, ids: [shape.id], members: [shape] });
      return;
    }
    if (visitedGroups.has(shape.groupId)) return;
    visitedGroups.add(shape.groupId);
    const members = frontToBack.filter((candidate) =>
      candidate.groupId === shape.groupId && (candidate.parentId ?? null) === parentId
    );
    units.push({
      key: `group:${shape.groupId}`,
      groupId: shape.groupId,
      ids: members.map((member) => member.id),
      members,
    });
  });

  return units;
};
