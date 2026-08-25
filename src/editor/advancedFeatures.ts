import { createShapeId, ShapeFunctions, type Shape } from "../classes/shape.js";
import { normalizeShape, shapeBounds } from "./geometry.js";
import type { Bounds, Point } from "./types.js";
import {
  anchorPoint as resolveAnchorPoint,
  connectorEndpoints as resolveConnectorEndpoints,
  connectorPath as resolveConnectorPath,
  connectorRenderBounds as resolveConnectorRenderBounds,
  routeConnector as resolveConnectorRoute,
} from "./connectorGeometry.js";
import { paintBackgroundLayers } from "./shapePaint.js";

export type ConnectorAnchor = NonNullable<Shape["connectorStart"]>["anchor"];
export type ConnectorRoute = "straight" | "curved" | "orthogonal";

const center = (bounds: Bounds): Point => ({
  x: bounds.x + bounds.width / 2,
  y: bounds.y + bounds.height / 2,
});

const pointInBounds = (point: Point, bounds: Bounds, padding = 0) =>
  point.x >= bounds.x - padding && point.x <= bounds.x + bounds.width + padding
  && point.y >= bounds.y - padding && point.y <= bounds.y + bounds.height + padding;

export const anchorPoint = (
  shape: Shape,
  anchor: ConnectorAnchor,
  toward?: Point
): Point => resolveAnchorPoint(shape, anchor, toward);

export const connectorEndpoints = (shapes: Shape[], connector: Shape): [Point, Point] => {
  return resolveConnectorEndpoints(shapes, connector);
};

export const routeConnector = (shapes: Shape[], connector: Shape): Point[] => {
  return resolveConnectorRoute(shapes, connector);
};

export const connectorRenderBounds = (shapes: Shape[], connector: Shape): Bounds => {
  return resolveConnectorRenderBounds(shapes, connector);
};

export const connectorPath = (shapes: Shape[], connector: Shape): string => {
  return resolveConnectorPath(shapes, connector);
};

export const refreshAttachedConnectors = (shapes: Shape[]): Shape[] => shapes.map((shape) => {
  if (shape.type !== "connector") return shape;
  const [start, end] = connectorEndpoints(shapes, shape);
  return normalizeShape({
    ...shape,
    x1: start.x,
    y1: start.y,
    x2: end.x,
    y2: end.y,
    connectorStart: { anchor: "auto", ...shape.connectorStart, x: start.x, y: start.y },
    connectorEnd: { anchor: "auto", ...shape.connectorEnd, x: end.x, y: end.y },
  });
});

export const endpointAtPoint = (shapes: Shape[], point: Point, excludedId?: string): NonNullable<Shape["connectorStart"]> => {
  const hit = shapes
    .filter((shape) => shape.id !== excludedId && !["connector", "guide", "resource"].includes(shape.type) && !shape.hidden)
    .sort((left, right) => right.zIndex - left.zIndex)
    .find((shape) => pointInBounds(point, shapeBounds(shape), 8));
  return hit
    ? { shapeId: hit.id, anchor: "auto", ...anchorPoint(hit, "auto", point) }
    : { anchor: "auto", x: point.x, y: point.y };
};

export const finalizeConnector = (shapes: Shape[], connectorId: string): Shape[] => {
  const connector = shapes.find((shape) => shape.id === connectorId);
  if (!connector || connector.type !== "connector") return shapes;
  const next = shapes.map((shape) => shape.id === connectorId ? {
    ...shape,
    connectorStart: endpointAtPoint(shapes, { x: connector.x1, y: connector.y1 }, connectorId),
    connectorEnd: endpointAtPoint(shapes, { x: connector.x2, y: connector.y2 }, connectorId),
  } : shape);
  return refreshAttachedConnectors(next);
};

