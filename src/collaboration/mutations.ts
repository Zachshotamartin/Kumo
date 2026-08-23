import { LiveObject, LsonObject } from "@liveblocks/client";
import type { Shape } from "../classes/shape";
import { shapePatch, storedShape } from "./shapes";

interface ShapeNode {
  update(patch: Record<string, unknown>): void;
  delete(key: string): void;
}

interface ShapeNodeMap {
  get(id: string): ShapeNode | undefined;
  set(id: string, shape: ShapeNode): void;
  delete(id: string): void;
}

/**
 * Applies only the local delta. A shape that existed in the baseline but is
 * now missing from storage was deleted remotely and must not be recreated.
 */
export const applyShapeMutation = (
  nodes: ShapeNodeMap,
  nextShapes: Shape[],
  previousShapes: Shape[]
): void => {
  const previousById = new Map(previousShapes.map((shape) => [shape.id, shape]));
  const nextById = new Map(nextShapes.map((shape) => [shape.id, shape]));

  previousById.forEach((_shape, id) => {
    if (!nextById.has(id)) nodes.delete(id);
  });

  nextById.forEach((shape, id) => {
    const previous = previousById.get(id);
    const existing = nodes.get(id);
    if (!previous) {
      if (!existing) {
        nodes.set(id, new LiveObject(storedShape(shape) as LsonObject) as unknown as ShapeNode);
      }
      return;
    }
    if (!existing) return;
    const patch = shapePatch(previous, shape);
    if (Object.keys(patch.update).length) existing.update(patch.update);
    patch.remove.forEach((key) => existing.delete(key));
  });
};
