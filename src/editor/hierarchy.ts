import type { Shape } from "../classes/shape";
import type { Bounds, Point } from "./types";

const shapeBounds = (shape: Shape): Bounds => ({
  x: Math.min(shape.x1, shape.x2),
  y: Math.min(shape.y1, shape.y2),
  width: Math.abs(shape.x2 - shape.x1),
  height: Math.abs(shape.y2 - shape.y1),
});

export const shapeMap = (shapes: readonly Shape[]) =>
  new Map(shapes.map((shape) => [shape.id, shape]));

export const ancestorsOf = (shapes: readonly Shape[], id: string): Shape[] => {
  const byId = shapeMap(shapes);
  const ancestors: Shape[] = [];
  const visited = new Set<string>([id]);
  let parentId = byId.get(id)?.parentId;
  while (parentId && !visited.has(parentId)) {
    visited.add(parentId);
    const parent = byId.get(parentId);
    if (!parent) break;
    ancestors.push(parent);
    parentId = parent.parentId;
  }
  return ancestors;
};

export const descendantIds = (
  shapes: readonly Shape[],
  parentIds: Iterable<string>
): Set<string> => {
  const descendants = new Set<string>();
  const queue = [...parentIds];
  while (queue.length) {
    const parentId = queue.shift()!;
    shapes.forEach((shape) => {
      if (shape.parentId === parentId && !descendants.has(shape.id)) {
        descendants.add(shape.id);
        queue.push(shape.id);
      }
    });
  }
  return descendants;
};

export const rootSelectionIds = (
  shapes: readonly Shape[],
  selectedIds: readonly string[]
): string[] => {
  const selected = new Set(selectedIds);
  return selectedIds.filter((id) =>
    !ancestorsOf(shapes, id).some((ancestor) => selected.has(ancestor.id))
  );
};

export const topLevelFrameFor = (
  shapes: readonly Shape[],
  shape: Shape
): Shape | undefined => {
  const frames = ancestorsOf(shapes, shape.id).filter((ancestor) => ancestor.type === "frame");
  return frames.at(-1);
};

/**
 * Mirrors contextual canvas selection: a normal click selects the outer frame
 * or logical group, while deep selection targets only the object under the
 * pointer. Deep selection powers both modifier-click and double-click.
 */
export const contextualSelectionIds = (
  shapes: readonly Shape[],
  shape: Shape,
  deep = false
): string[] => {
  if (deep) return [shape.id];
  const frame = topLevelFrameFor(shapes, shape);
  if (frame) return [frame.id];
  if (!shape.groupId) return [shape.id];
  return shapes
    .filter((candidate) =>
      candidate.groupId === shape.groupId &&
      (candidate.parentId ?? null) === (shape.parentId ?? null)
    )
    .sort((left, right) => left.zIndex - right.zIndex || left.id.localeCompare(right.id))
    .map((candidate) => candidate.id);
};

export const immediateFrameFor = (
  shapes: readonly Shape[],
  shape: Shape
): Shape | undefined => {
  const parent = shape.parentId ? shapeMap(shapes).get(shape.parentId) : undefined;
  return parent?.type === "frame" ? parent : undefined;
};

export const isEffectivelyHidden = (shapes: readonly Shape[], shape: Shape): boolean =>
  Boolean(shape.hidden || ancestorsOf(shapes, shape.id).some((ancestor) => ancestor.hidden));

export const isEffectivelyLocked = (shapes: readonly Shape[], shape: Shape): boolean =>
  Boolean(shape.locked || ancestorsOf(shapes, shape.id).some((ancestor) => ancestor.locked));

export const boundsContainBounds = (container: Bounds, child: Bounds): boolean =>
  child.x >= container.x &&
  child.y >= container.y &&
  child.x + child.width <= container.x + container.width &&
  child.y + child.height <= container.y + container.height;

export const boundsContainPoint = (bounds: Bounds, point: Point): boolean =>
  point.x >= bounds.x &&
  point.y >= bounds.y &&
  point.x <= bounds.x + bounds.width &&
  point.y <= bounds.y + bounds.height;

export const frameAtPoint = (
  shapes: readonly Shape[],
  point: Point,
  excludedIds: Iterable<string> = []
): Shape | undefined => {
  const excluded = new Set(excludedIds);
  return shapes
    .filter((shape) =>
      shape.type === "frame" &&
      !excluded.has(shape.id) &&
      !isEffectivelyHidden(shapes, shape) &&
      !isEffectivelyLocked(shapes, shape) &&
      boundsContainPoint(shapeBounds(shape), point)
    )
    .sort((left, right) => {
      const leftBounds = shapeBounds(left);
      const rightBounds = shapeBounds(right);
      return leftBounds.width * leftBounds.height - rightBounds.width * rightBounds.height ||
        right.zIndex - left.zIndex;
    })[0];
};