export const quickConnectNode = (
  shapes: Shape[],
  sourceId: string,
  direction: "left" | "right" | "top" | "bottom"
): { shapes: Shape[]; nodeId: string | null } => {
  const source = shapes.find((shape) => shape.id === sourceId && !["connector", "guide", "resource"].includes(shape.type));
  if (!source) return { shapes, nodeId: null };
  const bounds = shapeBounds(source);
  const nodeWidth = Math.max(120, Math.min(220, bounds.width));
  const nodeHeight = Math.max(64, Math.min(140, bounds.height));
  const gap = 96;
  const x = direction === "left" ? bounds.x - gap - nodeWidth : direction === "right" ? bounds.x + bounds.width + gap : bounds.x + (bounds.width - nodeWidth) / 2;
  const y = direction === "top" ? bounds.y - gap - nodeHeight : direction === "bottom" ? bounds.y + bounds.height + gap : bounds.y + (bounds.height - nodeHeight) / 2;
  const node = normalizeShape({
    ...ShapeFunctions.createShape("rectangle", x, y, shapes),
    name: "Connected node", text: "Next idea", color: "#17181a", fontSize: 16,
    x2: x + nodeWidth, y2: y + nodeHeight,
    backgroundColor: "#f4f2ed", borderColor: "#686b70", borderWidth: 1, borderRadius: 10,
    pageId: source.pageId, parentId: source.parentId ?? null,
  });
  const start = anchorPoint(source, direction, center(shapeBounds(node)));
  const end = anchorPoint(node, direction === "left" ? "right" : direction === "right" ? "left" : direction === "top" ? "bottom" : "top", start);
  const connector = normalizeShape({
    ...createAdvancedPrimitive("connector", start, [...shapes, node]),
    x1: start.x, y1: start.y, x2: end.x, y2: end.y,
    connectorStart: { shapeId: source.id, anchor: direction, ...start },
    connectorEnd: { shapeId: node.id, anchor: direction === "left" ? "right" : direction === "right" ? "left" : direction === "top" ? "bottom" : "top", ...end },
    pageId: source.pageId,
  });
  return { shapes: refreshAttachedConnectors([...shapes, node, connector]), nodeId: node.id };
};

export const appendFreehandPoint = (shape: Shape, point: Point, minimumDistance = 2): Shape => {
  if (shape.type !== "vector" || !shape.drawingKind) return shape;
  const points = shape.vectorPoints ?? [];
  const previous = points.at(-1);
  if (previous && Math.hypot(point.x - previous.x, point.y - previous.y) < minimumDistance) return shape;
  return normalizeShape({
    ...shape,
    vectorPoints: [...points, { id: createShapeId(), x: point.x, y: point.y }],
    vectorPaths: undefined,
    x2: point.x,
    y2: point.y,
  });
};

export const createAdvancedPrimitive = (
  kind: "connector" | "sticky" | "marker" | "highlighter" | "table" | "code" | "link",
  point: Point,
  shapes: Shape[]
): Shape => {
  if (kind === "marker" || kind === "highlighter") {
    return normalizeShape({
      ...ShapeFunctions.createShape("vector", point.x, point.y, shapes),
      name: kind === "marker" ? "Marker stroke" : "Highlighter stroke",
      drawingKind: kind,
      vectorPoints: [
        { id: createShapeId(), x: point.x, y: point.y },
        { id: createShapeId(), x: point.x, y: point.y },
      ],
      backgroundColor: "transparent",
      borderColor: kind === "marker" ? "#f4f2ed" : "#f6d365",
      borderWidth: kind === "marker" ? 5 : 16,
      opacity: kind === "marker" ? 1 : 0.42,
      strokeCap: "round",
      strokeJoin: "round",
    });
  }
  const shape = ShapeFunctions.createShape(kind, point.x, point.y, shapes);
  if (kind === "connector") return normalizeShape({
    ...shape,
    name: "Connector",
    backgroundColor: "transparent",
    borderColor: "#d9d9d9",
    borderWidth: 2,
    connectorRouting: "orthogonal",
    connectorAvoidObstacles: true,
    connectorStartCap: "none",
    connectorEndCap: "arrow",
    connectorStart: { anchor: "auto", x: point.x, y: point.y },
    connectorEnd: { anchor: "auto", x: point.x, y: point.y },
  });
  if (kind === "sticky") return normalizeShape({
    ...shape, name: "Sticky note", text: "Write an idea", fontSize: 18, color: "#2a2418",
    backgroundColor: "#f6d365", borderColor: "#e2b94f", borderWidth: 1, borderRadius: 3,
  });
  if (kind === "table") return normalizeShape({
    ...shape, name: "Table", rows: 3, columns: 3,
    tableCells: [["Header 1", "Header 2", "Header 3"], ["", "", ""], ["", "", ""]],
    backgroundColor: "#f7f7f5", borderColor: "#777a80", borderWidth: 1, color: "#17181a",
  });
  if (kind === "code") return normalizeShape({
    ...shape, name: "Code block", text: "const idea = 'connected';", codeLanguage: "javascript",
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: 14,
    backgroundColor: "#111214", borderColor: "#3b3d42", borderWidth: 1, borderRadius: 8, color: "#f5f5f2",
  });
  return normalizeShape({
    ...shape, name: "Link preview", embedTitle: "Paste a link", embedDescription: "A rich preview will appear here.",
    backgroundColor: "#24262a", borderColor: "#45484f", borderWidth: 1, borderRadius: 10, color: "#f5f5f2",
  });
};

