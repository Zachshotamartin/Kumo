import { Shape } from "../classes/shape";
import { Bounds, Point, ResizeHandle, ResizeOptions, Viewport } from "./types";

const EPSILON = 0.0001;

export const clampZoom = (zoom: number): number =>
  Math.min(8, Math.max(0.1, zoom));

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
    opacity: shape.opacity ?? 1,
    zIndex: Number.isFinite(shape.zIndex) ? shape.zIndex : 0,
    groupId: shape.groupId ?? null,
    locked: shape.locked ?? false,
    hidden: shape.hidden ?? false,
    ...(normalizedChildren ? { shapes: normalizedChildren } : {}),
  };
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

const rotatePoint = (point: Point, center: Point, degrees: number): Point => {
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
  [...shapes]
    .sort((a, b) => b.zIndex - a.zIndex)
    .find((shape) => pointInShape(point, shape));

export const selectionBounds = (
  shapes: Shape[],
  selectedIds: readonly string[]
): Bounds | null => {
  const selected = shapes.filter(
    (shape) => selectedIds.includes(shape.id) && !shape.hidden
  );
  if (selected.length === 0) return null;

  const edges = selected.map((shape) => {
    const bounds = shapeBounds(shape);
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

export const shapesInMarquee = (
  shapes: Shape[],
  start: Point,
  end: Point
): string[] => {
  const marquee = {
    left: Math.min(start.x, end.x),
    right: Math.max(start.x, end.x),
    top: Math.min(start.y, end.y),
    bottom: Math.max(start.y, end.y),
  };

  return shapes
    .filter((shape) => {
      if (shape.hidden || shape.locked) return false;
      const bounds = shapeBounds(shape);
      return (
        bounds.x <= marquee.right &&
        bounds.x + bounds.width >= marquee.left &&
        bounds.y <= marquee.bottom &&
        bounds.y + bounds.height >= marquee.top
      );
    })
    .map((shape) => shape.id);
};

export const moveShapesFromBaseline = (
  baseline: Shape[],
  selectedIds: readonly string[],
  delta: Point,
  gridSize = 0
): Shape[] => {
  const snappedDelta = {
    x: gridSize > 0 ? Math.round(delta.x / gridSize) * gridSize : delta.x,
    y: gridSize > 0 ? Math.round(delta.y / gridSize) * gridSize : delta.y,
  };

  return baseline.map((shape) => {
    if (!selectedIds.includes(shape.id) || shape.locked) return shape;
    const movedChildren = shape.shapes?.map((child) => ({
      ...child,
      x1: child.x1 + snappedDelta.x,
      x2: child.x2 + snappedDelta.x,
      y1: child.y1 + snappedDelta.y,
      y2: child.y2 + snappedDelta.y,
    }));

    return {
      ...shape,
      x1: shape.x1 + snappedDelta.x,
      x2: shape.x2 + snappedDelta.x,
      y1: shape.y1 + snappedDelta.y,
      y2: shape.y2 + snappedDelta.y,
      ...(movedChildren ? { shapes: movedChildren } : {}),
    };
  });
};

const handleIncludes = (handle: ResizeHandle, edge: "n" | "e" | "s" | "w") =>
  handle.includes(edge);

export const resizeBounds = (
  original: Bounds,
  handle: ResizeHandle,
  pointer: Point,
  options: ResizeOptions = {}
): Bounds => {
  const minimumSize = options.minimumSize ?? 1;
  const left = original.x;
  const right = original.x + original.width;
  const top = original.y;
  const bottom = original.y + original.height;
  const centerX = left + original.width / 2;
  const centerY = top + original.height / 2;

  let nextLeft = handleIncludes(handle, "w") ? pointer.x : left;
  let nextRight = handleIncludes(handle, "e") ? pointer.x : right;
  let nextTop = handleIncludes(handle, "n") ? pointer.y : top;
  let nextBottom = handleIncludes(handle, "s") ? pointer.y : bottom;

  if (options.fromCenter) {
    if (handleIncludes(handle, "w") || handleIncludes(handle, "e")) {
      const halfWidth = Math.abs(pointer.x - centerX);
      nextLeft = centerX - halfWidth;
      nextRight = centerX + halfWidth;
    }
    if (handleIncludes(handle, "n") || handleIncludes(handle, "s")) {
      const halfHeight = Math.abs(pointer.y - centerY);
      nextTop = centerY - halfHeight;
      nextBottom = centerY + halfHeight;
    }
  }

  let width = Math.max(minimumSize, Math.abs(nextRight - nextLeft));
  let height = Math.max(minimumSize, Math.abs(nextBottom - nextTop));

  if (options.lockAspectRatio && original.height > EPSILON) {
    const ratio = original.width / original.height;
    const changesWidth = handleIncludes(handle, "w") || handleIncludes(handle, "e");
    const changesHeight = handleIncludes(handle, "n") || handleIncludes(handle, "s");

    if (changesWidth && changesHeight) {
      const widthScale = width / Math.max(original.width, EPSILON);
      const heightScale = height / Math.max(original.height, EPSILON);
      const scale = Math.max(widthScale, heightScale);
      width = Math.max(minimumSize, original.width * scale);
      height = Math.max(minimumSize, original.height * scale);
    } else if (changesWidth) {
      height = Math.max(minimumSize, width / ratio);
    } else {
      width = Math.max(minimumSize, height * ratio);
    }
  }

  const horizontalAnchor = options.fromCenter
    ? centerX
    : handleIncludes(handle, "w")
    ? right
    : left;
  const verticalAnchor = options.fromCenter
    ? centerY
    : handleIncludes(handle, "n")
    ? bottom
    : top;

  if (handleIncludes(handle, "w")) {
    nextLeft = options.fromCenter ? horizontalAnchor - width / 2 : horizontalAnchor - width;
    nextRight = options.fromCenter ? horizontalAnchor + width / 2 : horizontalAnchor;
  } else if (handleIncludes(handle, "e")) {
    nextLeft = options.fromCenter ? horizontalAnchor - width / 2 : horizontalAnchor;
    nextRight = options.fromCenter ? horizontalAnchor + width / 2 : horizontalAnchor + width;
  } else if (options.lockAspectRatio) {
    nextLeft = centerX - width / 2;
    nextRight = centerX + width / 2;
  }

  if (handleIncludes(handle, "n")) {
    nextTop = options.fromCenter ? verticalAnchor - height / 2 : verticalAnchor - height;
    nextBottom = options.fromCenter ? verticalAnchor + height / 2 : verticalAnchor;
  } else if (handleIncludes(handle, "s")) {
    nextTop = options.fromCenter ? verticalAnchor - height / 2 : verticalAnchor;
    nextBottom = options.fromCenter ? verticalAnchor + height / 2 : verticalAnchor + height;
  } else if (options.lockAspectRatio) {
    nextTop = centerY - height / 2;
    nextBottom = centerY + height / 2;
  }

  return {
    x: Math.min(nextLeft, nextRight),
    y: Math.min(nextTop, nextBottom),
    width: Math.abs(nextRight - nextLeft),
    height: Math.abs(nextBottom - nextTop),
  };
};

export const resizeShapesFromBaseline = (
  baseline: Shape[],
  selectedIds: readonly string[],
  originalSelectionBounds: Bounds,
  nextSelectionBounds: Bounds
): Shape[] => {
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
    const relativeLeft = bounds.x - originalSelectionBounds.x;
    const relativeTop = bounds.y - originalSelectionBounds.y;
    const nextBounds = {
      x: nextSelectionBounds.x + relativeLeft * scaleX,
      y: nextSelectionBounds.y + relativeTop * scaleY,
      width: Math.max(1, bounds.width * scaleX),
      height: Math.max(1, bounds.height * scaleY),
    };

    return normalizeShape({
      ...shape,
      ...boundsToEdges(nextBounds),
      width: nextBounds.width,
      height: nextBounds.height,
      ...(shape.shapes
        ? { shapes: shape.shapes.map(resizeShape) }
        : {}),
    });
  };

  return baseline.map((shape) =>
    selectedIds.includes(shape.id) && !shape.locked ? resizeShape(shape) : shape
  );
};

export const panViewport = (viewport: Viewport, screenDelta: Point): Viewport => ({
  ...viewport,
  x: viewport.x - screenDelta.x / viewport.zoom,
  y: viewport.y - screenDelta.y / viewport.zoom,
});
