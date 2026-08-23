import { createShapeId, type Shape } from "../classes/shape";
import { normalizeShape, selectionBounds, shapeBounds } from "./geometry";
import { descendantIds } from "./hierarchy";

const escapeXml = (value: unknown) => String(value ?? "")
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;");

const exportable = (shape: Shape) => !shape.hidden && shape.type !== "resource" && shape.type !== "guide";

const svgShape = (shape: Shape, origin: { x: number; y: number }): string => {
  const bounds = shapeBounds(shape);
  const x = bounds.x - origin.x;
  const y = bounds.y - origin.y;
  const common = `opacity="${shape.opacity ?? 1}" transform="rotate(${shape.rotation ?? 0} ${x + bounds.width / 2} ${y + bounds.height / 2})"`;
  const fill = escapeXml(shape.backgroundColor ?? "transparent");
  const stroke = escapeXml(shape.borderColor ?? "transparent");
  const strokeWidth = Math.max(0, shape.borderWidth ?? 0);
  if (shape.type === "ellipse") {
    return `<ellipse cx="${x + bounds.width / 2}" cy="${y + bounds.height / 2}" rx="${bounds.width / 2}" ry="${bounds.height / 2}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" ${common}/>`;
  }
  if (shape.type === "text") {
    const lines = escapeXml(shape.text ?? "").split("\n");
    return `<text x="${x}" y="${y + (shape.fontSize ?? 18)}" fill="${escapeXml(shape.color ?? "#000")}" font-family="${escapeXml(shape.fontFamily ?? "Arial")}" font-size="${shape.fontSize ?? 18}" font-weight="${escapeXml(shape.fontWeight ?? "normal")}" letter-spacing="${shape.letterSpacing ?? 0}" ${common}>${lines.map((line, index) => `<tspan x="${x}" dy="${index ? (shape.fontSize ?? 18) * (shape.lineHeight ?? 1.2) : 0}">${line}</tspan>`).join("")}</text>`;
  }
  const image = shape.backgroundImage
    ? `<image href="${escapeXml(shape.backgroundImage)}" x="${x}" y="${y}" width="${bounds.width}" height="${bounds.height}" preserveAspectRatio="xMidYMid slice"/>`
    : "";
  return `<g ${common}><rect x="${x}" y="${y}" width="${bounds.width}" height="${bounds.height}" rx="${shape.borderRadius ?? 0}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}"/>${image}</g>`;
};

