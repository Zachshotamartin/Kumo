import { createShapeId, type Shape } from "../classes/shape.js";
import { connectorRenderBounds, routeConnector } from "./advancedFeatures.js";
import { normalizeShape, selectionBounds, shapeBounds } from "./geometry.js";
import { shapePathData } from "./graphics.js";
import { descendantIds } from "./hierarchy.js";
import {
  roundedRectPath,
  strokeDashArray,
  visibleShapeFills,
  visibleShapeStrokes,
  type ShapeFill,
  type ShapeStroke,
} from "./shapePaint.js";
import type { Bounds } from "./types.js";

const escapeXml = (value: unknown) => String(value ?? "")
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;");

const exportable = (shape: Shape) => !shape.hidden && shape.type !== "resource" && shape.type !== "guide";

const svgId = (prefix: string, shape: Shape) => `${prefix}-${shape.id.replace(/[^a-z0-9_-]/gi, "-")}`;

const svgPath = (shape: Shape, origin: { x: number; y: number }) => escapeXml(shapePathData(shape, origin));

const visibleStroke = (shape: Shape) => visibleShapeStrokes(shape).at(-1);

const svgFillId = (shape: Shape, fill: ShapeFill) => svgId(`fill-${fill.id}`, shape);

const svgFillPaint = (shape: Shape, fill: ShapeFill) => {
  if (fill.type === "solid") return escapeXml(fill.color ?? "transparent");
  if (fill.type === "image" ? !fill.imageUrl : !fill.gradientStops?.length) return "transparent";
  return `url(#${svgFillId(shape, fill)})`;
};

const localShapePath = (shape: Shape, width: number, height: number) => shape.type === "ellipse"
  ? `M ${width / 2} 0 A ${width / 2} ${height / 2} 0 1 1 ${width / 2} ${height} A ${width / 2} ${height / 2} 0 1 1 ${width / 2} 0 Z`
  : roundedRectPath(shape, width, height);

const svgPaint = (shape: Shape): string => {
  return shape.fillType && shape.fillType !== "solid" && shape.gradientStops?.length
    ? `url(#${svgId("gradient", shape)})`
    : escapeXml(shape.backgroundColor ?? "transparent");
};

