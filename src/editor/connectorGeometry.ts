import type { Shape } from "../classes/shape";
import type { Bounds, Point } from "./types";

export type ConnectorAnchor = NonNullable<Shape["connectorStart"]>["anchor"];
export type ConnectorRoute = "straight" | "curved" | "orthogonal";

const boundsOf = (shape: Shape): Bounds => ({
  x: Math.min(shape.x1, shape.x2), y: Math.min(shape.y1, shape.y2),
  width: Math.abs(shape.x2 - shape.x1), height: Math.abs(shape.y2 - shape.y1),
});
const center = (bounds: Bounds): Point => ({ x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 });
const pointInBounds = (point: Point, bounds: Bounds, padding = 0) =>
  point.x >= bounds.x - padding && point.x <= bounds.x + bounds.width + padding
  && point.y >= bounds.y - padding && point.y <= bounds.y + bounds.height + padding;

export const anchorPoint = (shape: Shape, anchor: ConnectorAnchor, toward?: Point): Point => {
  const bounds = boundsOf(shape);
  const middle = center(bounds);
  const resolved = anchor === "auto" && toward
    ? Math.abs(toward.x - middle.x) >= Math.abs(toward.y - middle.y)
      ? toward.x >= middle.x ? "right" : "left"
      : toward.y >= middle.y ? "bottom" : "top"
    : anchor;
  if (resolved === "top") return { x: middle.x, y: bounds.y };
  if (resolved === "right") return { x: bounds.x + bounds.width, y: middle.y };
  if (resolved === "bottom") return { x: middle.x, y: bounds.y + bounds.height };
  if (resolved === "left") return { x: bounds.x, y: middle.y };
  return middle;
};

const shapeById = (shapes: Shape[], id?: string) => id ? shapes.find((shape) => shape.id === id && shape.type !== "connector") : undefined;

export const connectorEndpoints = (shapes: Shape[], connector: Shape): [Point, Point] => {
  const fallbackStart = { x: connector.x1, y: connector.y1 };
  const fallbackEnd = { x: connector.x2, y: connector.y2 };
  const startShape = shapeById(shapes, connector.connectorStart?.shapeId);
  const endShape = shapeById(shapes, connector.connectorEnd?.shapeId);
  const roughStart = startShape
    ? anchorPoint(startShape, connector.connectorStart?.anchor ?? "auto", endShape ? center(boundsOf(endShape)) : fallbackEnd)
    : { x: connector.connectorStart?.x ?? fallbackStart.x, y: connector.connectorStart?.y ?? fallbackStart.y };
  const roughEnd = endShape
    ? anchorPoint(endShape, connector.connectorEnd?.anchor ?? "auto", roughStart)
    : { x: connector.connectorEnd?.x ?? fallbackEnd.x, y: connector.connectorEnd?.y ?? fallbackEnd.y };
  return [
    startShape ? anchorPoint(startShape, connector.connectorStart?.anchor ?? "auto", roughEnd) : roughStart,
    endShape ? anchorPoint(endShape, connector.connectorEnd?.anchor ?? "auto", roughStart) : roughEnd,
  ];
};

export const segmentHitsBounds = (start: Point, end: Point, bounds: Bounds, padding = 12) => {
  const expanded = { x: bounds.x - padding, y: bounds.y - padding, width: bounds.width + padding * 2, height: bounds.height + padding * 2 };
  if (pointInBounds(start, expanded) || pointInBounds(end, expanded)) return true;
  if (start.x === end.x) return start.x >= expanded.x && start.x <= expanded.x + expanded.width
    && Math.max(start.y, end.y) >= expanded.y && Math.min(start.y, end.y) <= expanded.y + expanded.height;
  return start.y >= expanded.y && start.y <= expanded.y + expanded.height
    && Math.max(start.x, end.x) >= expanded.x && Math.min(start.x, end.x) <= expanded.x + expanded.width;
};

const simplifyRoute = (points: Point[]) => points.filter((point, index) => {
  if (index === 0 || index === points.length - 1) return true;
  const previous = points[index - 1]!;
  const next = points[index + 1]!;
  return !((previous.x === point.x && point.x === next.x) || (previous.y === point.y && point.y === next.y));
});