export interface PrototypeFlow {
  id: string;
  name: string;
  description: string;
  startFrameId: string;
}

const readFlow = (shape: Shape): PrototypeFlow | null => {
  if (shape.type !== "resource" || shape.resourceKind !== "prototype-flow") return null;
  try {
    const parsed = JSON.parse(String(shape.resourceValue?.json ?? "")) as PrototypeFlow;
    return parsed.id && parsed.name && parsed.startFrameId ? parsed : null;
  } catch {
    return null;
  }
};

export const prototypeFlows = (shapes: Shape[]): PrototypeFlow[] => shapes.flatMap((shape) => {
  const flow = readFlow(shape);
  return flow ? [flow] : [];
});

export const createPrototypeFlow = (
  shapes: Shape[],
  startFrameId: string,
  name: string,
  description = ""
): Shape[] => {
  if (!shapes.some((shape) => shape.id === startFrameId && shape.type === "frame")) return shapes;
  const flow: PrototypeFlow = { id: createShapeId(), name: name.trim() || "Flow", description: description.trim(), startFrameId };
  const resource = normalizeShape({
    ...ShapeFunctions.createShape("resource", 0, 0, shapes),
    hidden: true,
    locked: true,
    resourceKind: "prototype-flow",
    resourceName: flow.name,
    resourceValue: { json: JSON.stringify(flow) },
  });
  return [...shapes.map((shape) => shape.id === startFrameId
    ? { ...shape, prototypeStart: true, prototypeFlowIds: [...new Set([...(shape.prototypeFlowIds ?? []), flow.id])] }
    : shape), resource];
};

export const removePrototypeFlow = (shapes: Shape[], flowId: string): Shape[] => shapes
  .filter((shape) => readFlow(shape)?.id !== flowId)
  .map((shape) => shape.prototypeFlowIds?.includes(flowId)
    ? { ...shape, prototypeFlowIds: shape.prototypeFlowIds.filter((id) => id !== flowId) }
    : shape);

export const updatePrototypeFlow = (shapes: Shape[], flow: PrototypeFlow): Shape[] => shapes.map((shape) => {
  if (readFlow(shape)?.id === flow.id) return {
    ...shape,
    resourceName: flow.name,
    resourceValue: { json: JSON.stringify(flow) },
  };
  const without = shape.prototypeFlowIds?.filter((id) => id !== flow.id) ?? [];
  if (shape.id === flow.startFrameId) return { ...shape, prototypeStart: true, prototypeFlowIds: [...without, flow.id] };
  return shape.prototypeFlowIds ? { ...shape, prototypeFlowIds: without } : shape;
});

export interface KumoFont {
  family: string;
  category: "sans" | "serif" | "mono" | "display";
  source: "system" | "google" | "workspace";
  url?: string;
  style?: "normal" | "italic";
  weight?: string;
}

export const BUILTIN_FONTS: KumoFont[] = [
  { family: "Arial", category: "sans", source: "system" },
  { family: "Helvetica Neue", category: "sans", source: "system" },
  { family: "Georgia", category: "serif", source: "system" },
  { family: "ui-monospace", category: "mono", source: "system" },
  { family: "Inter", category: "sans", source: "google", url: "https://fonts.googleapis.com/css2?family=Inter:wght@100..900&display=swap" },
  { family: "Manrope", category: "sans", source: "google", url: "https://fonts.googleapis.com/css2?family=Manrope:wght@200..800&display=swap" },
  { family: "Space Grotesk", category: "display", source: "google", url: "https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@300..700&display=swap" },
  { family: "IBM Plex Mono", category: "mono", source: "google", url: "https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@100..700&display=swap" },
];

export const searchFonts = (fonts: KumoFont[], query: string) => {
  const normalized = query.trim().toLocaleLowerCase();
  return normalized ? fonts.filter((font) => font.family.toLocaleLowerCase().includes(normalized)) : fonts;
};