const svgDefinitions = (shapes: Shape[], origin: { x: number; y: number }): string => shapes.map((shape) => {
  const bounds = shapeBounds(shape);
  const x = bounds.x - origin.x;
  const y = bounds.y - origin.y;
  const definitions: string[] = [];
  const fills = visibleShapeFills(shape);
  fills.forEach((fill) => {
    if ((fill.type === "linear-gradient" || fill.type === "radial-gradient") && fill.gradientStops?.length) {
      const stops = [...fill.gradientStops].sort((left, right) => left.position - right.position)
        .map((stop) => `<stop offset="${Math.max(0, Math.min(1, stop.position)) * 100}%" stop-color="${escapeXml(stop.color)}" stop-opacity="${Math.max(0, Math.min(1, stop.opacity * fill.opacity))}"/>`).join("");
      definitions.push(fill.type === "radial-gradient"
        ? `<radialGradient id="${svgFillId(shape, fill)}">${stops}</radialGradient>`
        : `<linearGradient id="${svgFillId(shape, fill)}" gradientTransform="rotate(${fill.gradientAngle ?? 90} .5 .5)">${stops}</linearGradient>`);
    }
    if (fill.type === "image" && fill.imageUrl) {
      definitions.push(`<pattern id="${svgFillId(shape, fill)}" width="1" height="1" patternContentUnits="objectBoundingBox"><image href="${escapeXml(fill.imageUrl)}" width="1" height="1" preserveAspectRatio="xMidYMid slice"/></pattern>`);
    }
  });
  if (!fills.length && shape.fillType && shape.fillType !== "solid" && shape.gradientStops?.length) {
    const stops = [...shape.gradientStops].sort((left, right) => left.position - right.position)
      .map((stop) => `<stop offset="${Math.max(0, Math.min(1, stop.position)) * 100}%" stop-color="${escapeXml(stop.color)}" stop-opacity="${Math.max(0, Math.min(1, stop.opacity))}"/>`).join("");
    definitions.push(shape.fillType === "radial-gradient"
      ? `<radialGradient id="${svgId("gradient", shape)}">${stops}</radialGradient>`
      : `<linearGradient id="${svgId("gradient", shape)}" gradientTransform="rotate(${shape.gradientAngle ?? 90} .5 .5)">${stops}</linearGradient>`);
  }
  if (shape.type === "connector") {
    const marker = (kind: Shape["connectorEndCap"], end: boolean) => kind === "arrow"
      ? `<path d="${end ? "M 0 0 L 10 5 L 0 10 z" : "M 10 0 L 0 5 L 10 10 z"}" fill="context-stroke"/>`
      : kind === "circle" ? '<circle cx="5" cy="5" r="4" fill="context-stroke"/>'
      : '<path d="M 5 0 L 10 5 L 5 10 L 0 5 z" fill="context-stroke"/>';
    if (shape.connectorStartCap && shape.connectorStartCap !== "none") definitions.push(`<marker id="${svgId("start", shape)}" markerWidth="10" markerHeight="10" refX="5" refY="5" orient="auto-start-reverse" markerUnits="strokeWidth">${marker(shape.connectorStartCap, false)}</marker>`);
    if (shape.connectorEndCap && shape.connectorEndCap !== "none") definitions.push(`<marker id="${svgId("end", shape)}" markerWidth="10" markerHeight="10" refX="5" refY="5" orient="auto" markerUnits="strokeWidth">${marker(shape.connectorEndCap, true)}</marker>`);
  }
  if (shape.effects?.some((effect) => effect.visible !== false)) {
    const primitives = shape.effects.filter((effect) => effect.visible !== false).map((effect) => {
      if (effect.type === "layer-blur" || effect.type === "background-blur") {
        return `<feGaussianBlur stdDeviation="${Math.max(0, effect.blur) / 2}"/>`;
      }
      const morphology = effect.spread > 0 ? `<feMorphology operator="dilate" radius="${effect.spread}" result="spread"/>` : "";
      return `${morphology}<feDropShadow dx="${effect.x}" dy="${effect.y}" stdDeviation="${Math.max(0, effect.blur) / 2}" flood-color="${escapeXml(effect.color)}"/>`;
    }).join("");
    definitions.push(`<filter id="${svgId("effect", shape)}" x="-50%" y="-50%" width="200%" height="200%">${primitives}</filter>`);
  }
  const localGeometry = `<path d="${escapeXml(localShapePath(shape, bounds.width, bounds.height))}" transform="translate(${x} ${y})"/>`;
  if (shape.clipContent || shape.backgroundImage) {
    const geometry = ["vector", "boolean"].includes(shape.type)
      ? `<path d="${svgPath(shape, origin)}"/>`
      : localGeometry;
    definitions.push(`<clipPath id="${svgId("clip", shape)}">${geometry}</clipPath>`);
  }
  if (visibleShapeStrokes(shape).some((stroke) => stroke.align !== "center")) {
    const geometry = ["vector", "boolean"].includes(shape.type)
      ? `<path d="${svgPath(shape, origin)}"/>`
      : localGeometry;
    const padding = Math.max(1, ...visibleShapeStrokes(shape).map((stroke) => stroke.width * 2));
    definitions.push(`<clipPath id="${svgId("stroke-clip", shape)}">${geometry}</clipPath>`);
    definitions.push(`<mask id="${svgId("stroke-outside", shape)}" maskUnits="userSpaceOnUse" x="${x - padding}" y="${y - padding}" width="${bounds.width + padding * 2}" height="${bounds.height + padding * 2}"><rect x="${x - padding}" y="${y - padding}" width="${bounds.width + padding * 2}" height="${bounds.height + padding * 2}" fill="white"/>${geometry.replace("/>", ' fill="black"/>')}</mask>`);
  }
  if (shape.isMask) definitions.push(`<mask id="${svgId("mask", shape)}"><path d="${svgPath(shape, origin)}" fill="white"/></mask>`);
  if (shape.type === "boolean" && shape.booleanChildren?.length && shape.booleanOperation === "intersect") {
    definitions.push(...shape.booleanChildren.slice(1).map((child, index) =>
      `<clipPath id="${svgId(`boolean-clip-${index}`, shape)}"><path d="${svgPath(child, origin)}"/></clipPath>`
    ));
  }
  return definitions.join("");
}).join("");

const connectorSvgPath = (shape: Shape, shapes: Shape[], origin: { x: number; y: number }) => {
  const local = routeConnector(shapes, shape).map((point) => ({ x: point.x - origin.x, y: point.y - origin.y }));
  if ((shape.connectorRouting ?? "straight") === "curved" && local.length === 2) {
    const [start, end] = local;
    const bend = Math.max(24, Math.abs(end!.x - start!.x) * 0.42);
    return `M ${start!.x} ${start!.y} C ${start!.x + bend} ${start!.y}, ${end!.x - bend} ${end!.y}, ${end!.x} ${end!.y}`;
  }
  return local.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`).join(" ");
};

const svgMultilineText = (value: string, x: number, y: number, options: {
  color?: string; family?: string; size: number; weight?: string; lineHeight?: number; maxLines: number;
}) => {
  const size = options.size;
  const lines = value.slice(0, 10_000).split("\n").slice(0, options.maxLines);
  return `<text xml:space="preserve" x="${x}" y="${y}" fill="${escapeXml(options.color ?? "#17181a")}" font-family="${escapeXml(options.family ?? "Arial")}" font-size="${size}" font-weight="${escapeXml(options.weight ?? "normal")}">${lines.map((line, index) => `<tspan x="${x}" dy="${index ? size * (options.lineHeight ?? 1.25) : 0}">${escapeXml(line)}</tspan>`).join("")}</text>`;
};

