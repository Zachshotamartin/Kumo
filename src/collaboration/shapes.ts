import type { Json, JsonObject } from "@liveblocks/client";
import { Shape } from "../classes/shape";
import { normalizeShape } from "../editor/geometry";

export const storedShape = (shape: Shape): JsonObject => {
  const stored = JSON.parse(JSON.stringify(normalizeShape(shape))) as JsonObject;
  if (typeof stored.assetId === "string") delete stored.backgroundImage;
  return stored;
};

export const shapePatch = (
  previous: Shape,
  next: Shape
): { update: Record<string, Json>; remove: string[] } => {
  const before = storedShape(previous);
  const after = storedShape(next);
  const update: Record<string, Json> = {};
  const remove: string[] = [];
  Object.keys(before).forEach((key) => {
    if (!(key in after)) remove.push(key);
  });
  Object.entries(after).forEach(([key, value]) => {
    if (value !== undefined && JSON.stringify(before[key]) !== JSON.stringify(value)) update[key] = value;
  });
  return { update, remove };
};
