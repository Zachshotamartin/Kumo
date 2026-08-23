import { Shape } from "../classes/shape.js";
import {
  Bounds,
  Point,
  ResizeHandle,
  ResizeOptions,
  ResizeTransform,
  SelectionFrame,
  Viewport,
} from "./types.js";
import {
  clippedByAncestor,
  descendantIds,
  isEffectivelyHidden,
  isEffectivelyLocked,
} from "./hierarchy.js";

const EPSILON = 0.0001;
const WHEEL_ZOOM_SENSITIVITY = 0.0045;
const MAX_WHEEL_ZOOM_FACTOR = 1.5;

export const ZOOM_STEP_FACTOR = 1.4;

export const clampZoom = (zoom: number): number =>
  Math.min(8, Math.max(0.1, zoom));

/** A stronger but bounded response for mouse-wheel and trackpad pinch deltas. */
export const wheelZoomFactor = (delta: number): number => {
  const maximumExponent = Math.log(MAX_WHEEL_ZOOM_FACTOR);
  const exponent = Math.min(
    maximumExponent,
    Math.max(-maximumExponent, -delta * WHEEL_ZOOM_SENSITIVITY)
  );
  return Math.exp(exponent);
};

export const shapeBounds = (shape: Shape): Bounds => ({
  x: Math.min(shape.x1, shape.x2),
  y: Math.min(shape.y1, shape.y2),
  width: Math.abs(shape.x2 - shape.x1),
  height: Math.abs(shape.y2 - shape.y1),
});

export const boundsToEdges = (bounds: Bounds) => ({
  x1: bounds.x,
  y1: bounds.y,
  x2: bounds.x + bounds.width,
  y2: bounds.y + bounds.height,
});

export const normalizeShape = (shape: Shape): Shape => {
  const bounds = shapeBounds(shape);
  const normalizedChildren = shape.shapes?.map(normalizeShape);

  return {
    ...shape,
    x1: bounds.x,
    y1: bounds.y,
    x2: bounds.x + bounds.width,
    y2: bounds.y + bounds.height,
    width: bounds.width,
    height: bounds.height,
    rotation: shape.rotation ?? 0,
    groupName: shape.groupId ? shape.groupName?.trim() || "Group" : undefined,
    groupRotation: shape.groupId ? shape.groupRotation ?? 0 : undefined,
    opacity: shape.opacity ?? 1,
    zIndex: Number.isFinite(shape.zIndex) ? shape.zIndex : 0,
    groupId: shape.groupId ?? null,
    parentId: shape.parentId ?? null,
    clipContent: shape.type === "frame" ? shape.clipContent ?? true : shape.clipContent,
    constraintHorizontal: shape.constraintHorizontal ?? "left",
    constraintVertical: shape.constraintVertical ?? "top",
    layoutMode: shape.type === "frame" ? shape.layoutMode ?? "none" : shape.layoutMode,
    layoutWrap: shape.layoutWrap ?? false,
    layoutGap: Math.max(0, shape.layoutGap ?? 12),
    layoutCounterGap: Math.max(0, shape.layoutCounterGap ?? shape.layoutGap ?? 12),
    paddingTop: Math.max(0, shape.paddingTop ?? 16),
    paddingRight: Math.max(0, shape.paddingRight ?? 16),
    paddingBottom: Math.max(0, shape.paddingBottom ?? 16),
    paddingLeft: Math.max(0, shape.paddingLeft ?? 16),
    primaryAlign: shape.primaryAlign ?? "start",
    counterAlign: shape.counterAlign ?? "start",
    horizontalSizing: shape.horizontalSizing ?? "fixed",
    verticalSizing: shape.verticalSizing ?? "fixed",
    layoutPositioning: shape.layoutPositioning ?? "auto",
    layoutGrow: Math.max(0, shape.layoutGrow ?? 0),
    layoutAlign: shape.layoutAlign ?? "inherit",
    textAutoResize: shape.textAutoResize ?? "fixed",
    paragraphSpacing: Math.max(0, shape.paragraphSpacing ?? 0),
    textIndent: Math.max(0, shape.textIndent ?? 0),
    textCase: shape.textCase ?? "original",
    listStyle: shape.listStyle ?? "none",
    fillType: shape.fillType ?? "solid",
    gradientAngle: shape.gradientAngle ?? 90,
    gradientStops: shape.gradientStops ?? [],
    effects: shape.effects ?? [],
    blendMode: shape.blendMode ?? "normal",
    locked: shape.locked ?? false,
    hidden: shape.hidden ?? false,
    ...(normalizedChildren ? { shapes: normalizedChildren } : {}),
  };
};