export const missingFonts = (shapes: Shape[], available: readonly string[]) => {
  const registry = new Set([...available, "serif", "sans-serif", "monospace", "cursive", "fantasy", "system-ui"]
    .map((font) => font.toLocaleLowerCase()));
  const families = (stack: string) => stack.split(",").map((font) => font.trim().replace(/^(['"])(.*)\1$/, "$2").toLocaleLowerCase()).filter(Boolean);
  return [...new Set(shapes.flatMap((shape) => [shape.fontFamily, ...(shape.textRuns ?? []).map((run) => run.fontFamily)]).filter((font): font is string => Boolean(font)))]
    .filter((font) => !registry.has(families(font)[0] ?? ""));
};

export const replaceFont = (shapes: Shape[], missing: string, replacement: string): Shape[] => shapes.map((shape) => ({
  ...shape,
  fontFamily: shape.fontFamily === missing ? replacement : shape.fontFamily,
  textRuns: shape.textRuns?.map((run) => ({ ...run, fontFamily: run.fontFamily === missing ? replacement : run.fontFamily })),
}));

export const csvCells = (source: string): string[][] => {
  const rows: string[][] = [];
  let row: string[] = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index]!;
    if (character === '"' && quoted && source[index + 1] === '"') { value += '"'; index += 1; continue; }
    if (character === '"') { quoted = !quoted; continue; }
    if (character === "," && !quoted) { row.push(value); value = ""; continue; }
    if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && source[index + 1] === "\n") index += 1;
      row.push(value); rows.push(row); row = []; value = ""; continue;
    }
    value += character;
  }
  if (value || row.length) { row.push(value); rows.push(row); }
  const width = Math.max(0, ...rows.map((cells) => cells.length));
  return rows.map((cells) => [...cells, ...Array(Math.max(0, width - cells.length)).fill("")]);
};

export const tableShapeFromCsv = (source: string, point: Point, shapes: Shape[]): Shape => {
  const cells = csvCells(source).slice(0, 200).map((row) => row.slice(0, 50));
  return normalizeShape({
    ...createAdvancedPrimitive("table", point, shapes),
    tableCells: cells,
    rows: Math.max(1, cells.length),
    columns: Math.max(1, ...cells.map((row) => row.length)),
    x2: point.x + Math.max(240, Math.max(1, ...cells.map((row) => row.length)) * 120),
    y2: point.y + Math.max(96, Math.max(1, cells.length) * 36),
  });
};

export const richLinkShape = (value: string, point: Point, shapes: Shape[]): Shape | null => {
  try {
    const url = new URL(value.trim());
    if (!/^https?:$/.test(url.protocol)) return null;
    return normalizeShape({
      ...createAdvancedPrimitive("link", point, shapes),
      embedUrl: url.toString(),
      embedTitle: url.hostname.replace(/^www\./, ""),
      embedDescription: url.pathname === "/" ? "Open website" : url.pathname,
      x2: point.x + 320,
      y2: point.y + 120,
    });
  } catch {
    return null;
  }
};

const svgNumber = (element: Element, name: string, fallback = 0) => {
  const value = Number.parseFloat(element.getAttribute(name) ?? "");
  return Number.isFinite(value) ? value : fallback;
};

const svgStyleValue = (element: Element, name: string) => {
  const attribute = element.getAttribute(name);
  if (attribute) return attribute;
  const declaration = (element.getAttribute("style") ?? "").split(";")
    .map((part) => part.split(":").map((value) => value.trim()))
    .find(([property]) => property === name);
  return declaration?.[1];
};

const svgPaint = (element: Element) => {
  const fill = svgStyleValue(element, "fill") ?? "#d9d9d9";
  const stroke = svgStyleValue(element, "stroke") ?? "transparent";
  return {
    backgroundColor: fill === "none" ? "transparent" : fill,
    borderColor: stroke === "none" ? "transparent" : stroke,
    borderWidth: Math.max(0, svgNumber(element, "stroke-width", stroke === "none" ? 0 : 1)),
    opacity: Math.max(0, Math.min(1, svgNumber(element, "opacity", 1))),
  };
};

