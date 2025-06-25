/**
 * Custom Test Matchers
 *
 * Provides custom Jest matchers for Kumo-specific testing.
 */

import { KumoShape, Board, Point, BoundingBox } from "../../types";

declare global {
  namespace jest {
    interface Matchers<R> {
      toBeValidShape(): R;
      toBeValidBoard(): R;
      toBeWithinBounds(bounds: BoundingBox): R;
      toHavePoint(point: Point): R;
    }
  }
}

/**
 * Custom matcher to check if object is a valid shape
 */
function toBeValidShape(received: any) {
  const pass =
    received &&
    typeof received.id === "string" &&
    typeof received.type === "string" &&
    received.bounds &&
    typeof received.bounds.x1 === "number" &&
    typeof received.bounds.y1 === "number" &&
    typeof received.bounds.x2 === "number" &&
    typeof received.bounds.y2 === "number";

  if (pass) {
    return {
      message: () => `expected ${received} not to be a valid shape`,
      pass: true,
    };
  } else {
    return {
      message: () => `expected ${received} to be a valid shape`,
      pass: false,
    };
  }
}

/**
 * Custom matcher to check if object is a valid board
 */
function toBeValidBoard(received: any) {
  const pass =
    received &&
    received.info &&
    typeof received.info.id === "string" &&
    Array.isArray(received.shapes) &&
    typeof received.version === "number";

  if (pass) {
    return {
      message: () => `expected ${received} not to be a valid board`,
      pass: true,
    };
  } else {
    return {
      message: () => `expected ${received} to be a valid board`,
      pass: false,
    };
  }
}

/**
 * Custom matcher to check if point is within bounds
 */
function toBeWithinBounds(received: Point, bounds: BoundingBox) {
  const pass =
    received.x >= bounds.x &&
    received.x <= bounds.x + bounds.width &&
    received.y >= bounds.y &&
    received.y <= bounds.y + bounds.height;

  if (pass) {
    return {
      message: () =>
        `expected point ${JSON.stringify(
          received
        )} not to be within bounds ${JSON.stringify(bounds)}`,
      pass: true,
    };
  } else {
    return {
      message: () =>
        `expected point ${JSON.stringify(
          received
        )} to be within bounds ${JSON.stringify(bounds)}`,
      pass: false,
    };
  }
}

/**
 * Custom matcher to check if shape contains a point
 */
function toHavePoint(received: KumoShape, point: Point) {
  const bounds = received.bounds;
  const pass =
    point.x >= Math.min(bounds.x1, bounds.x2) &&
    point.x <= Math.max(bounds.x1, bounds.x2) &&
    point.y >= Math.min(bounds.y1, bounds.y2) &&
    point.y <= Math.max(bounds.y1, bounds.y2);

  if (pass) {
    return {
      message: () =>
        `expected shape ${received.id} not to contain point ${JSON.stringify(
          point
        )}`,
      pass: true,
    };
  } else {
    return {
      message: () =>
        `expected shape ${received.id} to contain point ${JSON.stringify(
          point
        )}`,
      pass: false,
    };
  }
}

/**
 * Setup custom matchers
 */
export function setupCustomMatchers(): void {
  expect.extend({
    toBeValidShape,
    toBeValidBoard,
    toBeWithinBounds,
    toHavePoint,
  });
}
