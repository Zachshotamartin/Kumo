import { createShapeId, Shape, ShapeFunctions } from "../classes/shape";
import {
  editableSelectionIds,
  expandSelectionIds,
  normalizeShape,
  selectionBounds,
  shapeVisualBounds,
} from "./geometry";
import {
  commonParentId,
  descendantIds,
  frameAtPoint,
  rootSelectionIds,
} from "./hierarchy";
import type { Bounds, PasteContext, Point } from "./types";

export type AlignMode = "left" | "horizontal-center" | "right" | "top" | "vertical-center" | "bottom";
export type OrderMode = "front" | "forward" | "backward" | "back";
export type RelativeOrder = "front" | "back";

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

const orderedLayerUnits = (shapes: Shape[]): Shape[][] => {
  const ordered = orderedShapes(shapes);
  const visitedGroups = new Set<string>();
  const units: Shape[][] = [];
  ordered.forEach((shape) => {
    if (!shape.groupId) {
      units.push([shape]);
      return;
    }
    if (visitedGroups.has(shape.groupId)) return;
    visitedGroups.add(shape.groupId);
    units.push(ordered.filter((candidate) => candidate.groupId === shape.groupId));
  });
  return units;
};

const expandedLayerOrder = (shapes: Shape[], roots: Shape[]): string[] => {
  const seen = new Set<string>();
  const ids: string[] = [];
  roots.forEach((root) => {
    const unit = [
      root,
      ...orderedShapes(shapes.filter((shape) => descendantIds(shapes, [root.id]).has(shape.id))),
    ];
    unit.forEach((shape) => {
      if (seen.has(shape.id)) return;
      seen.add(shape.id);
      ids.push(shape.id);
    });
  });
  return ids;
};

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
  const roots = new Set(rootSelectionIds(shapes, selectedIds));
  const editable = editableSelectionIds(shapes, selectedIds);
  const visitedGroups = new Set<string>();
  const units: SelectionUnit[] = [];

  orderedShapes(shapes).forEach((shape) => {
    if (!roots.has(shape.id)) return;
    const members = shape.groupId
      ? shapes.filter((candidate) => candidate.groupId === shape.groupId)
      : [shape];
    if (shape.groupId) {
      if (visitedGroups.has(shape.groupId)) return;
      visitedGroups.add(shape.groupId);
    }
    const bounds = unitBounds(members);
    if (!bounds) return;
    units.push({
      ids: shape.type === "frame"
        ? [shape.id, ...descendantIds(shapes, [shape.id])]
        : members.map((member) => member.id),
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
  offset: Point,
  groupIdMap: Map<string, string>,
  groupCounts: Map<string, number>,
  shapeIdMap: Map<string, string>,
  targetParentId: string | null | undefined,
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
    id: shapeIdMap.get(shape.id) ?? createShapeId(),
    name: isRoot ? `${shape.name ?? shape.type} copy` : shape.name,
    groupId,
    parentId: shape.parentId && shapeIdMap.has(shape.parentId)
      ? shapeIdMap.get(shape.parentId)!
      : isRoot
        ? targetParentId !== undefined
          ? targetParentId
          : shape.parentId ?? null
        : shape.parentId ?? null,
    x1: shape.x1 + offset.x,
    x2: shape.x2 + offset.x,
    y1: shape.y1 + offset.y,
    y2: shape.y2 + offset.y,
    zIndex: isRoot ? rootZIndex : shape.zIndex,
    ...(shape.shapes
      ? {
          shapes: shape.shapes.map((child) =>
            cloneShapeTree(
              child,
              offset,
              groupIdMap,
              groupCounts,
              shapeIdMap,
              targetParentId,
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
  offset: number | Point,
  targetParentId?: string | null
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
  const shapeIdMap = new Map(sources.map((shape) => [shape.id, createShapeId()]));
  const duplicatedRootIds = sources
    .filter((shape) => !shape.parentId || !shapeIdMap.has(shape.parentId))
    .map((shape) => shapeIdMap.get(shape.id)!);
  const translation = typeof offset === "number" ? { x: offset, y: offset } : offset;
  const duplicated = sources.map((shape, index) =>
    cloneShapeTree(
      shape,
      translation,
      groupIdMap,
      groupCounts,
      shapeIdMap,
      targetParentId,
      highestZ + index + 1
    )
  );

  return {
    shapes: [...shapes, ...duplicated],
    duplicated,
    duplicatedIds: duplicatedRootIds,
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
  const direct = new Set(selectedIds);
  const selectedGroups = new Set(
    shapes.filter((shape) => direct.has(shape.id) && shape.groupId).map((shape) => shape.groupId!)
  );
  const selected = new Set(shapes
    .filter((shape) => direct.has(shape.id) || Boolean(shape.groupId && selectedGroups.has(shape.groupId)))
    .filter((shape) => Object.keys(patch).every((key) => key === "locked") || editableSelectionIds(shapes, [shape.id]).has(shape.id))
    .map((shape) => shape.id));
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
  rootSelectionIds(shapes, selectedIds).forEach((id) => {
    const root = shapes.find((shape) => shape.id === id);
    if (root?.type === "frame" && deletable.has(root.id)) {
      descendantIds(shapes, [root.id]).forEach((descendantId) => deletable.add(descendantId));
    }
  });
  return shapes.filter((shape) => !deletable.has(shape.id));
};

export const duplicateShapes = (
  shapes: Shape[],
  selectedIds: readonly string[],
  offset?: number | Point
): { shapes: Shape[]; duplicated: Shape[]; duplicatedIds: string[] } => {
  const roots = rootSelectionIds(shapes, selectedIds);
  const selected = selectedInLayerOrder(shapes, roots);
  const rootShapes = roots.map((id) => shapes.find((shape) => shape.id === id)).filter(Boolean) as Shape[];
  const parentIds = new Set(rootShapes.map((shape) => shape.parentId ?? null));
  const defaultOffset = rootShapes.length === 1 && rootShapes[0]!.type === "frame" && !rootShapes[0]!.parentId
    ? { x: shapeVisualBounds(rootShapes[0]!).width + 48, y: 0 }
    : 16;
  return cloneIntoDocument(
    shapes,
    selected,
    offset ?? defaultOffset,
    parentIds.size === 1 ? commonParentId(shapes, roots) : undefined
  );
};

export const copyShapes = (
  shapes: Shape[],
  selectedIds: readonly string[]
): Shape[] => JSON.parse(JSON.stringify(selectedInLayerOrder(shapes, selectedIds))) as Shape[];

export interface PasteOptions {
  offset?: number | Point;
  context?: PasteContext;
  /** Bounds of the source selection's former parent, used to preserve frame-relative coordinates. */
  sourceParentBounds?: Bounds | null;
}

const centeredOffset = (source: Bounds, target: Bounds): Point => ({
  x: target.x + (target.width - source.width) / 2 - source.x,
  y: target.y + (target.height - source.height) / 2 - source.y,
});

const pastePlacement = (
  shapes: Shape[],
  clipboard: Shape[],
  options: PasteOptions
): { offset: number | Point; targetParentId?: string | null } => {
  const source = selectionBounds(clipboard, clipboard.map((shape) => shape.id));
  if (!source) return { offset: options.offset ?? 24 };
  const context = options.context;
  if (!context) return { offset: options.offset ?? 24 };

  if (context.point) {
    const target = frameAtPoint(shapes, context.point);
    return {
      offset: { x: context.point.x - source.x, y: context.point.y - source.y },
      targetParentId: target?.id ?? null,
    };
  }

  const explicitTarget = context.targetFrameId
    ? shapes.find((shape) => shape.id === context.targetFrameId && shape.type === "frame")
    : undefined;
  const clipboardIds = new Set(clipboard.map((shape) => shape.id));
  const includesRootFrame = clipboard.some((shape) =>
    shape.type === "frame" && (!shape.parentId || !clipboardIds.has(shape.parentId))
  );
  if (explicitTarget && !includesRootFrame) {
    const targetBounds = shapeVisualBounds(explicitTarget);
    const centered = centeredOffset(source, targetBounds);
    if (!options.sourceParentBounds) {
      return { offset: centered, targetParentId: explicitTarget.id };
    }
    const sourceParent = options.sourceParentBounds;
    const relative = {
      x: targetBounds.x + (source.x - sourceParent.x) - source.x,
      y: targetBounds.y + (source.y - sourceParent.y) - source.y,
    };
    const fitsX = source.x + relative.x >= targetBounds.x &&
      source.x + relative.x + source.width <= targetBounds.x + targetBounds.width;
    const fitsY = source.y + relative.y >= targetBounds.y &&
      source.y + relative.y + source.height <= targetBounds.y + targetBounds.height;
    return {
      offset: { x: fitsX ? relative.x : centered.x, y: fitsY ? relative.y : centered.y },
      targetParentId: explicitTarget.id,
    };
  }

  if (context.viewport) {
    const view = context.viewport;
    const visible = source.x < view.x + view.width &&
      source.x + source.width > view.x &&
      source.y < view.y + view.height &&
      source.y + source.height > view.y;
    return {
      offset: visible ? options.offset ?? { x: 0, y: 0 } : centeredOffset(source, view),
      targetParentId: null,
    };
  }
  return { offset: options.offset ?? 24 };
};

export const pasteShapes = (
  shapes: Shape[],
  clipboard: Shape[],
  options: PasteOptions | number = {}
): { shapes: Shape[]; pasted: Shape[]; pastedIds: string[] } => {
  const normalizedOptions = typeof options === "number" ? { offset: options } : options;
  const placement = pastePlacement(shapes, clipboard, normalizedOptions);
  const result = cloneIntoDocument(
    shapes,
    orderedShapes(clipboard),
    placement.offset,
    placement.targetParentId
  );
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
  const roots = rootSelectionIds(shapes, selectedIds);
  const parentSet = new Set(roots.map((id) => shapes.find((shape) => shape.id === id)?.parentId ?? null));
  if (parentSet.size !== 1) return shapes;
  const parentId = commonParentId(shapes, roots);
  if (!roots.length || parentId === undefined) return shapes;
  const rootSet = new Set(roots);
  const selectedGroups = new Set(
    shapes.filter((shape) => rootSet.has(shape.id) && shape.groupId).map((shape) => shape.groupId!)
  );
  const selected = new Set(shapes
    .filter((shape) => (shape.parentId ?? null) === parentId)
    .filter((shape) => rootSet.has(shape.id) || Boolean(shape.groupId && selectedGroups.has(shape.groupId)))
    .filter((shape) => editableSelectionIds(shapes, [shape.id]).has(shape.id))
    .map((shape) => shape.id));
  if (!selected.size) return shapes;

  const ordered = orderedShapes(shapes.filter((shape) => (shape.parentId ?? null) === parentId));
  const originalOrder = ordered.map((shape) => shape.id);
  let next: Shape[];

  if (mode === "front" || mode === "back") {
    const selectedShapes = ordered.filter((shape) => selected.has(shape.id));
    const rest = ordered.filter((shape) => !selected.has(shape.id));
    next = mode === "front" ? [...rest, ...selectedShapes] : [...selectedShapes, ...rest];
  } else {
    const units = orderedLayerUnits(ordered);
    const direction = mode === "forward" ? 1 : -1;
    const indices = direction > 0
      ? units.map((_, index) => index).reverse()
      : units.map((_, index) => index);

    indices.forEach((index) => {
      const neighbor = index + direction;
      const currentUnit = units[index];
      const neighborUnit = units[neighbor];
      if (
        currentUnit &&
        neighborUnit &&
        currentUnit.every((shape) => selected.has(shape.id)) &&
        neighborUnit.every((shape) => !selected.has(shape.id))
      ) {
        units[index] = neighborUnit;
        units[neighbor] = currentUnit;
      }
    });
    next = units.flat();
  }
  if (next.every((shape, index) => shape.id === originalOrder[index])) return shapes;
  const expandedIds = expandedLayerOrder(shapes, next);
  const zSlots = expandedIds
    .map((id) => shapes.find((shape) => shape.id === id)!.zIndex)
    .sort((left, right) => left - right);
  const zById = new Map(expandedIds.map((id, index) => [id, zSlots[index] ?? index + 1]));
  return orderedShapes(shapes.map((shape) => zById.has(shape.id)
    ? { ...shape, zIndex: zById.get(shape.id)! }
    : shape));
};

/**
 * Moves a layer or logical group directly beside another layer or group.
 * `front` places the moving unit above the target in the visual stack while
 * `back` places it below. Relative order inside both units is preserved.
 */
export const moveShapesRelative = (
  shapes: Shape[],
  selectedIds: readonly string[],
  targetId: string,
  placement: RelativeOrder
): Shape[] => {
  const roots = rootSelectionIds(shapes, selectedIds);
  if (new Set(roots.map((id) => shapes.find((shape) => shape.id === id)?.parentId ?? null)).size !== 1) {
    return shapes;
  }
  const parentId = commonParentId(shapes, roots);
  const targetShape = shapes.find((shape) => shape.id === targetId);
  if (!targetShape || (targetShape.parentId ?? null) !== parentId) return shapes;
  const rootSet = new Set(roots);
  const movingGroups = new Set(
    shapes.filter((shape) => rootSet.has(shape.id) && shape.groupId).map((shape) => shape.groupId!)
  );
  const moving = new Set(shapes
    .filter((shape) => (shape.parentId ?? null) === parentId)
    .filter((shape) => rootSet.has(shape.id) || Boolean(shape.groupId && movingGroups.has(shape.groupId)))
    .map((shape) => shape.id));
  const editable = editableSelectionIds(shapes, roots);
  if ([...moving].some((id) => !editable.has(id))) return shapes;
  const target = new Set(targetShape.groupId
    ? shapes.filter((shape) => shape.groupId === targetShape.groupId && (shape.parentId ?? null) === parentId).map((shape) => shape.id)
    : [targetId]);
  if (
    moving.size === 0 ||
    target.size === 0 ||
    [...moving].some((id) => target.has(id))
  ) {
    return shapes;
  }

  const ordered = orderedShapes(shapes.filter((shape) => (shape.parentId ?? null) === parentId));
  const originalOrder = ordered.map((shape) => shape.id);
  const units = orderedLayerUnits(ordered);
  const movingUnits = units.filter((unit) => unit.every((shape) => moving.has(shape.id)));
  const remainingUnits = units.filter((unit) => unit.every((shape) => !moving.has(shape.id)));
  const targetIndex = remainingUnits.findIndex((unit) =>
    unit.some((shape) => target.has(shape.id))
  );
  if (targetIndex < 0) return shapes;

  const insertionIndex = placement === "front" ? targetIndex + 1 : targetIndex;
  const next = [
    ...remainingUnits.slice(0, insertionIndex),
    ...movingUnits,
    ...remainingUnits.slice(insertionIndex),
  ].flat();
  if (next.every((shape, index) => shape.id === originalOrder[index])) return shapes;
  const expandedIds = expandedLayerOrder(shapes, next);
  const zSlots = expandedIds
    .map((id) => shapes.find((shape) => shape.id === id)!.zIndex)
    .sort((left, right) => left - right);
  const zById = new Map(expandedIds.map((id, index) => [id, zSlots[index] ?? index + 1]));
  return orderedShapes(shapes.map((shape) => zById.has(shape.id)
    ? { ...shape, zIndex: zById.get(shape.id)! }
    : shape));
};

export const alignShapes = (
  shapes: Shape[],
  selectedIds: readonly string[],
  mode: AlignMode
): Shape[] => {
  const units = selectionUnits(shapes, selectedIds).filter((unit) => !unit.locked);
  if (!units.length) return shapes;
  const rootIds = rootSelectionIds(shapes, selectedIds);
  const sharedParentId = commonParentId(shapes, rootIds);
  const parent = units.length === 1 && sharedParentId
    ? shapes.find((shape) => shape.id === sharedParentId && shape.type === "frame")
    : undefined;
  const bounds = parent
    ? shapeVisualBounds(parent)
    : unitBounds(units.map((unit) => normalizeShape({
        ...ShapeFunctions.createShape("rectangle", unit.bounds.x, unit.bounds.y, []),
        x2: unit.bounds.x + unit.bounds.width,
        y2: unit.bounds.y + unit.bounds.height,
      })));
  if (!bounds || (units.length < 2 && !parent)) return shapes;
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
  const roots = rootSelectionIds(shapes, selectedIds);
  if (new Set(roots.map((id) => shapes.find((shape) => shape.id === id)?.parentId ?? null)).size !== 1) {
    return shapes;
  }
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
  const roots = rootSelectionIds(shapes, selectedIds);
  if (new Set(roots.map((id) => shapes.find((shape) => shape.id === id)?.parentId ?? null)).size > 1) {
    return shapes;
  }
  const rootSet = new Set(roots);
  const selectedGroupIds = new Set(
    shapes.filter((shape) => rootSet.has(shape.id) && shape.groupId).map((shape) => shape.groupId!)
  );
  const selected = new Set(shapes
    .filter((shape) => rootSet.has(shape.id) || Boolean(shape.groupId && selectedGroupIds.has(shape.groupId)))
    .map((shape) => shape.id));
  const editable = editableSelectionIds(shapes, roots);
  if ([...selected].some((id) => !editable.has(id)) || selected.size < 2) return shapes;
  const ordered = orderedShapes(shapes);
  const selectedBeforeGrouping = ordered.filter((shape) => selected.has(shape.id));
  const existingGroupId = selectedBeforeGrouping[0]?.groupId;
  if (
    existingGroupId &&
    selectedBeforeGrouping.every((shape) => shape.groupId === existingGroupId)
  ) {
    return shapes;
  }
  const selectedShapes = ordered
    .filter((shape) => selected.has(shape.id))
    .map((shape) => ({ ...shape, groupId, groupName: "Group", groupRotation }));
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
  const direct = new Set(rootSelectionIds(shapes, selectedIds));
  const groups = new Set(
    shapes
      .filter((shape) => direct.has(shape.id) && shape.groupId && editableSelectionIds(shapes, [shape.id]).has(shape.id))
      .map((shape) => shape.groupId as string)
  );
  return shapes.map((shape) =>
    shape.groupId && groups.has(shape.groupId)
      ? { ...shape, groupId: null, groupName: undefined, groupRotation: undefined }
      : shape
  );
};

export const frameShapes = (
  shapes: Shape[],
  selectedIds: readonly string[]
): { shapes: Shape[]; frameId: string | null } => {
  const roots = rootSelectionIds(shapes, selectedIds);
  if (new Set(roots.map((id) => shapes.find((shape) => shape.id === id)?.parentId ?? null)).size !== 1) {
    return { shapes, frameId: null };
  }
  const editable = editableSelectionIds(shapes, roots);
  if (!roots.length || roots.some((id) => !editable.has(id))) {
    return { shapes, frameId: null };
  }
  const parentId = commonParentId(shapes, roots);
  const bounds = selectionBounds(shapes, roots);
  if (!bounds) return { shapes, frameId: null };
  const frame = normalizeShape({
    ...ShapeFunctions.createShape("frame", bounds.x, bounds.y, shapes),
    name: "Frame",
    x2: bounds.x + Math.max(1, bounds.width),
    y2: bounds.y + Math.max(1, bounds.height),
    parentId,
    clipContent: true,
    backgroundColor: "transparent",
    borderColor: "#8b8d92",
    borderWidth: 1,
    zIndex: Math.min(...roots.map((id) => shapes.find((shape) => shape.id === id)!.zIndex)) - 1,
  });
  const rootSet = new Set(roots);
  return {
    shapes: [...shapes.map((shape) => rootSet.has(shape.id)
      ? { ...shape, parentId: frame.id }
      : shape), frame],
    frameId: frame.id,
  };
};

export const unframeShapes = (
  shapes: Shape[],
  selectedIds: readonly string[]
): { shapes: Shape[]; selectedIds: string[] } => {
  const selected = new Set(selectedIds);
  const frames = shapes.filter((shape) =>
    selected.has(shape.id) && shape.type === "frame" && !shape.locked
  );
  if (!frames.length) return { shapes, selectedIds: [...selectedIds] };
  const frameById = new Map(frames.map((frame) => [frame.id, frame]));
  const releasedIds = shapes
    .filter((shape) => frameById.has(shape.parentId ?? ""))
    .map((shape) => shape.id);
  const next = shapes
    .filter((shape) => !frameById.has(shape.id))
    .map((shape) => frameById.has(shape.parentId ?? "")
      ? { ...shape, parentId: frameById.get(shape.parentId!)!.parentId ?? null }
      : shape);
  return {
    shapes: next,
    selectedIds: releasedIds,
  };
};