const svgPathPoints = (source: string, translate: (point: Point) => Point) => {
  const tokens = source.match(/[A-Za-z]|[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?/g) ?? [];
  const points: NonNullable<Shape["vectorPoints"]> = [];
  let index = 0;
  let command = "";
  let current = { x: 0, y: 0 };
  let subpathStart = { x: 0, y: 0 };
  let previousCubicControl: Point | null = null;
  let closed = false;
  const number = () => Number(tokens[index++]);
  const hasNumbers = () => index < tokens.length && !/^[A-Za-z]$/.test(tokens[index]!);
  const absolute = (x: number, y: number, relative: boolean) => relative
    ? { x: current.x + x, y: current.y + y }
    : { x, y };
  const add = (point: Point, handleIn?: Point) => {
    const translated = translate(point);
    points.push({ id: createShapeId(), ...translated, ...(handleIn ? { handleIn: translate(handleIn) } : {}) });
    current = point;
  };
  while (index < tokens.length) {
    if (/^[A-Za-z]$/.test(tokens[index]!)) command = tokens[index++]!;
    if (!command) break;
    const relative = command === command.toLowerCase();
    const upper = command.toUpperCase();
    if (upper === "Z") {
      closed = true;
      current = subpathStart;
      previousCubicControl = null;
      command = "";
      continue;
    }
    if (!hasNumbers()) break;
    if (upper === "M" || upper === "L" || upper === "T") {
      const point = absolute(number(), number(), relative);
      add(point);
      previousCubicControl = null;
      if (upper === "M") { subpathStart = point; command = relative ? "l" : "L"; }
      continue;
    }
    if (upper === "H") { add({ x: relative ? current.x + number() : number(), y: current.y }); previousCubicControl = null; continue; }
    if (upper === "V") { add({ x: current.x, y: relative ? current.y + number() : number() }); previousCubicControl = null; continue; }
    if (upper === "C") {
      const first = absolute(number(), number(), relative);
      const second = absolute(number(), number(), relative);
      const end = absolute(number(), number(), relative);
      if (points.length) points[points.length - 1] = { ...points.at(-1)!, handleOut: translate(first) };
      add(end, second);
      previousCubicControl = second;
      continue;
    }
    if (upper === "S") {
      const previous = points.at(-1);
      const reflected = previousCubicControl
        ? { x: current.x * 2 - previousCubicControl.x, y: current.y * 2 - previousCubicControl.y }
        : current;
      const second = absolute(number(), number(), relative);
      const end = absolute(number(), number(), relative);
      if (previous) points[points.length - 1] = { ...previous, handleOut: translate(reflected) };
      add(end, second);
      previousCubicControl = second;
      continue;
    }
    if (upper === "Q") {
      const control = absolute(number(), number(), relative);
      const end = absolute(number(), number(), relative);
      const first = { x: current.x + (control.x - current.x) * 2 / 3, y: current.y + (control.y - current.y) * 2 / 3 };
      const second = { x: end.x + (control.x - end.x) * 2 / 3, y: end.y + (control.y - end.y) * 2 / 3 };
      if (points.length) points[points.length - 1] = { ...points.at(-1)!, handleOut: translate(first) };
      add(end, second);
      previousCubicControl = null;
      continue;
    }
    if (upper === "A") {
      number(); number(); number(); number(); number();
      add(absolute(number(), number(), relative));
      previousCubicControl = null;
      continue;
    }
    break;
  }
  return { points, closed };
};

/** Convert common SVG primitives and paths into editable Kumo layers. */
export const shapesFromSvg = (source: string, origin: Point, existing: Shape[]): Shape[] => {
  if (typeof DOMParser === "undefined") return [];
  const document = new DOMParser().parseFromString(source, "image/svg+xml");
  if (document.querySelector("parsererror")) return [];
  const root = document.documentElement;
  if (root.tagName.toLowerCase() !== "svg") return [];
  const viewBox = (root.getAttribute("viewBox") ?? "").split(/[\s,]+/).map(Number);
  const viewX = Number.isFinite(viewBox[0]) ? viewBox[0]! : 0;
  const viewY = Number.isFinite(viewBox[1]) ? viewBox[1]! : 0;
  const width = Number.isFinite(viewBox[2]) ? viewBox[2]! : svgNumber(root, "width", 640);
  const height = Number.isFinite(viewBox[3]) ? viewBox[3]! : svgNumber(root, "height", 480);
  const scale = Math.min(1, 640 / Math.max(1, width), 480 / Math.max(1, height));
  const translate = ({ x, y }: Point) => ({ x: origin.x + (x - viewX) * scale, y: origin.y + (y - viewY) * scale });
  const created: Shape[] = [];
  const base = (element: Element, type: string, start: Point, end: Point) => normalizeShape({
    ...ShapeFunctions.createShape(type, start.x, start.y, [...existing, ...created]),
    name: element.getAttribute("id") || `SVG ${type}`,
    x1: start.x, y1: start.y, x2: end.x, y2: end.y,
    ...svgPaint(element),
  });
  Array.from(root.querySelectorAll("rect,circle,ellipse,line,polyline,polygon,path,text")).slice(0, 1000).forEach((element) => {
    const tag = element.tagName.toLowerCase();
    if (tag === "rect") {
      const start = translate({ x: svgNumber(element, "x"), y: svgNumber(element, "y") });
      const end = translate({ x: svgNumber(element, "x") + svgNumber(element, "width"), y: svgNumber(element, "y") + svgNumber(element, "height") });
      created.push(normalizeShape({ ...base(element, "rectangle", start, end), borderRadius: svgNumber(element, "rx") * scale }));
      return;
    }
    if (tag === "circle" || tag === "ellipse") {
      const cx = svgNumber(element, "cx"); const cy = svgNumber(element, "cy");
      const rx = svgNumber(element, tag === "circle" ? "r" : "rx"); const ry = svgNumber(element, tag === "circle" ? "r" : "ry");
      created.push(base(element, "ellipse", translate({ x: cx - rx, y: cy - ry }), translate({ x: cx + rx, y: cy + ry })));
      return;
    }
    if (tag === "text") {
      const start = translate({ x: svgNumber(element, "x"), y: svgNumber(element, "y") - svgNumber(element, "font-size", 16) });
      created.push(normalizeShape({ ...base(element, "text", start, { x: start.x + 240, y: start.y + svgNumber(element, "font-size", 16) * 1.5 }), text: element.textContent!, fontSize: svgNumber(element, "font-size", 16) * scale, color: svgStyleValue(element, "fill") ?? "#d9d9d9", backgroundColor: "transparent", borderWidth: 0, textAutoResize: "auto-width" }));
      return;
    }
    let points: NonNullable<Shape["vectorPoints"]> = [];
    let closed = tag === "polygon";
    if (tag === "line") points = [translate({ x: svgNumber(element, "x1"), y: svgNumber(element, "y1") }), translate({ x: svgNumber(element, "x2"), y: svgNumber(element, "y2") })].map((point) => ({ id: createShapeId(), ...point }));
    else if (tag === "polyline" || tag === "polygon") points = (element.getAttribute("points")?.match(/[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?/g) ?? []).map(Number).reduce<Point[]>((all, value, index, values) => index % 2 ? all : [...all, translate({ x: value, y: values[index + 1] ?? 0 })], []).map((point) => ({ id: createShapeId(), ...point }));
    else ({ points, closed } = svgPathPoints(element.getAttribute("d") ?? "", translate));
    if (points.length < 2) return;
    const xs = points.map((point) => point.x); const ys = points.map((point) => point.y);
    created.push(normalizeShape({ ...base(element, "vector", { x: Math.min(...xs), y: Math.min(...ys) }, { x: Math.max(...xs), y: Math.max(...ys) }), vectorPoints: points, vectorClosed: closed, backgroundColor: closed ? svgPaint(element).backgroundColor : "transparent" }));
  });
  return created;
};

interface MermaidNode { id: string; label: string; kind: "diamond" | "ellipse" | "rectangle" }

const mermaidNode = (token: string): MermaidNode | null => {
  const match = token.trim().match(/^([A-Za-z0-9_-]+)(?:\[([^\]]+)\]|\(([^)]+)\)|\{([^}]+)\})?$/);
  if (!match) return null;
  return { id: match[1]!, label: match[2] ?? match[3] ?? match[4] ?? match[1]!, kind: match[4] ? "diamond" : match[3] ? "ellipse" : "rectangle" };
};

