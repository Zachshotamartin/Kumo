import { createShapeId, type Shape } from "../classes/shape.js";
import { normalizeShape, selectionBounds, shapeBounds } from "./geometry.js";

export type BooleanOperation = NonNullable<Shape["booleanOperation"]>;
const BOOLEAN_SHAPE_TYPES = new Set(["rectangle", "ellipse", "vector", "boolean"]);

export const vectorPathData = (
  points: NonNullable<Shape["vectorPoints"]>,
  origin = { x: 0, y: 0 },
  closed = false
): string => {
  if (!points.length) return "";
  let path = `M ${points[0]!.x - origin.x} ${points[0]!.y - origin.y}`;
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1]!;
    const point = points[index]!;
    if (previous.handleOut || point.handleIn) {
      const first = previous.handleOut ?? { x: previous.x, y: previous.y };
      const second = point.handleIn ?? { x: point.x, y: point.y };
      path += ` C ${first.x - origin.x} ${first.y - origin.y} ${second.x - origin.x} ${second.y - origin.y} ${point.x - origin.x} ${point.y - origin.y}`;
    } else {
      path += ` L ${point.x - origin.x} ${point.y - origin.y}`;
    }
  }
  return closed ? `${path} Z` : path;
};
export const shapePathData = (shape: Shape, origin = { x: 0, y: 0 }): string => {
  if (shape.vectorPoints?.length) return vectorPathData(shape.vectorPoints, origin, shape.vectorClosed);
  const bounds = shapeBounds(shape);
  const x = bounds.x - origin.x;
  const y = bounds.y - origin.y;
  if (shape.type === "ellipse") {
    const rx = bounds.width / 2;
    const ry = bounds.height / 2;
    return `M ${x + rx} ${y} A ${rx} ${ry} 0 1 1 ${x + rx} ${y + bounds.height} A ${rx} ${ry} 0 1 1 ${x + rx} ${y} Z`;
  }
  return `M ${x} ${y} H ${x + bounds.width} V ${y + bounds.height} H ${x} Z`;
};

export const createVectorShape = (start: { x: number; y: number }, end: { x: number; y: number }, zIndex: number): Shape => normalizeShape({
  id: createShapeId(),
  type: "vector",
  name: "Vector",
  x1: Math.min(start.x, end.x),
  y1: Math.min(start.y, end.y),
  x2: Math.max(start.x, end.x),
  y2: Math.max(start.y, end.y),
  width: Math.abs(end.x - start.x),
  height: Math.abs(end.y - start.y),
  level: 0,
  zIndex,
  parentId: null,
  backgroundColor: "transparent",
  borderColor: "#f4f1eb",
  borderWidth: 2,
  vectorPoints: [
    { id: createShapeId(), x: start.x, y: start.y },
    { id: createShapeId(), x: end.x, y: end.y },
  ],
  vectorClosed: false,
});

export const updateVectorPoint = (
  shapes: Shape[],
  shapeId: string,
  pointId: string,
  point: { x: number; y: number }
): Shape[] => shapes.map((shape) => {
  if (shape.id !== shapeId || !shape.vectorPoints) return shape;
  const vectorPoints = shape.vectorPoints.map((candidate) => {
    if (candidate.id !== pointId) return candidate;
    const delta = { x: point.x - candidate.x, y: point.y - candidate.y };
    return {
      ...candidate,
      ...point,
      ...(candidate.handleIn ? { handleIn: { x: candidate.handleIn.x + delta.x, y: candidate.handleIn.y + delta.y } } : {}),
      ...(candidate.handleOut ? { handleOut: { x: candidate.handleOut.x + delta.x, y: candidate.handleOut.y + delta.y } } : {}),
    };
  });
  const left = Math.min(...vectorPoints.map((candidate) => candidate.x));
  const right = Math.max(...vectorPoints.map((candidate) => candidate.x));
  const top = Math.min(...vectorPoints.map((candidate) => candidate.y));
  const bottom = Math.max(...vectorPoints.map((candidate) => candidate.y));
  return normalizeShape({ ...shape, vectorPoints, x1: left, y1: top, x2: right, y2: bottom });
});

export const appendVectorPoint = (shapes: Shape[], shapeId: string, point: { x: number; y: number }): Shape[] =>
  shapes.map((shape) => shape.id === shapeId && shape.vectorPoints
    ? updateVectorPoint([{ ...shape, vectorPoints: [...shape.vectorPoints, { id: createShapeId(), ...point }] }], shapeId, "missing", point)[0]!
    : shape);