const legacyStroke = (shape: Shape): ShapeStroke | null => {
  const width = Math.max(0, shape.borderWidth ?? (shape.type === "vector" ? 1 : 0));
  if (!width) return null;
  return {
    id: "legacy",
    color: shape.borderColor ?? (shape.type === "vector" ? "#fff" : "transparent"),
    width,
    opacity: 1,
    visible: true,
    style: shape.borderStyle === "dashed" ? "dashed" : shape.borderStyle === "dotted" ? "dotted" : "solid",
    align: "center",
  };
};

const stackedPath = (shape: Shape, path: string, closed: boolean, strokeSuffix = "", fillRule?: "nonzero" | "evenodd"): string => {
  const fills = visibleShapeFills(shape);
  const strokes = visibleShapeStrokes(shape);
  const activeStrokes = strokes.length ? strokes : legacyStroke(shape) ? [legacyStroke(shape)!] : [];
  const fillMarkup = !closed ? "" : fills.length
    ? fills.map((fill) => `<path d="${escapeXml(path)}" fill="${svgFillPaint(shape, fill)}" fill-opacity="${fill.type === "linear-gradient" || fill.type === "radial-gradient" ? 1 : Math.max(0, Math.min(1, fill.opacity))}"${fillRule ? ` fill-rule="${fillRule}"` : ""}${fill.blendMode && fill.blendMode !== "normal" ? ` style="mix-blend-mode:${fill.blendMode}"` : ""}/>`).join("")
    : `<path d="${escapeXml(path)}" fill="${svgPaint(shape)}"${fillRule ? ` fill-rule="${fillRule}"` : ""}/>`;
  const strokeMarkup = activeStrokes.map((stroke) => {
    const aligned = closed ? stroke.align : "center";
    const width = aligned === "center" ? stroke.width : stroke.width * 2;
    const dashArray = stroke.id === "legacy" && shape.strokeDash?.length ? shape.strokeDash.join(" ") : strokeDashArray(stroke);
    const dash = dashArray ? ` stroke-dasharray="${dashArray}"` : "";
    const cap = stroke.style === "dotted" || shape.strokeCap === "round" ? "round" : shape.strokeCap === "square" ? "square" : "butt";
    const alignment = aligned === "inside" ? ` clip-path="url(#${svgId("stroke-clip", shape)})"`
      : aligned === "outside" ? ` mask="url(#${svgId("stroke-outside", shape)})"` : "";
    return `<path d="${escapeXml(path)}" fill="none" stroke="${escapeXml(stroke.color)}" stroke-opacity="${Math.max(0, Math.min(1, stroke.opacity))}" stroke-width="${width}" stroke-linecap="${cap}" stroke-linejoin="${shape.strokeJoin ?? "miter"}"${dash}${alignment}${strokeSuffix}/>`;
  }).join("");
  return `${fillMarkup}${strokeMarkup}`;
};