export const routeConnector = (shapes: Shape[], connector: Shape): Point[] => {
  const [start, end] = connectorEndpoints(shapes, connector);
  if ((connector.connectorRouting ?? "straight") !== "orthogonal") return [start, end];
  const obstacles = shapes.filter((shape) => shape.id !== connector.id
    && shape.id !== connector.connectorStart?.shapeId && shape.id !== connector.connectorEnd?.shapeId
    && !shape.hidden && !["connector", "guide", "resource"].includes(shape.type));
  const middleX = start.x + (end.x - start.x) / 2;
  const middleY = start.y + (end.y - start.y) / 2;
  const candidates = [
    [start, { x: middleX, y: start.y }, { x: middleX, y: end.y }, end],
    [start, { x: start.x, y: middleY }, { x: end.x, y: middleY }, end],
  ];
  if (connector.connectorAvoidObstacles !== false && obstacles.length) {
    const score = (route: Point[]) => route.slice(1).reduce((total, point, index) => total + obstacles.filter((shape) => segmentHitsBounds(route[index]!, point, boundsOf(shape))).length, 0);
    candidates.sort((left, right) => score(left) - score(right));
    if (score(candidates[0]!) > 0) {
      const obstacleBounds = obstacles.map(boundsOf);
      const top = Math.min(start.y, end.y, ...obstacleBounds.map((bounds) => bounds.y)) - 24;
      const bottom = Math.max(start.y, end.y, ...obstacleBounds.map((bounds) => bounds.y + bounds.height)) + 24;
      const left = Math.min(start.x, end.x, ...obstacleBounds.map((bounds) => bounds.x)) - 24;
      const right = Math.max(start.x, end.x, ...obstacleBounds.map((bounds) => bounds.x + bounds.width)) + 24;
      candidates.push(
        [start, { x: start.x, y: top }, { x: end.x, y: top }, end],
        [start, { x: start.x, y: bottom }, { x: end.x, y: bottom }, end],
        [start, { x: left, y: start.y }, { x: left, y: end.y }, end],
        [start, { x: right, y: start.y }, { x: right, y: end.y }, end]
      );
      candidates.sort((leftRoute, rightRoute) => score(leftRoute) - score(rightRoute));
    }
  }
  return simplifyRoute(candidates[0]!);
};

export const connectorCurvePoints = (start: Point, end: Point): [Point, Point, Point, Point] => {
  const bend = Math.max(24, Math.abs(end.x - start.x) * 0.42);
  return [start, { x: start.x + bend, y: start.y }, { x: end.x - bend, y: end.y }, end];
};

export const connectorRenderBounds = (shapes: Shape[], connector: Shape): Bounds => {
  const route = routeConnector(shapes, connector);
  const points = (connector.connectorRouting ?? "straight") === "curved" && route.length === 2 ? connectorCurvePoints(route[0]!, route[1]!) : route;
  const padding = Math.max(8, (connector.borderWidth ?? 2) / 2 + 6);
  const left = Math.min(...points.map((point) => point.x)) - padding;
  const right = Math.max(...points.map((point) => point.x)) + padding;
  const top = Math.min(...points.map((point) => point.y)) - padding;
  const bottom = Math.max(...points.map((point) => point.y)) + padding;
  return { x: left, y: top, width: Math.max(1, right - left), height: Math.max(1, bottom - top) };
};

export const connectorPath = (shapes: Shape[], connector: Shape): string => {
  const points = routeConnector(shapes, connector);
  const bounds = connectorRenderBounds(shapes, connector);
  if ((connector.connectorRouting ?? "straight") === "curved" && points.length === 2) {
    const local = (point: Point) => ({ x: point.x - bounds.x, y: point.y - bounds.y });
    const [worldStart, worldControlOne, worldControlTwo, worldEnd] = connectorCurvePoints(points[0]!, points[1]!);
    const start = local(worldStart); const controlOne = local(worldControlOne); const controlTwo = local(worldControlTwo); const end = local(worldEnd);
    return `M ${start.x} ${start.y} C ${controlOne.x} ${controlOne.y}, ${controlTwo.x} ${controlTwo.y}, ${end.x} ${end.y}`;
  }
  return points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x - bounds.x} ${point.y - bounds.y}`).join(" ");
};