export const shapesFromMermaid = (source: string, origin: Point, existing: Shape[]): Shape[] => {
  const edges: Array<{ from: string; to: string; label: string }> = [];
  const nodes = new Map<string, MermaidNode>();
  const rememberNode = (node: MermaidNode) => {
    const previous = nodes.get(node.id);
    if (!previous || previous.label === previous.id || node.label !== node.id) nodes.set(node.id, node);
  };
  source.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).forEach((line) => {
    if (/^(flowchart|graph)\b/i.test(line) || line.startsWith("%%")) return;
    const match = line.match(/^(.+?)\s*(?:-->|---|==>)\s*(?:\|([^|]*)\|\s*)?(.+)$/);
    if (!match) {
      const standalone = mermaidNode(line);
      if (standalone) rememberNode(standalone);
      return;
    }
    const from = mermaidNode(match[1]!);
    const to = mermaidNode(match[3]!);
    if (!from || !to) return;
    rememberNode(from);
    rememberNode(to);
    edges.push({ from: from.id, to: to.id, label: match[2]?.trim() ?? "" });
  });
  if (!nodes.size) return [];
  const createdByMermaidId = new Map<string, Shape>();
  [...nodes.values()].forEach((node, index) => {
    const column = index % 3;
    const row = Math.floor(index / 3);
    const x = origin.x + column * 220;
    const y = origin.y + row * 150;
    const base = ShapeFunctions.createShape(node.kind === "ellipse" ? "ellipse" : "rectangle", x, y, [...existing, ...createdByMermaidId.values()]);
    createdByMermaidId.set(node.id, normalizeShape({
      ...base,
      name: node.label,
      text: node.label,
      color: "#17181a",
      fontSize: 16,
      backgroundColor: node.kind === "diamond" ? "#f6d365" : "#f4f2ed",
      borderColor: "#5f6167",
      borderWidth: 1,
      borderRadius: node.kind === "ellipse" ? 1000 : 10,
      rotation: node.kind === "diamond" ? 45 : 0,
      x2: x + 160,
      y2: y + 88,
    }));
  });
  const created = [...createdByMermaidId.values()];
  edges.forEach((edge) => {
    const from = createdByMermaidId.get(edge.from)!;
    const to = createdByMermaidId.get(edge.to)!;
    const start = anchorPoint(from, "auto", center(shapeBounds(to)));
    const end = anchorPoint(to, "auto", start);
    const connector = normalizeShape({
      ...createAdvancedPrimitive("connector", start, [...existing, ...created]),
      x1: start.x, y1: start.y, x2: end.x, y2: end.y,
      connectorStart: { shapeId: from.id, anchor: "auto", ...start },
      connectorEnd: { shapeId: to.id, anchor: "auto", ...end },
      connectorLabel: edge.label,
    });
    created.push(connector);
  });
  return refreshAttachedConnectors(created);
};