const svgShape = (shape: Shape, origin: { x: number; y: number }, shapes: Shape[]): string => {
  const bounds = shapeBounds(shape);
  const x = bounds.x - origin.x;
  const y = bounds.y - origin.y;
  const styles = [
    shape.blendMode && shape.blendMode !== "normal" ? `mix-blend-mode:${shape.blendMode}` : "",
    shape.textDecoration && shape.textDecoration !== "none" ? `text-decoration:${shape.textDecoration}` : "",
  ].filter(Boolean).join(";");
  const centerX = x + bounds.width / 2;
  const centerY = y + bounds.height / 2;
  const common = `opacity="${shape.opacity ?? 1}" transform="translate(${centerX} ${centerY}) rotate(${shape.rotation ?? 0}) scale(${shape.flipX ? -1 : 1} ${shape.flipY ? -1 : 1}) translate(${-centerX} ${-centerY})"${styles ? ` style="${escapeXml(styles)}"` : ""}${shape.effects?.some((effect) => effect.visible !== false) ? ` filter="url(#${svgId("effect", shape)})"` : ""}${shape.maskId ? ` mask="url(#mask-${escapeXml(shape.maskId.replace(/[^a-z0-9_-]/gi, "-"))})"` : ""}`;
  const activeStroke = visibleStroke(shape);
  const stroke = escapeXml(activeStroke?.color ?? shape.borderColor ?? "transparent");
  const strokeWidth = Math.max(0, activeStroke?.width ?? shape.borderWidth ?? 0);
  const image = shape.backgroundImage && shape.mediaType !== "video"
    ? `<image href="${escapeXml(shape.backgroundImage)}" x="${x}" y="${y}" width="${bounds.width}" height="${bounds.height}" preserveAspectRatio="xMidYMid slice" clip-path="url(#${svgId("clip", shape)})"/>`
    : "";
  if (shape.type === "ellipse") {
    return `<g ${common}><g transform="translate(${x} ${y})">${stackedPath(shape, localShapePath(shape, bounds.width, bounds.height), true)}</g>${image}</g>`;
  }
  if (shape.type === "text") {
    const lines = escapeXml(shape.text ?? "").split("\n");
    const anchor = shape.textAlign === "center" ? "middle" : shape.textAlign === "right" ? "end" : "start";
    const textX = anchor === "middle" ? x + bounds.width / 2 : anchor === "end" ? x + bounds.width : x;
    return `<text xml:space="preserve" x="${textX}" y="${y + (shape.fontSize ?? 18)}" fill="${escapeXml(shape.color ?? "#000")}" font-family="${escapeXml(shape.fontFamily ?? "Arial")}" font-size="${shape.fontSize ?? 18}" font-weight="${escapeXml(shape.fontWeight ?? "normal")}" letter-spacing="${shape.letterSpacing ?? 0}" text-anchor="${anchor}" ${common}>${lines.map((line, index) => `<tspan x="${textX}" dy="${index ? (shape.fontSize ?? 18) * (shape.lineHeight ?? 1.2) + (shape.paragraphSpacing ?? 0) : 0}">${line}</tspan>`).join("")}</text>`;
  }
  if (shape.type === "vector") {
    return `<g ${common}>${stackedPath(shape, shapePathData(shape, origin), Boolean(shape.vectorClosed))}</g>`;
  }
  if (shape.type === "connector") {
    const startMarker = shape.connectorStartCap && shape.connectorStartCap !== "none" ? ` marker-start="url(#${svgId("start", shape)})"` : "";
    const endMarker = shape.connectorEndCap && shape.connectorEndCap !== "none" ? ` marker-end="url(#${svgId("end", shape)})"` : "";
    return `<g ${common}>${stackedPath(shape, connectorSvgPath(shape, shapes, origin), false, `${startMarker}${endMarker}`)}</g>`;
  }
  const baseRect = `<g transform="translate(${x} ${y})">${stackedPath(shape, localShapePath(shape, bounds.width, bounds.height), true)}</g>`;
  if (shape.type === "sticky") {
    return `<g ${common}>${baseRect}${svgMultilineText(shape.text || "Write an idea", x + 16, y + 28, { color: shape.color, family: shape.fontFamily, size: shape.fontSize ?? 16, weight: shape.fontWeight, lineHeight: shape.lineHeight, maxLines: 12 })}</g>`;
  }
  if (shape.type === "code") {
    const language = svgMultilineText(shape.codeLanguage ?? "plain text", x + 14, y + 18, { color: shape.color ?? "#686b70", family: shape.fontFamily ?? "ui-monospace", size: 10, weight: "600", maxLines: 1 });
    const code = svgMultilineText(shape.text ?? "", x + 14, y + 40, { color: shape.color, family: shape.fontFamily ?? "ui-monospace", size: shape.fontSize ?? 14, lineHeight: shape.lineHeight, maxLines: 30 });
    return `<g ${common}>${baseRect}${language}${code}</g>`;
  }
  if (shape.type === "link") {
    const preview = shape.embedImageUrl ? `<image href="${escapeXml(shape.embedImageUrl)}" x="${x}" y="${y}" width="${Math.min(96, bounds.width)}" height="${bounds.height}" preserveAspectRatio="xMidYMid slice"/>` : "";
    const textX = x + (preview ? Math.min(96, bounds.width) + 12 : 14);
    const title = svgMultilineText(shape.embedTitle || "Link preview", textX, y + 28, { color: shape.color, family: shape.fontFamily, size: 15, weight: "600", maxLines: 1 });
    const description = svgMultilineText(shape.embedDescription || shape.embedUrl || "Paste a link", textX, y + 52, { color: shape.color ?? "#686b70", family: shape.fontFamily, size: 12, maxLines: 3 });
    return `<g ${common}>${baseRect}${preview}${title}${description}</g>`;
  }
  if (shape.type === "table") {
    const cells = shape.tableCells?.length ? shape.tableCells : [[""]];
    const rowCount = Math.min(200, Math.max(1, shape.rows ?? cells.length));
    const columnCount = Math.min(50, Math.max(1, shape.columns ?? Math.max(1, ...cells.map((row) => row.length))));
    const rowHeight = bounds.height / rowCount;
    const columnWidth = bounds.width / columnCount;
    const grid = [
      ...Array.from({ length: rowCount - 1 }, (_, index) => `<line x1="${x}" y1="${y + rowHeight * (index + 1)}" x2="${x + bounds.width}" y2="${y + rowHeight * (index + 1)}" stroke="${stroke}" stroke-width="${Math.max(1, strokeWidth)}"/>`),
      ...Array.from({ length: columnCount - 1 }, (_, index) => `<line x1="${x + columnWidth * (index + 1)}" y1="${y}" x2="${x + columnWidth * (index + 1)}" y2="${y + bounds.height}" stroke="${stroke}" stroke-width="${Math.max(1, strokeWidth)}"/>`),
    ].join("");
    const labels = cells.slice(0, rowCount).flatMap((row, rowIndex) => row.slice(0, columnCount).map((cell, columnIndex) =>
      svgMultilineText(cell, x + columnWidth * columnIndex + 8, y + rowHeight * rowIndex + Math.min(20, rowHeight - 4), { color: shape.color, family: shape.fontFamily, size: Math.min(shape.fontSize ?? 13, Math.max(8, rowHeight - 8)), weight: rowIndex === 0 ? "600" : shape.fontWeight, maxLines: 1 })
    )).join("");
    return `<g ${common}>${baseRect}${grid}${labels}</g>`;
  }
  if (shape.mediaType === "video") {
    const source = shape.embedUrl || shape.backgroundImage || "Video";
    return `<g ${common}>${baseRect}${svgMultilineText("Video", x + 14, y + 26, { color: shape.color, family: shape.fontFamily, size: 14, weight: "600", maxLines: 1 })}${svgMultilineText(source, x + 14, y + 48, { color: shape.color ?? "#686b70", family: shape.fontFamily, size: 11, maxLines: 2 })}</g>`;
  }
  if (shape.type === "boolean" && shape.booleanChildren?.length) {
    const paths = shape.booleanChildren.map((child) => svgPath(child, origin));
    if (shape.booleanOperation === "subtract") {
      return `<g ${common}>${stackedPath(shape, paths.join(" "), true, "", "evenodd")}</g>`;
    }
    if (shape.booleanOperation === "intersect") {
      const clipped = paths.slice(1).reduce(
        (content, _path, index) => `<g clip-path="url(#${svgId(`boolean-clip-${index}`, shape)})">${content}</g>`,
        stackedPath(shape, paths[0]!, true)
      );
      return `<g ${common}>${clipped}</g>`;
    }
    return `<g ${common}>${stackedPath(shape, paths.join(" "), true, "", shape.booleanOperation === "union" ? "nonzero" : "evenodd")}</g>`;
  }
  return `<g ${common}>${baseRect}${image}</g>`;
};

