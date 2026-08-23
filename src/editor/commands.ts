import { createShapeId, Shape } from "../classes/shape";
import {
  editableSelectionIds,
  expandSelectionIds,
  normalizeShape,
  selectionBounds,
  shapeVisualBounds,
} from "./geometry";
import type { Bounds } from "./types";

export type AlignMode = "left" | "horizontal-center" | "right" | "top" | "vertical-center" | "bottom";
export type OrderMode = "front" | "forward" | "backward" | "back";

const translateShape = (shape: Shape, x: number, y: number): Shape => ({
  ...shape,
  x1: shape.x1 + x,
  x2: shape.x2 + x,
  y1: shape.y1 + y,
  y2: shape.y2 + y,
  ...(shape.shapes
    ? { shapes: shape.shapes.map((child) => translateShape(child, x, y)) }
    : {}),
});

const orderedShapes = (shapes: Shape[]): Shape[] =>
  shapes
    .map((shape, index) => ({ shape, index }))
    .sort((left, right) =>
      left.shape.zIndex - right.shape.zIndex || left.index - right.index
    )
    .map(({ shape }) => shape);

const selectedInLayerOrder = (
  shapes: Shape[],
  selectedIds: readonly string[]
): Shape[] => {
  const selected = expandGroupedSelection(shapes, selectedIds);
  return orderedShapes(shapes).filter((shape) => selected.has(shape.id));
};

export const expandGroupedSelection = (
  shapes: Shape[],
  selectedIds: readonly string[]
): Set<string> => expandSelectionIds(shapes, selectedIds);

interface SelectionUnit {
  ids: string[];
  bounds: Bounds;
  locked: boolean;
}

const unitBounds = (shapes: Shape[]): Bounds | null => {
  const visible = shapes.filter((shape) => !shape.hidden);
  if (!visible.length) return null;
  const bounds = visible.map(shapeVisualBounds);
  const left = Math.min(...bounds.map((item) => item.x));
  const top = Math.min(...bounds.map((item) => item.y));
  const right = Math.max(...bounds.map((item) => item.x + item.width));
  const bottom = Math.max(...bounds.map((item) => item.y + item.height));
  return { x: left, y: top, width: right - left, height: bottom - top };
};

const selectionUnits = (
  shapes: Shape[],
  selectedIds: readonly string[]
): SelectionUnit[] => {
  const expanded = expandSelectionIds(shapes, selectedIds);
  const editable = editableSelectionIds(shapes, selectedIds);
  const visitedGroups = new Set<string>();
  const units: SelectionUnit[] = [];

  orderedShapes(shapes).forEach((shape) => {
    if (!expanded.has(shape.id)) return;
    const members = shape.groupId
      ? shapes.filter((candidate) => candidate.groupId === shape.groupId && expanded.has(candidate.id))
      : [shape];
    if (shape.groupId) {
      if (visitedGroups.has(shape.groupId)) return;
      visitedGroups.add(shape.groupId);
    }
    const bounds = unitBounds(members);
    if (!bounds) return;
    units.push({
      ids: members.map((member) => member.id),
      bounds,
      locked: members.some((member) => !editable.has(member.id)),
    });
  });
  return units;
};

const duplicatedGroupCounts = (shapes: Shape[]): Map<string, number> => {
  const counts = new Map<string, number>();
  const visit = (shape: Shape) => {
    if (shape.groupId) counts.set(shape.groupId, (counts.get(shape.groupId) ?? 0) + 1);
    shape.shapes?.forEach(visit);
  };
  shapes.forEach(visit);
  return counts;
};

const cloneShapeTree = (
  shape: Shape,
  offset: number,
  groupIdMap: Map<string, string>,
  groupCounts: Map<string, number>,
  rootZIndex: number,
  isRoot = true
): Shape => {
  const sourceGroupId = shape.groupId ?? null;
  let groupId: string | null = null;
  if (sourceGroupId && (groupCounts.get(sourceGroupId) ?? 0) > 1) {
    if (!groupIdMap.has(sourceGroupId)) groupIdMap.set(sourceGroupId, createShapeId());
    groupId = groupIdMap.get(sourceGroupId) ?? null;
  }

  return normalizeShape({
    ...shape,
    id: createShapeId(),
    name: isRoot ? `${shape.name ?? shape.type} copy` : shape.name,
    groupId,
    x1: shape.x1 + offset,
    x2: shape.x2 + offset,
    y1: shape.y1 + offset,
    y2: shape.y2 + offset,
    zIndex: isRoot ? rootZIndex : shape.zIndex,
    ...(shape.shapes
      ? {
          shapes: shape.shapes.map((child) =>
            cloneShapeTree(
              child,
              offset,
              groupIdMap,
              groupCounts,
              child.zIndex,
              false
            )
          ),
        }
      : {}),
  });
};