export const expandSelectionIds = (
  shapes: Shape[],
  selectedIds: readonly string[]
): Set<string> => {
  const selected = new Set(selectedIds);
  let changed = true;
  while (changed) {
    const before = selected.size;
    descendantIds(shapes, selected).forEach((id) => selected.add(id));
    const groups = new Set(
      shapes
        .filter((shape) => selected.has(shape.id) && shape.groupId)
        .map((shape) => shape.groupId as string)
    );
    shapes.forEach((shape) => {
      if (shape.groupId && groups.has(shape.groupId)) selected.add(shape.id);
    });
    changed = selected.size !== before;
  }
  return selected;
};

/** Locked members lock their entire logical group. */
export const editableSelectionIds = (
  shapes: Shape[],
  selectedIds: readonly string[]
): Set<string> => {
  const selected = expandSelectionIds(shapes, selectedIds);
  const lockedGroups = new Set(
    shapes
      .filter((shape) => selected.has(shape.id) && shape.locked && shape.groupId)
      .map((shape) => shape.groupId as string)
  );
  return new Set(
    shapes
      .filter((shape) =>
        selected.has(shape.id) &&
        !isEffectivelyLocked(shapes, shape) &&
        (!shape.groupId || !lockedGroups.has(shape.groupId))
      )
      .map((shape) => shape.id)
  );
};

export const effectiveGridSize = (
  gridSize: number,
  zoom: number,
  minimumScreenSpacing = 8
): number => {
  const safeGrid = Math.max(1, gridSize);
  const safeZoom = Math.max(EPSILON, zoom);
  return safeGrid * Math.max(1, Math.ceil(minimumScreenSpacing / (safeGrid * safeZoom)));
};

export const screenToWorld = (
  screenPoint: Point,
  canvasRect: Pick<DOMRect, "left" | "top">,
  viewport: Viewport
): Point => ({
  x: viewport.x + (screenPoint.x - canvasRect.left) / viewport.zoom,
  y: viewport.y + (screenPoint.y - canvasRect.top) / viewport.zoom,
});

export const worldToScreen = (
  worldPoint: Point,
  viewport: Viewport
): Point => ({
  x: (worldPoint.x - viewport.x) * viewport.zoom,
  y: (worldPoint.y - viewport.y) * viewport.zoom,
});

export const zoomAtPoint = (
  viewport: Viewport,
  screenPoint: Point,
  nextZoom: number
): Viewport => {
  const zoom = clampZoom(nextZoom);
  const worldX = viewport.x + screenPoint.x / viewport.zoom;
  const worldY = viewport.y + screenPoint.y / viewport.zoom;

  return {
    x: worldX - screenPoint.x / zoom,
    y: worldY - screenPoint.y / zoom,
    zoom,
  };
};