export const serializeSvg = (
  shapes: Shape[],
  selectedIds: readonly string[] = [],
  backgroundColor = "transparent",
  boundsOverride?: Bounds
): string => {
  const candidates = shapes.filter(exportable);
  const selected = new Set(selectedIds);
  descendantIds(candidates, selectedIds).forEach((id) => selected.add(id));
  const selection = selectedIds.length ? candidates.filter((shape) => selected.has(shape.id)) : candidates;
  const maskIds = new Set(selection.flatMap((shape) => shape.maskId ? [shape.maskId] : []));
  const definitions = [
    ...selection,
    ...shapes.filter((shape) => maskIds.has(shape.id) && !selection.some((selectedShape) => selectedShape.id === shape.id)),
  ];
  const directSelection = selectedIds.length
    ? candidates.filter((shape) => selectedIds.includes(shape.id))
    : selection;
  const baseBounds = selectionBounds(directSelection, directSelection.map((shape) => shape.id));
  const connectorBounds = selection.filter((shape) => shape.type === "connector").map((shape) => connectorRenderBounds(candidates, shape));
  const allBounds = [...(baseBounds ? [baseBounds] : []), ...connectorBounds];
  const contentBounds = allBounds.length ? {
    x: Math.min(...allBounds.map((item) => item.x)),
    y: Math.min(...allBounds.map((item) => item.y)),
    width: Math.max(...allBounds.map((item) => item.x + item.width)) - Math.min(...allBounds.map((item) => item.x)),
    height: Math.max(...allBounds.map((item) => item.y + item.height)) - Math.min(...allBounds.map((item) => item.y)),
  } : { x: 0, y: 0, width: 1, height: 1 };
  const bounds = boundsOverride ?? contentBounds;
  const byParent = new Map<string | null, Shape[]>();
  selection.forEach((shape) => {
    const parent = shape.parentId && selection.some((candidate) => candidate.id === shape.parentId) ? shape.parentId : null;
    byParent.set(parent, [...(byParent.get(parent) ?? []), shape]);
  });
  const render = (shape: Shape): string => {
    const children = (byParent.get(shape.id) ?? []).sort((left, right) => left.zIndex - right.zIndex || left.id.localeCompare(right.id));
    const childMarkup = children.map(render).join("");
    const content = `${shape.isMask ? "" : svgShape(shape, bounds, candidates)}${childMarkup}`;
    return shape.clipContent && childMarkup
      ? `<g clip-path="url(#${svgId("clip", shape)})">${shape.isMask ? "" : svgShape(shape, bounds, candidates)}${childMarkup}</g>`
      : content;
  };
  const roots = (byParent.get(null) ?? []).sort((left, right) => left.zIndex - right.zIndex || left.id.localeCompare(right.id));
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.max(1, bounds.width)}" height="${Math.max(1, bounds.height)}" viewBox="0 0 ${Math.max(1, bounds.width)} ${Math.max(1, bounds.height)}"><defs>${svgDefinitions(definitions, bounds)}</defs><rect width="100%" height="100%" fill="${escapeXml(backgroundColor)}"/>${roots.map(render).join("")}</svg>`;
};

