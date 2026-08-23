import type { Shape } from "../classes/shape";
import { shapeVisualBounds } from "./geometry";
import type { Point } from "./types";

export interface DistanceMeasurement {
  axis: "horizontal" | "vertical";
  start: Point;
  end: Point;
  value: number;
}

/** Returns the visible edge-to-edge gaps between two objects. Overlap is reported as zero. */
export const measureShapes = (first: Shape, second: Shape): DistanceMeasurement[] => {
  const a = shapeVisualBounds(first);
  const b = shapeVisualBounds(second);
  const horizontalStart = a.x + a.width <= b.x ? a.x + a.width : b.x + b.width <= a.x ? b.x + b.width : Math.max(a.x, b.x);
  const horizontalEnd = a.x + a.width <= b.x ? b.x : b.x + b.width <= a.x ? a.x : horizontalStart;
  const verticalStart = a.y + a.height <= b.y ? a.y + a.height : b.y + b.height <= a.y ? b.y + b.height : Math.max(a.y, b.y);
  const verticalEnd = a.y + a.height <= b.y ? b.y : b.y + b.height <= a.y ? a.y : verticalStart;
  const overlapY = Math.max(Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y), 0);
  const overlapX = Math.max(Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x), 0);
  return [
    {
      axis: "horizontal",
      start: { x: horizontalStart, y: Math.max(a.y, b.y) + overlapY / 2 },
      end: { x: horizontalEnd, y: Math.max(a.y, b.y) + overlapY / 2 },
      value: Math.max(0, horizontalEnd - horizontalStart),
    },
    {
      axis: "vertical",
      start: { x: Math.max(a.x, b.x) + overlapX / 2, y: verticalStart },
      end: { x: Math.max(a.x, b.x) + overlapX / 2, y: verticalEnd },
      value: Math.max(0, verticalEnd - verticalStart),
    },
  ];
};