export const rotatePoint = (point: Point, center: Point, degrees: number): Point => {
  const radians = (degrees * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const dx = point.x - center.x;
  const dy = point.y - center.y;

  return {
    x: center.x + dx * cos - dy * sin,
    y: center.y + dx * sin + dy * cos,
  };
};

const boundsCenter = (bounds: Bounds): Point => ({
  x: bounds.x + bounds.width / 2,
  y: bounds.y + bounds.height / 2,
});

export const shapeVisualBounds = (shape: Shape): Bounds => {
  const bounds = shapeBounds(shape);
  const rotation = shape.rotation ?? 0;
  if (Math.abs(rotation) < EPSILON) return bounds;

  const center = boundsCenter(bounds);
  if (shape.type === "ellipse") {
    const radians = (rotation * Math.PI) / 180;
    const radiusX = bounds.width / 2;
    const radiusY = bounds.height / 2;
    const halfWidth = Math.sqrt(
      (radiusX * Math.cos(radians)) ** 2 +
      (radiusY * Math.sin(radians)) ** 2
    );
    const halfHeight = Math.sqrt(
      (radiusX * Math.sin(radians)) ** 2 +
      (radiusY * Math.cos(radians)) ** 2
    );
    return {
      x: center.x - halfWidth,
      y: center.y - halfHeight,
      width: halfWidth * 2,
      height: halfHeight * 2,
    };
  }

  const corners = [
    { x: bounds.x, y: bounds.y },
    { x: bounds.x + bounds.width, y: bounds.y },
    { x: bounds.x + bounds.width, y: bounds.y + bounds.height },
    { x: bounds.x, y: bounds.y + bounds.height },
  ].map((point) => rotatePoint(point, center, rotation));
  const left = Math.min(...corners.map((point) => point.x));
  const right = Math.max(...corners.map((point) => point.x));
  const top = Math.min(...corners.map((point) => point.y));
  const bottom = Math.max(...corners.map((point) => point.y));

  return { x: left, y: top, width: right - left, height: bottom - top };
};

export const pointInShape = (point: Point, shape: Shape): boolean => {
  if (shape.hidden || shape.locked) return false;

  const bounds = shapeBounds(shape);
  if (bounds.width < EPSILON || bounds.height < EPSILON) return false;

  const center = {
    x: bounds.x + bounds.width / 2,
    y: bounds.y + bounds.height / 2,
  };
  const localPoint = rotatePoint(point, center, -(shape.rotation ?? 0));
  const normalizedX = (localPoint.x - center.x) / (bounds.width / 2);
  const normalizedY = (localPoint.y - center.y) / (bounds.height / 2);

  if (shape.type === "ellipse") {
    return normalizedX * normalizedX + normalizedY * normalizedY <= 1;
  }

  return Math.abs(normalizedX) <= 1 && Math.abs(normalizedY) <= 1;
};

export const hitTest = (shapes: Shape[], point: Point): Shape | undefined =>
  shapes
    .map((shape, index) => ({ shape, index }))
    .sort((left, right) =>
      right.shape.zIndex - left.shape.zIndex || right.index - left.index
    )
    .find(({ shape }) =>
      !isEffectivelyHidden(shapes, shape) &&
      !isEffectivelyLocked(shapes, shape) &&
      !clippedByAncestor(shapes, shape, point) &&
      pointInShape(point, shape)
    )
    ?.shape;

export const selectionBounds = (
  shapes: Shape[],
  selectedIds: readonly string[]
): Bounds | null => {
  const expanded = expandSelectionIds(shapes, selectedIds);
  const selected = shapes.filter(
    (shape) => expanded.has(shape.id) && !shape.hidden
  );
  if (selected.length === 0) return null;

  const edges = selected.map((shape) => {
    const bounds = shapeVisualBounds(shape);
    return {
      left: bounds.x,
      top: bounds.y,
      right: bounds.x + bounds.width,
      bottom: bounds.y + bounds.height,
    };
  });
  const left = Math.min(...edges.map((edge) => edge.left));
  const top = Math.min(...edges.map((edge) => edge.top));
  const right = Math.max(...edges.map((edge) => edge.right));
  const bottom = Math.max(...edges.map((edge) => edge.bottom));

  return { x: left, y: top, width: right - left, height: bottom - top };
};

const shapeCorners = (shape: Shape): Point[] => {
  const bounds = shapeBounds(shape);
  const center = boundsCenter(bounds);
  return [
    { x: bounds.x, y: bounds.y },
    { x: bounds.x + bounds.width, y: bounds.y },
    { x: bounds.x + bounds.width, y: bounds.y + bounds.height },
    { x: bounds.x, y: bounds.y + bounds.height },
  ].map((point) => rotatePoint(point, center, shape.rotation ?? 0));
};

const orientedSelectionBounds = (shapes: Shape[], rotation: number): Bounds => {
  const localCorners = shapes
    .flatMap(shapeCorners)
    .map((point) => rotatePoint(point, { x: 0, y: 0 }, -rotation));
  const left = Math.min(...localCorners.map((point) => point.x));
  const right = Math.max(...localCorners.map((point) => point.x));
  const top = Math.min(...localCorners.map((point) => point.y));
  const bottom = Math.max(...localCorners.map((point) => point.y));
  const localCenter = { x: (left + right) / 2, y: (top + bottom) / 2 };
  const center = rotatePoint(localCenter, { x: 0, y: 0 }, rotation);
  return {
    x: center.x - (right - left) / 2,
    y: center.y - (bottom - top) / 2,
    width: right - left,
    height: bottom - top,
  };
};

export const selectionFrame = (
  shapes: Shape[],
  selectedIds: readonly string[],
  multiSelectionRotation = 0
): SelectionFrame | null => {
  const direct = shapes.filter((shape) => selectedIds.includes(shape.id) && !shape.hidden);
  if (direct.length === 1 && direct[0]?.type === "frame") {
    return { bounds: shapeBounds(direct[0]), rotation: direct[0].rotation ?? 0 };
  }
  const expanded = expandSelectionIds(shapes, selectedIds);
  const selected = shapes.filter(
    (shape) => expanded.has(shape.id) && !shape.hidden
  );
  if (selected.length === 0) return null;
  if (selected.length === 1) {
    return {
      bounds: shapeBounds(selected[0]!),
      rotation: selected[0]!.rotation ?? 0,
    };
  }

  const groupId = selected[0]?.groupId;
  const isSingleGroup = Boolean(
    groupId && selected.every((shape) => shape.groupId === groupId)
  );
  const rotation = isSingleGroup
    ? selected[0]?.groupRotation ?? 0
    : multiSelectionRotation;
  return {
    bounds: Math.abs(rotation) < EPSILON
      ? selectionBounds(shapes, [...expanded])!
      : orientedSelectionBounds(selected, rotation),
    rotation,
  };
};

export const shapesInMarquee = (
  shapes: Shape[],
  start: Point,
  end: Point,
  includeNested = false
): string[] => {
  const marquee = {
    left: Math.min(start.x, end.x),
    right: Math.max(start.x, end.x),
    top: Math.min(start.y, end.y),
    bottom: Math.max(start.y, end.y),
  };

  const hits = shapes
    .filter((shape) => {
      if (
        isEffectivelyHidden(shapes, shape) ||
        isEffectivelyLocked(shapes, shape) ||
        (!includeNested && shape.parentId)
      ) return false;
      const bounds = shapeVisualBounds(shape);
      return (
        bounds.x <= marquee.right &&
        bounds.x + bounds.width >= marquee.left &&
        bounds.y <= marquee.bottom &&
        bounds.y + bounds.height >= marquee.top
      );
    })
    .map((shape) => shape.id);
  const hitSet = new Set(hits);
  const groupIds = new Set(
    shapes.filter((shape) => hitSet.has(shape.id) && shape.groupId).map((shape) => shape.groupId!)
  );
  shapes.forEach((shape) => {
    if (shape.groupId && groupIds.has(shape.groupId)) hitSet.add(shape.id);
  });
  return [...hitSet];
};

export const moveShapesFromBaseline = (
  baseline: Shape[],
  selectedIds: readonly string[],
  delta: Point,
  gridSize = 0
): Shape[] => {
  const editable = editableSelectionIds(baseline, selectedIds);
  selectedIds.forEach((id) => {
    const root = baseline.find((shape) => shape.id === id);
    if (root?.type === "frame" && !isEffectivelyLocked(baseline, root)) {
      descendantIds(baseline, [root.id]).forEach((descendantId) => editable.add(descendantId));
    }
  });
  const anchor = selectionBounds(baseline, [...editable]);
  const snappedDelta = {
    x: gridSize > 0 && anchor
      ? Math.round((anchor.x + delta.x) / gridSize) * gridSize - anchor.x
      : delta.x,
    y: gridSize > 0 && anchor
      ? Math.round((anchor.y + delta.y) / gridSize) * gridSize - anchor.y
      : delta.y,
  };

  const translatePoint = <T extends { x: number; y: number }>(point: T): T => ({
    ...point,
    x: point.x + snappedDelta.x,
    y: point.y + snappedDelta.y,
  });
  const translateShape = (shape: Shape): Shape => ({
    ...shape,
    x1: shape.x1 + snappedDelta.x,
    x2: shape.x2 + snappedDelta.x,
    y1: shape.y1 + snappedDelta.y,
    y2: shape.y2 + snappedDelta.y,
    ...(shape.vectorPoints
      ? {
          vectorPoints: shape.vectorPoints.map((point) => ({
            ...translatePoint(point),
            ...(point.handleIn ? { handleIn: translatePoint(point.handleIn) } : {}),
            ...(point.handleOut ? { handleOut: translatePoint(point.handleOut) } : {}),
          })),
        }
      : {}),
    ...(shape.booleanChildren
      ? { booleanChildren: shape.booleanChildren.map(translateShape) }
      : {}),
    ...(shape.shapes
      ? { shapes: shape.shapes.map(translateShape) }
      : {}),
  });

  return baseline.map((shape) => {
    if (!editable.has(shape.id)) return shape;
    return translateShape(shape);
  });
};

const handleIncludes = (handle: ResizeHandle, edge: "n" | "e" | "s" | "w") =>
  handle.includes(edge);

const clampSignedScale = (scale: number, minimumMagnitude: number): number => {
  const sign = scale < 0 ? -1 : 1;
  return sign * Math.max(Math.abs(scale), minimumMagnitude);
};

const snapCoordinate = (coordinate: number, gridSize = 0): number =>
  gridSize > 0 ? Math.round(coordinate / gridSize) * gridSize : coordinate;

export const snapPointToGrid = (point: Point, gridSize = 0): Point => ({
  x: snapCoordinate(point.x, gridSize),
  y: snapCoordinate(point.y, gridSize),
});

export const resizeTransform = (
  original: Bounds,
  handle: ResizeHandle,
  pointer: Point,
  options: ResizeOptions = {}
): ResizeTransform => {
  const minimumSize = options.minimumSize ?? 1;
  const left = original.x;
  const right = original.x + original.width;
  const top = original.y;
  const bottom = original.y + original.height;
  const centerX = left + original.width / 2;
  const centerY = top + original.height / 2;

  const changesX = handleIncludes(handle, "w") || handleIncludes(handle, "e");
  const changesY = handleIncludes(handle, "n") || handleIncludes(handle, "s");
  let originX = options.fromCenter
    ? centerX
    : handleIncludes(handle, "w")
    ? right
    : left;
  let originY = options.fromCenter
    ? centerY
    : handleIncludes(handle, "n")
    ? bottom
    : top;
  const pointerX = snapCoordinate(pointer.x, options.gridSize);
  const pointerY = snapCoordinate(pointer.y, options.gridSize);
  const horizontalSpan = options.fromCenter ? original.width / 2 : original.width;
  const verticalSpan = options.fromCenter ? original.height / 2 : original.height;
  let scaleX = changesX
    ? handleIncludes(handle, "w")
      ? (originX - pointerX) / Math.max(horizontalSpan, EPSILON)
      : (pointerX - originX) / Math.max(horizontalSpan, EPSILON)
    : 1;
  let scaleY = changesY
    ? handleIncludes(handle, "n")
      ? (originY - pointerY) / Math.max(verticalSpan, EPSILON)
      : (pointerY - originY) / Math.max(verticalSpan, EPSILON)
    : 1;

  const minimumScaleX = minimumSize / Math.max(original.width, EPSILON);
  const minimumScaleY = minimumSize / Math.max(original.height, EPSILON);

  if (options.lockAspectRatio) {
    if (changesX && changesY) {
      const magnitude = Math.max(
        Math.abs(scaleX),
        Math.abs(scaleY),
        minimumScaleX,
        minimumScaleY
      );
      scaleX = (scaleX < 0 ? -1 : 1) * magnitude;
      scaleY = (scaleY < 0 ? -1 : 1) * magnitude;
    } else if (changesX) {
      scaleX = clampSignedScale(scaleX, Math.max(minimumScaleX, minimumScaleY));
      scaleY = Math.abs(scaleX);
      originY = centerY;
    } else {
      scaleY = clampSignedScale(scaleY, Math.max(minimumScaleX, minimumScaleY));
      scaleX = Math.abs(scaleY);
      originX = centerX;
    }
  } else {
    if (changesX) scaleX = clampSignedScale(scaleX, minimumScaleX);
    if (changesY) scaleY = clampSignedScale(scaleY, minimumScaleY);
  }

  const mappedLeft = originX + (left - originX) * scaleX;
  const mappedRight = originX + (right - originX) * scaleX;
  const mappedTop = originY + (top - originY) * scaleY;
  const mappedBottom = originY + (bottom - originY) * scaleY;
  const bounds = {
    x: Math.min(mappedLeft, mappedRight),
    y: Math.min(mappedTop, mappedBottom),
    width: Math.abs(mappedRight - mappedLeft),
    height: Math.abs(mappedBottom - mappedTop),
  };

  return { bounds, origin: { x: originX, y: originY }, scaleX, scaleY };
};

export const resizeBounds = (
  original: Bounds,
  handle: ResizeHandle,
  pointer: Point,
  options: ResizeOptions = {}
): Bounds => resizeTransform(original, handle, pointer, options).bounds;

export const resizeTransformForFrame = (
  frame: SelectionFrame,
  handle: ResizeHandle,
  pointer: Point,
  options: ResizeOptions = {}
): ResizeTransform => {
  const center = boundsCenter(frame.bounds);
  const localPointer = Math.abs(frame.rotation) < EPSILON
    ? pointer
    : rotatePoint(pointer, center, -frame.rotation);
  return resizeTransform(frame.bounds, handle, localPointer, options);
};

export const normalizeDegrees = (degrees: number): number => {
  const normalized = ((degrees + 180) % 360 + 360) % 360 - 180;
  return Math.abs(normalized) < EPSILON ? 0 : normalized;
};

const applyResizeTransform = (
  shape: Shape,
  transform: ResizeTransform,
  reflectRotation: boolean,
  frame?: SelectionFrame
): Shape => {
  const bounds = shapeBounds(shape);
  const frameCenter = frame ? boundsCenter(frame.bounds) : undefined;
  const shapeCenter = boundsCenter(bounds);
  const localCenter = frameCenter && Math.abs(frame!.rotation) >= EPSILON
    ? rotatePoint(shapeCenter, frameCenter, -frame!.rotation)
    : shapeCenter;
  const mappedLocalCenter = {
    x: transform.origin.x + (localCenter.x - transform.origin.x) * transform.scaleX,
    y: transform.origin.y + (localCenter.y - transform.origin.y) * transform.scaleY,
  };
  const mappedCenter = frameCenter && Math.abs(frame!.rotation) >= EPSILON
    ? rotatePoint(mappedLocalCenter, frameCenter, frame!.rotation)
    : mappedLocalCenter;
  const width = Math.max(1, bounds.width * Math.abs(transform.scaleX));
  const height = Math.max(1, bounds.height * Math.abs(transform.scaleY));
  let rotation = shape.rotation ?? 0;
  const reflectionAxis = frame?.rotation ?? 0;
  if (reflectRotation && transform.scaleX < 0) rotation = 2 * reflectionAxis - rotation;
  if (reflectRotation && transform.scaleY < 0) rotation = 2 * reflectionAxis - rotation;

  const mapPoint = <T extends { x: number; y: number }>(point: T): T => {
    const local = frameCenter && Math.abs(frame!.rotation) >= EPSILON
      ? rotatePoint(point, frameCenter, -frame!.rotation)
      : point;
    const mapped = {
      x: transform.origin.x + (local.x - transform.origin.x) * transform.scaleX,
      y: transform.origin.y + (local.y - transform.origin.y) * transform.scaleY,
    };
    const world = frameCenter && Math.abs(frame!.rotation) >= EPSILON
      ? rotatePoint(mapped, frameCenter, frame!.rotation)
      : mapped;
    return { ...point, ...world };
  };

  return normalizeShape({
    ...shape,
    x1: mappedCenter.x - width / 2,
    x2: mappedCenter.x + width / 2,
    y1: mappedCenter.y - height / 2,
    y2: mappedCenter.y + height / 2,
    rotation: normalizeDegrees(rotation),
    flipX: transform.scaleX < 0 ? !shape.flipX : shape.flipX,
    flipY: transform.scaleY < 0 ? !shape.flipY : shape.flipY,
    ...(shape.vectorPoints
      ? {
          vectorPoints: shape.vectorPoints.map((point) => ({
            ...mapPoint(point),
            ...(point.handleIn ? { handleIn: mapPoint(point.handleIn) } : {}),
            ...(point.handleOut ? { handleOut: mapPoint(point.handleOut) } : {}),
          })),
        }
      : {}),
    ...(shape.booleanChildren
      ? { booleanChildren: shape.booleanChildren.map((child) => applyResizeTransform(child, transform, reflectRotation, frame)) }
      : {}),
    ...(shape.shapes
      ? {
          shapes: shape.shapes.map((child) =>
            applyResizeTransform(child, transform, reflectRotation, frame)
          ),
        }
      : {}),
  });
};

export const resizeShapesWithTransform = (
  baseline: Shape[],
  selectedIds: readonly string[],
  transform: ResizeTransform,
  frame?: SelectionFrame
): Shape[] => {
  const directFrameSelection = selectedIds.length === 1 &&
    baseline.find((shape) => shape.id === selectedIds[0])?.type === "frame";
  const editable = directFrameSelection
    ? new Set(selectedIds.filter((id) => {
        const shape = baseline.find((candidate) => candidate.id === id);
        return Boolean(shape && !isEffectivelyLocked(baseline, shape));
      }))
    : editableSelectionIds(baseline, selectedIds);
  return baseline.map((shape) =>
    editable.has(shape.id)
      ? applyResizeTransform(shape, transform, true, frame)
      : shape
  );
};

export const resizeShapesFromBaseline = (
  baseline: Shape[],
  selectedIds: readonly string[],
  originalSelectionBounds: Bounds,
  nextSelectionBounds: Bounds
): Shape[] => {
  const directFrameSelection = selectedIds.length === 1 &&
    baseline.find((shape) => shape.id === selectedIds[0])?.type === "frame";
  const editable = directFrameSelection
    ? new Set(selectedIds.filter((id) => {
        const shape = baseline.find((candidate) => candidate.id === id);
        return Boolean(shape && !isEffectivelyLocked(baseline, shape));
      }))
    : editableSelectionIds(baseline, selectedIds);
  const scaleX =
    originalSelectionBounds.width > EPSILON
      ? nextSelectionBounds.width / originalSelectionBounds.width
      : 1;
  const scaleY =
    originalSelectionBounds.height > EPSILON
      ? nextSelectionBounds.height / originalSelectionBounds.height
      : 1;

  const resizeShape = (shape: Shape): Shape => {
    const bounds = shapeBounds(shape);
    const nextBounds = {
      x:
        nextSelectionBounds.x +
        (bounds.x - originalSelectionBounds.x) * scaleX,
      y:
        nextSelectionBounds.y +
        (bounds.y - originalSelectionBounds.y) * scaleY,
      width: Math.max(1, bounds.width * scaleX),
      height: Math.max(1, bounds.height * scaleY),
    };
    const mapPoint = <T extends { x: number; y: number }>(point: T): T => ({
      ...point,
      x: nextSelectionBounds.x + (point.x - originalSelectionBounds.x) * scaleX,
      y: nextSelectionBounds.y + (point.y - originalSelectionBounds.y) * scaleY,
    });
    return normalizeShape({
      ...shape,
      ...boundsToEdges(nextBounds),
      ...(shape.vectorPoints
        ? {
            vectorPoints: shape.vectorPoints.map((point) => ({
              ...mapPoint(point),
              ...(point.handleIn ? { handleIn: mapPoint(point.handleIn) } : {}),
              ...(point.handleOut ? { handleOut: mapPoint(point.handleOut) } : {}),
            })),
          }
        : {}),
      ...(shape.booleanChildren
        ? { booleanChildren: shape.booleanChildren.map(resizeShape) }
        : {}),
      ...(shape.shapes
        ? { shapes: shape.shapes.map(resizeShape) }
        : {}),
    });
  };

  return baseline.map((shape) =>
    editable.has(shape.id) ? resizeShape(shape) : shape
  );
};

export const resizeSelectionFromPointer = (
  baseline: Shape[],
  selectedIds: readonly string[],
  frame: SelectionFrame,
  handle: ResizeHandle,
  pointer: Point,
  options: ResizeOptions = {}
): Shape[] => {
  const directFrameSelection = selectedIds.length === 1 &&
    baseline.find((shape) => shape.id === selectedIds[0])?.type === "frame";
  const editable = directFrameSelection
    ? new Set(selectedIds.filter((id) => {
        const shape = baseline.find((candidate) => candidate.id === id);
        return Boolean(shape && !isEffectivelyLocked(baseline, shape));
      }))
    : editableSelectionIds(baseline, selectedIds);
  const selected = baseline.filter((shape) => editable.has(shape.id) && !shape.hidden);
  if (selected.length !== 1 || Math.abs(frame.rotation) < EPSILON) {
    const hasRelativeRotation = selected.some(
      (shape) => Math.abs(normalizeDegrees((shape.rotation ?? 0) - frame.rotation)) >= EPSILON
    );
    const safeOptions = hasRelativeRotation && selected.length > 1
      ? { ...options, lockAspectRatio: true }
      : options;
    return resizeShapesWithTransform(
      baseline,
      selectedIds,
      resizeTransformForFrame(frame, handle, pointer, safeOptions),
      frame
    );
  }

  const shape = selected[0]!;
  const originalCenter = boundsCenter(frame.bounds);
  const transform = resizeTransformForFrame(frame, handle, pointer, options);
  const localCenter = boundsCenter(transform.bounds);
  const worldCenter = rotatePoint(localCenter, originalCenter, frame.rotation);
  const nextBounds = {
    x: worldCenter.x - transform.bounds.width / 2,
    y: worldCenter.y - transform.bounds.height / 2,
    width: transform.bounds.width,
    height: transform.bounds.height,
  };

  return baseline.map((candidate) =>
    candidate.id === shape.id
      ? normalizeShape({
          ...candidate,
          ...boundsToEdges(nextBounds),
          flipX: transform.scaleX < 0 ? !candidate.flipX : candidate.flipX,
          flipY: transform.scaleY < 0 ? !candidate.flipY : candidate.flipY,
        })
      : candidate
  );
};

const shapeCenter = (shape: Shape): Point => boundsCenter(shapeBounds(shape));

const rotateShapeAround = (shape: Shape, center: Point, degrees: number): Shape => {
  const bounds = shapeBounds(shape);
  const nextCenter = rotatePoint(shapeCenter(shape), center, degrees);
  return normalizeShape({
    ...shape,
    x1: nextCenter.x - bounds.width / 2,
    y1: nextCenter.y - bounds.height / 2,
    x2: nextCenter.x + bounds.width / 2,
    y2: nextCenter.y + bounds.height / 2,
    rotation: normalizeDegrees((shape.rotation ?? 0) + degrees),
    groupRotation: shape.groupId
      ? normalizeDegrees((shape.groupRotation ?? 0) + degrees)
      : undefined,
    ...(shape.shapes
      ? { shapes: shape.shapes.map((child) => rotateShapeAround(child, center, degrees)) }
      : {}),
  });
};

export const rotationDeltaForPointer = (
  selection: Bounds,
  start: Point,
  pointer: Point,
  snapIncrement = 0,
  baselineRotation = 0
): number => {
  const center = boundsCenter(selection);
  const startAngle = Math.atan2(start.y - center.y, start.x - center.x);
  const pointerAngle = Math.atan2(pointer.y - center.y, pointer.x - center.x);
  const rawDelta = normalizeDegrees(((pointerAngle - startAngle) * 180) / Math.PI);
  if (snapIncrement <= 0) return rawDelta;
  const target = normalizeDegrees(baselineRotation + rawDelta);
  const snappedTarget = Math.round(target / snapIncrement) * snapIncrement;
  return normalizeDegrees(snappedTarget - baselineRotation);
};

export const rotateShapesFromBaseline = (
  baseline: Shape[],
  selectedIds: readonly string[],
  selection: Bounds,
  start: Point,
  pointer: Point,
  snapIncrement = 0,
  baselineRotation = 0
): Shape[] => {
  const center = boundsCenter(selection);
  const degrees = rotationDeltaForPointer(
    selection,
    start,
    pointer,
    snapIncrement,
    baselineRotation
  );
  const editable = editableSelectionIds(baseline, selectedIds);
  selectedIds.forEach((id) => {
    const root = baseline.find((shape) => shape.id === id);
    if (root?.type === "frame" && !isEffectivelyLocked(baseline, root)) {
      descendantIds(baseline, [root.id]).forEach((descendantId) => editable.add(descendantId));
    }
  });

  return baseline.map((shape) =>
    editable.has(shape.id)
      ? rotateShapeAround(shape, center, degrees)
      : shape
  );
};

export const panViewport = (viewport: Viewport, screenDelta: Point): Viewport => ({
  ...viewport,
  x: viewport.x - screenDelta.x / viewport.zoom,
  y: viewport.y - screenDelta.y / viewport.zoom,
});