export interface WorkshopState {
  timerEndsAt: number | null;
  timerDurationSeconds: number;
  votingOpen: boolean;
  votesPerPerson: number;
  musicUrl: string;
}

export const DEFAULT_WORKSHOP_STATE: WorkshopState = {
  timerEndsAt: null,
  timerDurationSeconds: 300,
  votingOpen: false,
  votesPerPerson: 3,
  musicUrl: "",
};

export const workshopState = (shapes: Shape[]): WorkshopState => {
  const resource = shapes.find((shape) => shape.type === "resource" && shape.resourceKind === "workshop-state");
  try {
    return { ...DEFAULT_WORKSHOP_STATE, ...JSON.parse(String(resource?.resourceValue?.json ?? "{}")) };
  } catch {
    return DEFAULT_WORKSHOP_STATE;
  }
};

export const updateWorkshopState = (shapes: Shape[], patch: Partial<WorkshopState>): Shape[] => {
  const next = { ...workshopState(shapes), ...patch };
  const existing = shapes.find((shape) => shape.type === "resource" && shape.resourceKind === "workshop-state");
  if (existing) return shapes.map((shape) => shape.id === existing.id ? { ...shape, resourceValue: { json: JSON.stringify(next) } } : shape);
  return [...shapes, normalizeShape({
    ...ShapeFunctions.createShape("resource", 0, 0, shapes),
    hidden: true,
    locked: true,
    resourceKind: "workshop-state",
    resourceName: "Workshop session",
    resourceValue: { json: JSON.stringify(next) },
  })];
};

export interface BoardTrailEntry { boardId: string; title: string; sourceBoardId?: string; sourceShapeId?: string }

export const pushBoardTrail = (trail: BoardTrailEntry[], entry: BoardTrailEntry, maximum = 32): BoardTrailEntry[] => {
  const last = trail.at(-1);
  if (last?.boardId === entry.boardId && last.sourceShapeId === entry.sourceShapeId) return trail;
  return [...trail, entry].slice(-maximum);
};

export const readablePaintBackground = (shape: Shape): string | undefined => {
  return paintBackgroundLayers(shape)[0];
};
