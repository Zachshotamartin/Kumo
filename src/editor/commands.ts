import { createShapeId, Shape } from "../classes/shape";
import { normalizeShape, selectionBounds, shapeBounds } from "./geometry";

export type AlignMode = "left" | "horizontal-center" | "right" | "top" | "vertical-center" | "bottom";
export type OrderMode = "front" | "forward" | "backward" | "back";

/** Applies the local document delta to the latest remote document. */
export const mergeShapeChanges = (
  baseline: Shape[],
  local: Shape[],
  remote: Shape[]
): Shape[] => {
  const baselineById = new Map(baseline.map((shape) => [shape.id, shape]));
  const localById = new Map(local.map((shape) => [shape.id, shape]));
  const deletedLocally = new Set(
    baseline.filter((shape) => !localById.has(shape.id)).map((shape) => shape.id)
  );
  const changedLocally = new Set(
    local
      .filter((shape) => JSON.stringify(baselineById.get(shape.id)) !== JSON.stringify(shape))
      .map((shape) => shape.id)
  );

  const merged = remote
    .filter((shape) => !deletedLocally.has(shape.id))
    .map((shape) => changedLocally.has(shape.id) ? localById.get(shape.id) ?? shape : shape);
  const remoteIds = new Set(remote.map((shape) => shape.id));
  local.forEach((shape) => {
    if (!remoteIds.has(shape.id) && changedLocally.has(shape.id)) merged.push(shape);
  });
  return merged;
};

export const patchShapes = (
  shapes: Shape[],
  selectedIds: readonly string[],
  patch: Partial<Shape>
): Shape[] =>
  shapes.map((shape) =>
    selectedIds.includes(shape.id) && !shape.locked
      ? normalizeShape({ ...shape, ...patch })
      : shape
  );

export const deleteShapes = (
  shapes: Shape[],
  selectedIds: readonly string[]
): Shape[] => shapes.filter((shape) => !selectedIds.includes(shape.id) || shape.locked);

export const duplicateShapes = (
  shapes: Shape[],
  selectedIds: readonly string[],
  offset = 16
): { shapes: Shape[]; duplicatedIds: string[] } => {
  const selected = shapes.filter((shape) => selectedIds.includes(shape.id));
  const groupIdMap = new Map<string, string>();
  const highestZ = shapes.reduce((value, shape) => Math.max(value, shape.zIndex), 0);
  const duplicates = selected.map((shape, index) => {
    const id = createShapeId();
    let groupId = shape.groupId ?? null;
    if (groupId) {
      if (!groupIdMap.has(groupId)) groupIdMap.set(groupId, createShapeId());
      groupId = groupIdMap.get(groupId) ?? null;
    }

    return normalizeShape({
      ...shape,
      id,
      name: `${shape.name ?? shape.type} copy`,
      groupId,
      x1: shape.x1 + offset,
      x2: shape.x2 + offset,
      y1: shape.y1 + offset,
      y2: shape.y2 + offset,
      zIndex: highestZ + index + 1,
    });
  });

  return {
    shapes: [...shapes, ...duplicates],
    duplicatedIds: duplicates.map((shape) => shape.id),
  };
};

export const orderShapes = (
  shapes: Shape[],
  selectedIds: readonly string[],
  mode: OrderMode
): Shape[] => {
  const ordered = [...shapes].sort((a, b) => a.zIndex - b.zIndex);
  const selected = new Set(selectedIds);

  if (mode === "front" || mode === "back") {
    const selectedShapes = ordered.filter((shape) => selected.has(shape.id));
    const rest = ordered.filter((shape) => !selected.has(shape.id));
    const next = mode === "front" ? [...rest, ...selectedShapes] : [...selectedShapes, ...rest];
    return next.map((shape, index) => ({ ...shape, zIndex: index + 1 }));
  }

  const direction = mode === "forward" ? 1 : -1;
  const indices = direction > 0
    ? ordered.map((_, index) => index).reverse()
    : ordered.map((_, index) => index);

  indices.forEach((index) => {
    const neighbor = index + direction;
    const currentShape = ordered[index];
    const neighborShape = ordered[neighbor];
    if (
      currentShape &&
      neighborShape &&
      selected.has(currentShape.id) &&
      !selected.has(neighborShape.id)
    ) {
      ordered[index] = neighborShape;
      ordered[neighbor] = currentShape;
    }
  });

  return ordered.map((shape, index) => ({ ...shape, zIndex: index + 1 }));
};