const cloneIntoDocument = (
  shapes: Shape[],
  sources: Shape[],
  offset: number
): { shapes: Shape[]; duplicated: Shape[]; duplicatedIds: string[] } => {
  if (sources.length === 0) {
    return { shapes, duplicated: [], duplicatedIds: [] };
  }
  const highestZ = shapes.reduce(
    (value, shape) => Math.max(value, Number.isFinite(shape.zIndex) ? shape.zIndex : 0),
    0
  );
  const groupIdMap = new Map<string, string>();
  const groupCounts = duplicatedGroupCounts(sources);
  const duplicated = sources.map((shape, index) =>
    cloneShapeTree(
      shape,
      offset,
      groupIdMap,
      groupCounts,
      highestZ + index + 1
    )
  );

  return {
    shapes: [...shapes, ...duplicated],
    duplicated,
    duplicatedIds: duplicated.map((shape) => shape.id),
  };
};

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
    if (
      !remoteIds.has(shape.id) &&
      !baselineById.has(shape.id) &&
      changedLocally.has(shape.id)
    ) {
      merged.push(shape);
    }
  });
  return merged;
};

export const patchShapes = (
  shapes: Shape[],
  selectedIds: readonly string[],
  patch: Partial<Shape>
): Shape[] => {
  const selected = Object.keys(patch).every((key) => key === "locked")
    ? expandSelectionIds(shapes, selectedIds)
    : editableSelectionIds(shapes, selectedIds);
  return shapes.map((shape) =>
    selected.has(shape.id)
      ? normalizeShape({ ...shape, ...patch })
      : shape
  );
};

export const deleteShapes = (
  shapes: Shape[],
  selectedIds: readonly string[]
): Shape[] => {
  const deletable = editableSelectionIds(shapes, selectedIds);
  return shapes.filter((shape) => !deletable.has(shape.id));
};

export const duplicateShapes = (
  shapes: Shape[],
  selectedIds: readonly string[],
  offset = 16
): { shapes: Shape[]; duplicated: Shape[]; duplicatedIds: string[] } =>
  cloneIntoDocument(shapes, selectedInLayerOrder(shapes, selectedIds), offset);

export const copyShapes = (
  shapes: Shape[],
  selectedIds: readonly string[]
): Shape[] => JSON.parse(JSON.stringify(selectedInLayerOrder(shapes, selectedIds))) as Shape[];

export const pasteShapes = (
  shapes: Shape[],
  clipboard: Shape[],
  offset = 24
): { shapes: Shape[]; pasted: Shape[]; pastedIds: string[] } => {
  const result = cloneIntoDocument(shapes, orderedShapes(clipboard), offset);
  return {
    shapes: result.shapes,
    pasted: result.duplicated,
    pastedIds: result.duplicatedIds,
  };
};