export const createBooleanOperation = (
  shapes: Shape[],
  selectedIds: readonly string[],
  operation: BooleanOperation
): { shapes: Shape[]; booleanId: string | null } => {
  const selected = shapes.filter((shape) => selectedIds.includes(shape.id) && BOOLEAN_SHAPE_TYPES.has(shape.type));
  if (selected.length < 2) return { shapes, booleanId: null };
  const bounds = selectionBounds(selected, selected.map((shape) => shape.id));
  if (!bounds) return { shapes, booleanId: null };
  const booleanId = createShapeId();
  const composite = normalizeShape({
    id: booleanId,
    type: "boolean",
    name: `${operation.charAt(0).toUpperCase()}${operation.slice(1)}`,
    x1: bounds.x, y1: bounds.y, x2: bounds.x + bounds.width, y2: bounds.y + bounds.height,
    width: bounds.width, height: bounds.height, level: 0,
    zIndex: Math.max(...selected.map((shape) => shape.zIndex)),
    parentId: selected.every((shape) => shape.parentId === selected[0]?.parentId) ? selected[0]?.parentId ?? null : null,
    backgroundColor: selected[0]?.backgroundColor ?? "#ffffff",
    borderColor: selected[0]?.borderColor ?? "transparent",
    borderWidth: selected[0]?.borderWidth ?? 0,
    booleanOperation: operation,
    booleanChildren: JSON.parse(JSON.stringify(selected)) as Shape[],
  });
  const selectedSet = new Set(selected.map((shape) => shape.id));
  return { shapes: [...shapes.filter((shape) => !selectedSet.has(shape.id)), composite], booleanId };
};

export const flattenBooleanOperation = (shapes: Shape[], booleanId: string): Shape[] => {
  const composite = shapes.find((shape) => shape.id === booleanId && shape.booleanChildren);
  if (!composite?.booleanChildren) return shapes;
  const highestZ = Math.max(0, ...shapes.map((shape) => shape.zIndex));
  const restored = composite.booleanChildren.map((shape, index) => normalizeShape({ ...shape, id: createShapeId(), zIndex: highestZ + index + 1 }));
  return [...shapes.filter((shape) => shape.id !== booleanId), ...restored];
};

export const createMask = (shapes: Shape[], selectedIds: readonly string[]): Shape[] => {
  const selected = shapes.filter((shape) => selectedIds.includes(shape.id)).sort((left, right) => left.zIndex - right.zIndex);
  const mask = selected[0];
  if (!mask || selected.length < 2) return shapes;
  const affected = new Set(selected.slice(1).map((shape) => shape.id));
  return shapes.map((shape) => shape.id === mask.id
    ? { ...shape, isMask: true }
    : affected.has(shape.id)
      ? { ...shape, maskId: mask.id }
      : shape);
};

export const releaseMask = (shapes: Shape[], maskId: string): Shape[] => shapes.map((shape) => shape.id === maskId
  ? { ...shape, isMask: false }
  : shape.maskId === maskId ? { ...shape, maskId: undefined } : shape);

export const gradientCss = (shape: Shape): string | undefined => {
  if (shape.fillType === "solid" || !shape.fillType || !shape.gradientStops?.length) return undefined;
  const stops = [...shape.gradientStops]
    .sort((left, right) => left.position - right.position)
    .map((stop) => `color-mix(in srgb, ${stop.color} ${Math.round(stop.opacity * 100)}%, transparent) ${Math.round(stop.position * 100)}%`)
    .join(", ");
  return shape.fillType === "radial-gradient"
    ? `radial-gradient(circle, ${stops})`
    : `linear-gradient(${shape.gradientAngle ?? 90}deg, ${stops})`;
};

export const effectStyles = (shape: Shape): { filter?: string; boxShadow?: string; backdropFilter?: string } => {
  const visible = (shape.effects ?? []).filter((effect) => effect.visible !== false);
  const filters = visible.filter((effect) => effect.type === "drop-shadow" || effect.type === "layer-blur").map((effect) =>
    effect.type === "layer-blur" ? `blur(${Math.max(0, effect.blur)}px)` : `drop-shadow(${effect.x}px ${effect.y}px ${effect.blur}px ${effect.color})`);
  const inner = visible.filter((effect) => effect.type === "inner-shadow").map((effect) =>
    `inset ${effect.x}px ${effect.y}px ${effect.blur}px ${effect.spread}px ${effect.color}`);
  const background = visible.find((effect) => effect.type === "background-blur");
  return {
    ...(filters.length ? { filter: filters.join(" ") } : {}),
    ...(inner.length ? { boxShadow: inner.join(", ") } : {}),
    ...(background ? { backdropFilter: `blur(${Math.max(0, background.blur)}px)` } : {}),
  };
};