export const alignShapes = (
  shapes: Shape[],
  selectedIds: readonly string[],
  mode: AlignMode
): Shape[] => {
  const bounds = selectionBounds(shapes, selectedIds);
  if (!bounds || selectedIds.length < 2) return shapes;

  return shapes.map((shape) => {
    if (!selectedIds.includes(shape.id) || shape.locked) return shape;
    const current = shapeBounds(shape);
    let x = current.x;
    let y = current.y;

    if (mode === "left") x = bounds.x;
    if (mode === "horizontal-center") x = bounds.x + (bounds.width - current.width) / 2;
    if (mode === "right") x = bounds.x + bounds.width - current.width;
    if (mode === "top") y = bounds.y;
    if (mode === "vertical-center") y = bounds.y + (bounds.height - current.height) / 2;
    if (mode === "bottom") y = bounds.y + bounds.height - current.height;

    return normalizeShape({
      ...shape,
      x1: x,
      y1: y,
      x2: x + current.width,
      y2: y + current.height,
    });
  });
};

export const distributeShapes = (
  shapes: Shape[],
  selectedIds: readonly string[],
  axis: "horizontal" | "vertical"
): Shape[] => {
  const selected = shapes
    .filter((shape) => selectedIds.includes(shape.id) && !shape.locked)
    .sort((a, b) => {
      const aBounds = shapeBounds(a);
      const bBounds = shapeBounds(b);
      return axis === "horizontal" ? aBounds.x - bBounds.x : aBounds.y - bBounds.y;
    });
  if (selected.length < 3) return shapes;

  const first = shapeBounds(selected[0]!);
  const last = shapeBounds(selected[selected.length - 1]!);
  const totalSize = selected.reduce((sum, shape) => {
    const bounds = shapeBounds(shape);
    return sum + (axis === "horizontal" ? bounds.width : bounds.height);
  }, 0);
  const available = axis === "horizontal"
    ? last.x + last.width - first.x
    : last.y + last.height - first.y;
  const gap = (available - totalSize) / (selected.length - 1);
  const positions = new Map<string, number>();
  let cursor = axis === "horizontal" ? first.x : first.y;
  selected.forEach((shape) => {
    positions.set(shape.id, cursor);
    const bounds = shapeBounds(shape);
    cursor += (axis === "horizontal" ? bounds.width : bounds.height) + gap;
  });

  return shapes.map((shape) => {
    const position = positions.get(shape.id);
    if (position === undefined) return shape;
    const bounds = shapeBounds(shape);
    const x = axis === "horizontal" ? position : bounds.x;
    const y = axis === "vertical" ? position : bounds.y;
    return normalizeShape({ ...shape, x1: x, y1: y, x2: x + bounds.width, y2: y + bounds.height });
  });
};

export const groupShapes = (
  shapes: Shape[],
  selectedIds: readonly string[],
  groupId = createShapeId()
): Shape[] =>
  selectedIds.length < 2
    ? shapes
    : shapes.map((shape) =>
        selectedIds.includes(shape.id) ? { ...shape, groupId } : shape
      );

export const ungroupShapes = (
  shapes: Shape[],
  selectedIds: readonly string[]
): Shape[] => {
  const groups = new Set(
    shapes
      .filter((shape) => selectedIds.includes(shape.id) && shape.groupId)
      .map((shape) => shape.groupId as string)
  );
  return shapes.map((shape) =>
    shape.groupId && groups.has(shape.groupId) ? { ...shape, groupId: null } : shape
  );
};