export const orderShapes = (
  shapes: Shape[],
  selectedIds: readonly string[],
  mode: OrderMode
): Shape[] => {
  const ordered = orderedShapes(shapes);
  const originalOrder = ordered.map((shape) => shape.id);
  const selected = editableSelectionIds(shapes, selectedIds);
  if (selected.size === 0) return shapes;

  if (mode === "front" || mode === "back") {
    const selectedShapes = ordered.filter((shape) => selected.has(shape.id));
    const rest = ordered.filter((shape) => !selected.has(shape.id));
    const next = mode === "front" ? [...rest, ...selectedShapes] : [...selectedShapes, ...rest];
    if (next.every((shape, index) => shape.id === originalOrder[index])) return shapes;
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

  if (ordered.every((shape, index) => shape.id === originalOrder[index])) return shapes;
  return ordered.map((shape, index) => ({ ...shape, zIndex: index + 1 }));
};

export const alignShapes = (
  shapes: Shape[],
  selectedIds: readonly string[],
  mode: AlignMode
): Shape[] => {
  const units = selectionUnits(shapes, selectedIds).filter((unit) => !unit.locked);
  const bounds = selectionBounds(shapes, units.flatMap((unit) => unit.ids));
  if (!bounds || units.length < 2) return shapes;
  const deltas = new Map<string, { x: number; y: number }>();

  units.forEach((unit) => {
    const current = unit.bounds;
    let deltaX = 0;
    let deltaY = 0;

    if (mode === "left") deltaX = bounds.x - current.x;
    if (mode === "horizontal-center") {
      deltaX = bounds.x + bounds.width / 2 - (current.x + current.width / 2);
    }
    if (mode === "right") {
      deltaX = bounds.x + bounds.width - (current.x + current.width);
    }
    if (mode === "top") deltaY = bounds.y - current.y;
    if (mode === "vertical-center") {
      deltaY = bounds.y + bounds.height / 2 - (current.y + current.height / 2);
    }
    if (mode === "bottom") {
      deltaY = bounds.y + bounds.height - (current.y + current.height);
    }

    unit.ids.forEach((id) => deltas.set(id, { x: deltaX, y: deltaY }));
  });

  return shapes.map((shape) => {
    const delta = deltas.get(shape.id);
    return delta ? translateShape(shape, delta.x, delta.y) : shape;
  });
};

export const distributeShapes = (
  shapes: Shape[],
  selectedIds: readonly string[],
  axis: "horizontal" | "vertical"
): Shape[] => {
  const selected = selectionUnits(shapes, selectedIds)
    .filter((unit) => !unit.locked)
    .sort((a, b) => {
      return axis === "horizontal" ? a.bounds.x - b.bounds.x : a.bounds.y - b.bounds.y;
    });
  if (selected.length < 3) return shapes;

  const first = selected[0]!.bounds;
  const last = selected[selected.length - 1]!.bounds;
  const totalSize = selected.reduce((sum, unit) => {
    return sum + (axis === "horizontal" ? unit.bounds.width : unit.bounds.height);
  }, 0);
  const available = axis === "horizontal"
    ? last.x + last.width - first.x
    : last.y + last.height - first.y;
  const gap = (available - totalSize) / (selected.length - 1);
  const positions = new Map<string, number>();
  let cursor = axis === "horizontal" ? first.x : first.y;
  selected.forEach((unit) => {
    const current = axis === "horizontal" ? unit.bounds.x : unit.bounds.y;
    unit.ids.forEach((id) => positions.set(id, cursor - current));
    cursor += (axis === "horizontal" ? unit.bounds.width : unit.bounds.height) + gap;
  });

  return shapes.map((shape) => {
    const delta = positions.get(shape.id);
    if (delta === undefined) return shape;
    return translateShape(
      shape,
      axis === "horizontal" ? delta : 0,
      axis === "vertical" ? delta : 0
    );
  });
};

export const groupShapes = (
  shapes: Shape[],
  selectedIds: readonly string[],
  groupId = createShapeId(),
  groupRotation = 0
): Shape[] => {
  const expanded = expandSelectionIds(shapes, selectedIds);
  const selected = editableSelectionIds(shapes, selectedIds);
  if (selected.size !== expanded.size) return shapes;
  if (selected.size < 2) return shapes;
  const ordered = orderedShapes(shapes);
  const selectedShapes = ordered
    .filter((shape) => selected.has(shape.id))
    .map((shape) => ({ ...shape, groupId, groupRotation }));
  const selectedIndexes = ordered
    .map((shape, index) => selected.has(shape.id) ? index : -1)
    .filter((index) => index >= 0);
  const lastSelectedIndex = Math.max(...selectedIndexes);
  const rest = ordered.filter((shape) => !selected.has(shape.id));
  const insertionIndex = ordered
    .slice(0, lastSelectedIndex)
    .filter((shape) => !selected.has(shape.id)).length;
  const next = [
    ...rest.slice(0, insertionIndex),
    ...selectedShapes,
    ...rest.slice(insertionIndex),
  ];
  return next.map((shape, index) => ({ ...shape, zIndex: index + 1 }));
};

export const ungroupShapes = (
  shapes: Shape[],
  selectedIds: readonly string[]
): Shape[] => {
  const editable = editableSelectionIds(shapes, selectedIds);
  const groups = new Set(
    shapes
      .filter((shape) => editable.has(shape.id) && shape.groupId)
      .map((shape) => shape.groupId as string)
  );
  return shapes.map((shape) =>
    shape.groupId && groups.has(shape.groupId)
      ? { ...shape, groupId: null, groupRotation: undefined }
      : shape
  );
};