export interface KumoDocument {
  format: "kumo-document";
  schemaVersion: 4;
  title: string;
  backgroundColor: string;
  exportedAt: string;
  shapes: Shape[];
}

export const serializeKumoDocument = (title: string, backgroundColor: string, shapes: Shape[]) => JSON.stringify({
  format: "kumo-document",
  schemaVersion: 4,
  title,
  backgroundColor,
  exportedAt: new Date().toISOString(),
  shapes: shapes.filter((shape) => shape.type !== "resource" || shape.resourceKind),
} satisfies KumoDocument, null, 2);

const finite = (value: unknown, fallback = 0) => typeof value === "number" && Number.isFinite(value) ? value : fallback;

export const parseKumoDocument = (source: string, existingIds: readonly string[] = []): KumoDocument => {
  const parsed = JSON.parse(source) as Partial<KumoDocument>;
  if (parsed.format !== "kumo-document" || !Array.isArray(parsed.shapes)) throw new Error("This is not a Kumo document.");
  if (parsed.schemaVersion !== 4) throw new Error(`Kumo document schema ${String(parsed.schemaVersion ?? "unknown")} is not supported.`);
  if (parsed.shapes.length > 10_000) throw new Error("This document contains too many objects.");
  let nestedCount = 0;
  const countNested = (items: unknown[], depth = 0) => {
    if (depth > 32) throw new Error("This document is nested too deeply.");
    nestedCount += items.length;
    if (nestedCount > 20_000) throw new Error("This document contains too many nested objects.");
    items.forEach((item) => {
      if (!item || typeof item !== "object") return;
      const record = item as Record<string, unknown>;
      if (Array.isArray(record.shapes)) countNested(record.shapes, depth + 1);
      if (Array.isArray(record.booleanChildren)) countNested(record.booleanChildren, depth + 1);
    });
  };
  countNested(parsed.shapes);
  const used = new Set(existingIds);
  const idMap = new Map<string, string>();
  const allocatedByObject = new WeakMap<object, string>();
  const allCandidates: Array<{ candidate: Shape; label: string }> = [];
  const collectCandidates = (items: unknown[], path = "") => items.forEach((item, index) => {
    const label = path ? `${path}.${index + 1}` : `${index + 1}`;
    if (!item || typeof item !== "object" || typeof (item as Partial<Shape>).type !== "string") {
      throw new Error(`Object ${label} is invalid.`);
    }
    const candidate = item as Shape;
    allCandidates.push({ candidate, label });
    if (Array.isArray(candidate.shapes)) collectCandidates(candidate.shapes, `${label}.shapes`);
    if (Array.isArray(candidate.booleanChildren)) collectCandidates(candidate.booleanChildren, `${label}.booleanChildren`);
  });
  collectCandidates(parsed.shapes);
  allCandidates.forEach(({ candidate, label }) => {
    const explicitId = typeof candidate.id === "string" && candidate.id ? candidate.id : null;
    const sourceId = explicitId ?? createShapeId();
    if (explicitId && idMap.has(explicitId)) {
      throw new Error(`Object ${label} uses the same id as another object.`);
    }
    let id = sourceId;
    while (used.has(id)) id = createShapeId();
    used.add(id);
    idMap.set(sourceId, id);
    allocatedByObject.set(candidate, id);
  });
  const allocatedIds = parsed.shapes.map((candidate) => allocatedByObject.get(candidate)!);
  const remap = (value: string | null | undefined) => value ? idMap.get(value) : undefined;
  const remapEmbedded = (candidate: Shape): Shape => normalizeShape({
    ...candidate,
    id: allocatedByObject.get(candidate)!,
    parentId: remap(candidate.parentId) ?? null,
    pageId: remap(candidate.pageId) ?? null,
    sectionId: remap(candidate.sectionId) ?? null,
    collectionId: remap(candidate.collectionId) ?? null,
    instanceRootId: remap(candidate.instanceRootId),
    componentNodeId: remap(candidate.componentNodeId),
    instanceOf: remap(candidate.instanceOf),
    componentSetId: remap(candidate.componentSetId),
    fillStyleId: remap(candidate.fillStyleId),
    textStyleId: remap(candidate.textStyleId),
    effectStyleId: remap(candidate.effectStyleId),
    maskId: remap(candidate.maskId),
    variableBindings: candidate.variableBindings
      ? Object.fromEntries(Object.entries(candidate.variableBindings).flatMap(([property, id]) => {
          const mapped = remap(id);
          return mapped ? [[property, mapped]] : [];
        }))
      : undefined,
    shapes: candidate.shapes?.map(remapEmbedded),
    booleanChildren: candidate.booleanChildren?.map(remapEmbedded),
    prototypeInteractions: candidate.prototypeInteractions?.map((interaction) => ({
      ...interaction,
      destinationId: remap(interaction.destinationId),
    })),
  });
  const shapes = parsed.shapes.map((candidate, index) => {
    const x1 = finite(candidate.x1);
    const y1 = finite(candidate.y1);
    const x2 = finite(candidate.x2, x1 + Math.max(1, finite(candidate.width, 1)));
    const y2 = finite(candidate.y2, y1 + Math.max(1, finite(candidate.height, 1)));
    return normalizeShape({
      ...candidate,
      id: allocatedIds[index]!,
      x1, y1, x2, y2,
      level: finite(candidate.level),
      zIndex: finite(candidate.zIndex, index + 1),
      parentId: remap(candidate.parentId) ?? null,
      pageId: remap(candidate.pageId) ?? null,
      sectionId: remap(candidate.sectionId) ?? null,
      collectionId: remap(candidate.collectionId) ?? null,
      instanceRootId: remap(candidate.instanceRootId),
      componentNodeId: remap(candidate.componentNodeId),
      instanceOf: remap(candidate.instanceOf),
      componentSetId: remap(candidate.componentSetId),
      fillStyleId: remap(candidate.fillStyleId),
      textStyleId: remap(candidate.textStyleId),
      effectStyleId: remap(candidate.effectStyleId),
      maskId: remap(candidate.maskId),
      variableBindings: candidate.variableBindings
        ? Object.fromEntries(Object.entries(candidate.variableBindings).flatMap(([property, id]) => {
            const mapped = remap(id);
            return mapped ? [[property, mapped]] : [];
          }))
        : undefined,
      shapes: candidate.shapes?.map(remapEmbedded),
      booleanChildren: candidate.booleanChildren?.map(remapEmbedded),
      prototypeInteractions: candidate.prototypeInteractions?.map((interaction) => ({
        ...interaction,
        destinationId: remap(interaction.destinationId),
      })),
    });
  });
  return {
    format: "kumo-document",
    schemaVersion: 4,
    title: typeof parsed.title === "string" ? parsed.title.slice(0, 200) : "Imported board",
    backgroundColor: typeof parsed.backgroundColor === "string" ? parsed.backgroundColor : "#252629",
    exportedAt: typeof parsed.exportedAt === "string" ? parsed.exportedAt : new Date().toISOString(),
    shapes,
  };
};

