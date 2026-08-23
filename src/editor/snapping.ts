import type { Shape } from "../classes/shape";
import {
  expandSelectionIds,
  selectionBounds,
  shapeBounds,
  shapeVisualBounds,
} from "./geometry";
import {
  commonParentId,
  isEffectivelyHidden,
  rootSelectionIds,
  shapeMap,
} from "./hierarchy";
import type { Bounds, Point, ResizeHandle } from "./types";

export interface SmartGuide {
  axis: "x" | "y";
  position: number;
  start: number;
  end: number;
}

export interface MoveSnapResult {
  delta: Point;
  guides: SmartGuide[];
}

const axisPoints = (bounds: Bounds, axis: "x" | "y") => axis === "x"
  ? [bounds.x, bounds.x + bounds.width / 2, bounds.x + bounds.width]
  : [bounds.y, bounds.y + bounds.height / 2, bounds.y + bounds.height];

const translatedBounds = (bounds: Bounds, delta: Point): Bounds => ({
  ...bounds,
  x: bounds.x + delta.x,
  y: bounds.y + delta.y,
});

const candidateShapes = (shapes: Shape[], selectedIds: readonly string[]): Shape[] => {
  const expanded = expandSelectionIds(shapes, selectedIds);
  const roots = rootSelectionIds(shapes, selectedIds);
  const parentId = commonParentId(shapes, roots);
  const byId = shapeMap(shapes);
  return shapes.filter((shape) =>
    !expanded.has(shape.id) &&
    !isEffectivelyHidden(shapes, shape) &&
    (shape.parentId === parentId || shape.id === parentId || byId.get(shape.parentId ?? "")?.id === parentId)
  );
};

const activeSelectionBounds = (shapes: Shape[], selectedIds: readonly string[]): Bounds | null => {
  const direct = shapes.filter((shape) => selectedIds.includes(shape.id));
  if (direct.length === 1 && direct[0]?.type === "frame") return shapeVisualBounds(direct[0]);
  return selectionBounds(shapes, selectedIds);
};

const bestAxisSnap = (
  moving: Bounds,
  candidates: Shape[],
  axis: "x" | "y",
  tolerance: number
): { adjustment: number; guide: SmartGuide } | null => {
  let best: { distance: number; adjustment: number; guide: SmartGuide } | null = null;
  const movingPoints = axisPoints(moving, axis);
  candidates.forEach((candidate) => {
    const candidateBounds = shapeVisualBounds(candidate);
    axisPoints(candidateBounds, axis).forEach((candidatePoint) => {
      movingPoints.forEach((movingPoint) => {
        const adjustment = candidatePoint - movingPoint;
        const distance = Math.abs(adjustment);
        if (distance > tolerance || (best && distance >= best.distance)) return;
        best = {
          distance,
          adjustment,
          guide: axis === "x"
            ? {
                axis,
                position: candidatePoint,
                start: Math.min(moving.y, candidateBounds.y),
                end: Math.max(moving.y + moving.height, candidateBounds.y + candidateBounds.height),
              }
            : {
                axis,
                position: candidatePoint,
                start: Math.min(moving.x, candidateBounds.x),
                end: Math.max(moving.x + moving.width, candidateBounds.x + candidateBounds.width),
              },
        };
      });
    });
  });
  return best;
};

export const snapMoveToObjects = (
  shapes: Shape[],
  selectedIds: readonly string[],
  proposedDelta: Point,
  tolerance: number
): MoveSnapResult => {
  const bounds = activeSelectionBounds(shapes, selectedIds);
  if (!bounds) return { delta: proposedDelta, guides: [] };
  const proposed = translatedBounds(bounds, proposedDelta);
  const candidates = candidateShapes(shapes, selectedIds);
  const x = bestAxisSnap(proposed, candidates, "x", tolerance);
  const y = bestAxisSnap(proposed, candidates, "y", tolerance);
  return {
    delta: {
      x: proposedDelta.x + (x?.adjustment ?? 0),
      y: proposedDelta.y + (y?.adjustment ?? 0),
    },
    guides: [x?.guide, y?.guide].filter((guide): guide is SmartGuide => Boolean(guide)),
  };
};

const handleChangesAxis = (handle: ResizeHandle, axis: "x" | "y") =>
  axis === "x" ? handle.includes("e") || handle.includes("w") : handle.includes("n") || handle.includes("s");

export const snapResizePointerToObjects = (
  shapes: Shape[],
  selectedIds: readonly string[],
  handle: ResizeHandle,
  pointer: Point,
  tolerance: number
): { point: Point; guides: SmartGuide[] } => {
  const candidates = candidateShapes(shapes, selectedIds);
  const selected = activeSelectionBounds(shapes, selectedIds);
  if (!selected) return { point: pointer, guides: [] };
  const next = { ...pointer };
  const guides: SmartGuide[] = [];

  (["x", "y"] as const).forEach((axis) => {
    if (!handleChangesAxis(handle, axis)) return;
    let best: { distance: number; point: number; bounds: Bounds } | null = null;
    for (const candidate of candidates) {
      const bounds = shapeVisualBounds(candidate);
      for (const candidatePoint of axisPoints(bounds, axis)) {
        const distance = Math.abs(candidatePoint - pointer[axis]);
        if (distance <= tolerance && (!best || distance < best.distance)) {
          best = { distance, point: candidatePoint, bounds };
        }
      }
    }
    if (!best) return;
    const snapped = best as { distance: number; point: number; bounds: Bounds };
    next[axis] = snapped.point;
    guides.push(axis === "x"
      ? {
          axis,
          position: snapped.point,
          start: Math.min(selected.y, snapped.bounds.y),
          end: Math.max(selected.y + selected.height, snapped.bounds.y + snapped.bounds.height),
        }
      : {
          axis,
          position: snapped.point,
          start: Math.min(selected.x, snapped.bounds.x),
          end: Math.max(selected.x + selected.width, snapped.bounds.x + snapped.bounds.width),
        });
  });

  return { point: next, guides };
};

export const frameClipInsets = (
  shapes: Shape[],
  shape: Shape
): { top: number; right: number; bottom: number; left: number } | null => {
  const byId = shapeMap(shapes);
  const bounds = shapeBounds(shape);
  let clip: Bounds | null = null;
  let parentId = shape.parentId;
  const visited = new Set<string>();
  while (parentId && !visited.has(parentId)) {
    visited.add(parentId);
    const parent = byId.get(parentId);
    if (!parent) break;
    if (parent.type === "frame" && parent.clipContent !== false) {
      const parentBounds = shapeBounds(parent);
      const left = Math.max(clip?.x ?? -Infinity, parentBounds.x);
      const top = Math.max(clip?.y ?? -Infinity, parentBounds.y);
      const right = Math.min(clip ? clip.x + clip.width : Infinity, parentBounds.x + parentBounds.width);
      const bottom = Math.min(clip ? clip.y + clip.height : Infinity, parentBounds.y + parentBounds.height);
      clip = { x: left, y: top, width: Math.max(0, right - left), height: Math.max(0, bottom - top) };
    }
    parentId = parent.parentId;
  }
  if (!clip) return null;
  return {
    top: Math.max(0, clip.y - bounds.y),
    right: Math.max(0, bounds.x + bounds.width - (clip.x + clip.width)),
    bottom: Math.max(0, bounds.y + bounds.height - (clip.y + clip.height)),
    left: Math.max(0, clip.x - bounds.x),
  };
};