export const serializeSvg = (
  shapes: Shape[],
  selectedIds: readonly string[] = [],
  backgroundColor = "transparent"
): string => {
  const candidates = shapes.filter(exportable);
  const selected = new Set(selectedIds);
  descendantIds(candidates, selectedIds).forEach((id) => selected.add(id));
  const selection = selectedIds.length ? candidates.filter((shape) => selected.has(shape.id)) : candidates;
  const bounds = selectionBounds(selection, selection.map((shape) => shape.id)) ?? { x: 0, y: 0, width: 1, height: 1 };
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.max(1, bounds.width)}" height="${Math.max(1, bounds.height)}" viewBox="0 0 ${Math.max(1, bounds.width)} ${Math.max(1, bounds.height)}"><rect width="100%" height="100%" fill="${escapeXml(backgroundColor)}"/>${selection.sort((left, right) => left.zIndex - right.zIndex).map((shape) => svgShape(shape, bounds)).join("")}</svg>`;
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
  if (parsed.shapes.length > 10_000) throw new Error("This document contains too many objects.");
  const used = new Set(existingIds);
  const idMap = new Map<string, string>();
  parsed.shapes.forEach((candidate) => {
    const sourceId = typeof candidate?.id === "string" && candidate.id ? candidate.id : createShapeId();
    let id = sourceId;
    while (used.has(id)) id = createShapeId();
    used.add(id);
    idMap.set(sourceId, id);
  });
  const shapes = parsed.shapes.map((candidate, index) => {
    if (!candidate || typeof candidate !== "object" || typeof candidate.type !== "string") throw new Error(`Object ${index + 1} is invalid.`);
    const sourceId = typeof candidate.id === "string" ? candidate.id : "";
    const x1 = finite(candidate.x1);
    const y1 = finite(candidate.y1);
    const x2 = finite(candidate.x2, x1 + Math.max(1, finite(candidate.width, 1)));
    const y2 = finite(candidate.y2, y1 + Math.max(1, finite(candidate.height, 1)));
    return normalizeShape({
      ...candidate,
      id: idMap.get(sourceId) ?? createShapeId(),
      x1, y1, x2, y2,
      level: finite(candidate.level),
      zIndex: finite(candidate.zIndex, index + 1),
      parentId: candidate.parentId ? idMap.get(candidate.parentId) ?? null : null,
      instanceRootId: candidate.instanceRootId ? idMap.get(candidate.instanceRootId) : undefined,
      componentNodeId: candidate.componentNodeId ? idMap.get(candidate.componentNodeId) ?? candidate.componentNodeId : undefined,
      instanceOf: candidate.instanceOf ? idMap.get(candidate.instanceOf) ?? candidate.instanceOf : undefined,
      prototypeInteractions: candidate.prototypeInteractions?.map((interaction) => ({
        ...interaction,
        destinationId: interaction.destinationId ? idMap.get(interaction.destinationId) ?? interaction.destinationId : undefined,
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

const pdfEscape = (value: string) => value.replaceAll("\\", "\\\\").replaceAll("(", "\\(").replaceAll(")", "\\)").replace(/[^\x20-\x7e]/g, "?");

/** Creates a small, dependency-free vector PDF with one page per top-level frame. */
export const serializePdf = (shapes: Shape[]): Uint8Array => {
  const frames = shapes.filter((shape) => exportable(shape) && shape.type === "frame" && !shape.parentId);
  const pages = frames.length ? frames : [normalizeShape({ id: "page", type: "frame", x1: 0, y1: 0, x2: 800, y2: 600, width: 800, height: 600, level: 0, zIndex: 0 })];
  const objects: string[] = [];
  const pageObjectIds: number[] = [];
  objects.push("<< /Type /Catalog /Pages 2 0 R >>");
  objects.push("");
  objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  pages.forEach((frame) => {
    const bounds = shapeBounds(frame);
    const nested = new Set(descendantIds(shapes, [frame.id]));
    const content = shapes.filter(exportable).filter((shape) => shape.id !== frame.id && (nested.has(shape.id) || (!frames.length && !shape.parentId))).map((shape) => {
      const item = shapeBounds(shape);
      const x = item.x - bounds.x;
      const y = bounds.height - (item.y - bounds.y) - item.height;
      if (shape.type === "text") return `BT /F1 ${shape.fontSize ?? 18} Tf ${x} ${y + item.height - (shape.fontSize ?? 18)} Td (${pdfEscape(shape.text ?? "")}) Tj ET`;
      return `${x} ${y} ${item.width} ${item.height} re S`;
    }).join("\n");
    const streamId = objects.length + 1;
    objects.push(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
    const pageId = objects.length + 1;
    pageObjectIds.push(pageId);
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${Math.max(1, bounds.width)} ${Math.max(1, bounds.height)}] /Resources << /Font << /F1 3 0 R >> >> /Contents ${streamId} 0 R >>`);
  });
  objects[1] = `<< /Type /Pages /Count ${pageObjectIds.length} /Kids [${pageObjectIds.map((id) => `${id} 0 R`).join(" ")}] >>`;
  let body = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(body.length);
    body += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = body.length;
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n `).join("\n")}\ntrailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new TextEncoder().encode(body);
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
  const image = new Image();
  const source = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
  try {
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("The canvas could not be rasterized."));
      image.src = source;
    });
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, image.naturalWidth * scale);
    canvas.height = Math.max(1, image.naturalHeight * scale);
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas export is unavailable.");
    context.scale(scale, scale);
    context.drawImage(image, 0, 0);
    return await new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("PNG export failed.")), "image/png"));
  } finally {
    URL.revokeObjectURL(source);
  }
};