const concatBytes = (chunks: Uint8Array[]) => {
  const result = new Uint8Array(chunks.reduce((size, chunk) => size + chunk.length, 0));
  let offset = 0;
  chunks.forEach((chunk) => {
    result.set(chunk, offset);
    offset += chunk.length;
  });
  return result;
};

const encode = (value: string) => new TextEncoder().encode(value);

const blobDataUrl = async (blob: Blob): Promise<string> => {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  return `data:${blob.type || "application/octet-stream"};base64,${btoa(binary)}`;
};

export const embedSvgImages = async (
  svg: string,
  fetcher: typeof fetch = fetch
): Promise<string> => {
  if (!/<image\b/i.test(svg)) return svg;
  const document = new DOMParser().parseFromString(svg, "image/svg+xml");
  const images = [...document.querySelectorAll("image")];
  await Promise.all(images.map(async (image) => {
    const href = image.getAttribute("href") ?? image.getAttribute("xlink:href");
    if (!href || href.startsWith("data:") || href.startsWith("blob:")) return;
    const response = await fetcher(href);
    if (!response.ok) throw new Error(`An exported image could not be loaded (${response.status}).`);
    image.setAttribute("href", await blobDataUrl(await response.blob()));
    image.removeAttribute("xlink:href");
  }));
  return new XMLSerializer().serializeToString(document.documentElement);
};

