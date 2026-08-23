import { createShapeId, type Shape } from "../classes/shape";
import { descendantIds } from "./hierarchy";

export type PrototypeInteraction = NonNullable<Shape["prototypeInteractions"]>[number];

export const prototypeFrames = (shapes: Shape[]) => shapes
  .filter((shape) => shape.type === "frame" && !shape.parentId && !shape.hidden)
  .sort((left, right) => left.zIndex - right.zIndex);

export const startPrototypeFrame = (shapes: Shape[]): Shape | undefined => {
  const frames = prototypeFrames(shapes);
  return frames.find((shape) => shape.prototypeStart) ?? frames[0];
};

export const shapesInPrototypeFrame = (shapes: Shape[], frameId: string): Shape[] => {
  const ids = new Set([frameId, ...descendantIds(shapes, [frameId])]);
  return shapes.filter((shape) => ids.has(shape.id) && shape.type !== "resource" && shape.type !== "guide");
};

export const addPrototypeInteraction = (
  shapes: Shape[],
  shapeId: string,
  interaction: Omit<PrototypeInteraction, "id">
): Shape[] => shapes.map((shape) => shape.id === shapeId ? {
  ...shape,
  prototypeInteractions: [
    ...(shape.prototypeInteractions ?? []),
    { id: createShapeId(), transition: "instant", duration: 0.2, ...interaction },
  ],
} : shape);

export const removePrototypeInteraction = (shapes: Shape[], shapeId: string, interactionId: string): Shape[] =>
  shapes.map((shape) => shape.id === shapeId ? {
    ...shape,
    prototypeInteractions: (shape.prototypeInteractions ?? []).filter((interaction) => interaction.id !== interactionId),
  } : shape);

export const setPrototypeStart = (shapes: Shape[], frameId: string): Shape[] => shapes.map((shape) => ({
  ...shape,
  prototypeStart: shape.type === "frame" && shape.id === frameId,
}));

export const interactionForTrigger = (shape: Shape, trigger: PrototypeInteraction["trigger"]) =>
  shape.prototypeInteractions?.find((interaction) => interaction.trigger === trigger);