export const commonParentId = (
  shapes: readonly Shape[],
  ids: readonly string[]
): string | null => {
  const byId = shapeMap(shapes);
  const parents = new Set(ids.map((id) => byId.get(id)?.parentId ?? null));
  return parents.size === 1 ? [...parents][0]! : null;
};

export const clippedByAncestor = (
  shapes: readonly Shape[],
  shape: Shape,
  point: Point
): boolean => ancestorsOf(shapes, shape.id).some((ancestor) =>
  ancestor.type === "frame" &&
  ancestor.clipContent !== false &&
  !boundsContainPoint(shapeBounds(ancestor), point)
);

export const reparentSelection = (
  shapes: Shape[],
  selectedIds: readonly string[],
  parentId: string | null
): Shape[] => {
  const rootIds = rootSelectionIds(shapes, selectedIds);
  const roots = new Set(rootIds);
  const forbidden = new Set([...roots, ...descendantIds(shapes, roots)]);
  const safeParentId = parentId && !forbidden.has(parentId) ? parentId : null;
  const orderedRoots = rootIds
    .map((id) => shapes.find((shape) => shape.id === id))
    .filter(Boolean)
    .sort((left, right) => left!.zIndex - right!.zIndex) as Shape[];
  let nextZ = Math.max(
    safeParentId ? shapeMap(shapes).get(safeParentId)?.zIndex ?? 0 : 0,
    ...shapes
      .filter((shape) => !forbidden.has(shape.id) && (shape.parentId ?? null) === safeParentId)
      .map((shape) => shape.zIndex),
    0
  ) + 1;
  const zOffsets = new Map<string, number>();
  orderedRoots.forEach((root) => {
    const unitIds = new Set([root.id, ...descendantIds(shapes, [root.id])]);
    const members = shapes.filter((shape) => unitIds.has(shape.id));
    const minimum = Math.min(...members.map((shape) => shape.zIndex));
    const maximum = Math.max(...members.map((shape) => shape.zIndex));
    const offset = nextZ - minimum;
    members.forEach((shape) => zOffsets.set(shape.id, offset));
    nextZ += maximum - minimum + 1;
  });
  return shapes.map((shape) => ({
    ...shape,
    ...(roots.has(shape.id) ? { parentId: safeParentId } : {}),
    ...(zOffsets.has(shape.id) ? { zIndex: shape.zIndex + zOffsets.get(shape.id)! } : {}),
  }));
};

export const reparentAfterMove = (
  shapes: Shape[],
  selectedIds: readonly string[],
  keepCurrentParent = false
): Shape[] => {
  const roots = rootSelectionIds(shapes, selectedIds);
  if (!roots.length || keepCurrentParent) return shapes;
  const byId = shapeMap(shapes);
  const selectedBounds = roots.map((id) => shapeBounds(byId.get(id)!));
  const bounds = {
    x: Math.min(...selectedBounds.map((item) => item.x)),
    y: Math.min(...selectedBounds.map((item) => item.y)),
    width: Math.max(...selectedBounds.map((item) => item.x + item.width)) - Math.min(...selectedBounds.map((item) => item.x)),
    height: Math.max(...selectedBounds.map((item) => item.y + item.height)) - Math.min(...selectedBounds.map((item) => item.y)),
  };
  const center = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
  const excluded = new Set([...roots, ...descendantIds(shapes, roots)]);
  const selectedPageId = byId.get(roots[0]!)?.pageId ?? "page:default";
  const candidate = frameAtPoint(shapes, center, excluded);
  const target = candidate &&
    (candidate.pageId ?? "page:default") === selectedPageId &&
    bounds.width <= shapeBounds(candidate).width &&
    bounds.height <= shapeBounds(candidate).height
    ? candidate.id
    : null;
  if (roots.every((id) => (byId.get(id)?.parentId ?? null) === target)) return shapes;
  return reparentSelection(shapes, roots, target);
};

export const adoptContainedShapes = (shapes: Shape[], frameId: string): Shape[] => {
  const frame = shapes.find((shape) => shape.id === frameId && shape.type === "frame");
  if (!frame) return shapes;
  const frameBounds = shapeBounds(frame);
  const candidates = shapes.filter((shape) =>
    shape.id !== frameId &&
    (shape.pageId ?? "page:default") === (frame.pageId ?? "page:default") &&
    shape.parentId === (frame.parentId ?? null) &&
    !shape.locked &&
    boundsContainBounds(frameBounds, shapeBounds(shape))
  );
  const adopted = new Set(rootSelectionIds(shapes, candidates.map((shape) => shape.id)));
  if (!adopted.size) return shapes;
  const back = Math.min(frame.zIndex, ...candidates.map((shape) => shape.zIndex)) - 1;
  return shapes.map((shape) => {
    if (shape.id === frameId) return { ...shape, zIndex: back };
    return adopted.has(shape.id) ? { ...shape, parentId: frameId } : shape;
  });
};