export const serializeSvgWithAssets = async (
  shapes: Shape[],
  selectedIds: readonly string[] = [],
  backgroundColor = "transparent"
) => embedSvgImages(serializeSvg(shapes, selectedIds, backgroundColor));

const loadSvgImage = async (svg: string) => {
  const image = new Image();
  const source = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
  try {
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("The canvas could not be rasterized."));
      image.src = source;
    });
    return image;
  } finally {
    URL.revokeObjectURL(source);
  }
};

const svgToJpeg = async (svg: string, width: number, height: number): Promise<Uint8Array> => {
  const image = await loadSvgImage(await embedSvgImages(svg));
  const scale = 2;
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas export is unavailable.");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.scale(scale, scale);
  context.drawImage(image, 0, 0, width, height);
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(
    (value) => value ? resolve(value) : reject(new Error("PDF rasterization failed.")),
    "image/jpeg",
    0.94
  ));
  return new Uint8Array(await blob.arrayBuffer());
};

type PdfRasterizer = (svg: string, width: number, height: number) => Promise<Uint8Array>;

/** Creates a visually faithful raster-backed PDF with one page per top-level frame. */
export const serializePdf = async (
  shapes: Shape[],
  backgroundColor = "#ffffff",
  rasterize: PdfRasterizer = svgToJpeg
): Promise<Uint8Array> => {
  const frames = shapes.filter((shape) => exportable(shape) && shape.type === "frame" && !shape.parentId);
  const wholeBounds = selectionBounds(shapes.filter(exportable), shapes.filter(exportable).map((shape) => shape.id))
    ?? { x: 0, y: 0, width: 800, height: 600 };
  const pages = frames.length
    ? frames.map((frame) => {
        const bounds = shapeBounds(frame);
        return {
          bounds,
          svg: serializeSvg(shapes, [frame.id], frame.backgroundColor ?? backgroundColor, bounds),
        };
      })
    : [{ bounds: wholeBounds, svg: serializeSvg(shapes, [], backgroundColor) }];
  const images = await Promise.all(pages.map((page) => rasterize(
    page.svg,
    Math.max(1, page.bounds.width),
    Math.max(1, page.bounds.height)
  )));
  const pageObjectIds = pages.map((_, index) => 5 + index * 3);
  const objects: Uint8Array[] = [
    encode("<< /Type /Catalog /Pages 2 0 R >>"),
    encode(`<< /Type /Pages /Count ${pages.length} /Kids [${pageObjectIds.map((id) => `${id} 0 R`).join(" ")}] >>`),
  ];
  pages.forEach((page, index) => {
    const image = images[index]!;
    const imageId = 3 + index * 3;
    const contentId = imageId + 1;
    const width = Math.max(1, page.bounds.width);
    const height = Math.max(1, page.bounds.height);
    objects.push(concatBytes([
      encode(`<< /Type /XObject /Subtype /Image /Width ${Math.max(1, Math.round(width * 2))} /Height ${Math.max(1, Math.round(height * 2))} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${image.length} >>\nstream\n`),
      image,
      encode("\nendstream"),
    ]));
    const drawing = `q ${width} 0 0 ${height} 0 0 cm /Im0 Do Q`;
    objects.push(encode(`<< /Length ${drawing.length} >>\nstream\n${drawing}\nendstream`));
    objects.push(encode(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${width} ${height}] /Resources << /XObject << /Im0 ${imageId} 0 R >> >> /Contents ${contentId} 0 R >>`));
  });

  const chunks: Uint8Array[] = [encode("%PDF-1.4\n%\u00e2\u00e3\u00cf\u00d3\n")];
  const offsets = [0];
  let length = chunks[0]!.length;
  objects.forEach((object, index) => {
    offsets.push(length);
    const chunk = concatBytes([encode(`${index + 1} 0 obj\n`), object, encode("\nendobj\n")]);
    chunks.push(chunk);
    length += chunk.length;
  });
  const xref = length;
  chunks.push(encode(`xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n `).join("\n")}\ntrailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`));
  return concatBytes(chunks);
};

export const downloadBlob = (blob: Blob, name: string) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
};

export const svgToPng = async (svg: string, scale = 2): Promise<Blob> => {
  const image = await loadSvgImage(await embedSvgImages(svg));
  try {
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, image.naturalWidth * scale);
    canvas.height = Math.max(1, image.naturalHeight * scale);
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas export is unavailable.");
    context.scale(scale, scale);
    context.drawImage(image, 0, 0);
    return await new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("PNG export failed.")), "image/png"));
  } finally { /* loadSvgImage revokes its temporary URL. */ }
};
