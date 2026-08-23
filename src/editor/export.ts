import { createShapeId, type Shape } from "../classes/shape";
import { normalizeShape, selectionBounds, shapeBounds } from "./geometry";
import { shapePathData } from "./graphics";
import { descendantIds } from "./hierarchy";
import type { Bounds } from "./types";

const escapeXml = (value: unknown) => String(value ?? "")
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;");

const exportable = (shape: Shape) => !shape.hidden && shape.type !== "resource" && shape.type !== "guide";

const svgId = (prefix: string, shape: Shape) => `${prefix}-${shape.id.replace(/[^a-z0-9_-]/gi, "-")}`;

const svgPath = (shape: Shape, origin: { x: number; y: number }) => escapeXml(shapePathData(shape, origin));

const svgPaint = (shape: Shape): string => shape.fillType && shape.fillType !== "solid" && shape.gradientStops?.length
  ? `url(#${svgId("gradient", shape)})`
  : escapeXml(shape.backgroundColor ?? "transparent");

const svgDefinitions = (shapes: Shape[], origin: { x: number; y: number }): string => shapes.map((shape) => {
  const bounds = shapeBounds(shape);
  const x = bounds.x - origin.x;
  const y = bounds.y - origin.y;
  const definitions: string[] = [];
  if (shape.fillType && shape.fillType !== "solid" && shape.gradientStops?.length) {
    const stops = [...shape.gradientStops].sort((left, right) => left.position - right.position)
      .map((stop) => `<stop offset="${Math.max(0, Math.min(1, stop.position)) * 100}%" stop-color="${escapeXml(stop.color)}" stop-opacity="${Math.max(0, Math.min(1, stop.opacity))}"/>`).join("");
    definitions.push(shape.fillType === "radial-gradient"
      ? `<radialGradient id="${svgId("gradient", shape)}">${stops}</radialGradient>`
      : `<linearGradient id="${svgId("gradient", shape)}" gradientTransform="rotate(${shape.gradientAngle ?? 90} .5 .5)">${stops}</linearGradient>`);
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
  if (shape.clipContent || shape.backgroundImage) {
    const geometry = shape.type === "ellipse"
      ? `<ellipse cx="${x + bounds.width / 2}" cy="${y + bounds.height / 2}" rx="${bounds.width / 2}" ry="${bounds.height / 2}"/>`
      : `<rect x="${x}" y="${y}" width="${bounds.width}" height="${bounds.height}" rx="${shape.borderRadius ?? 0}"/>`;
    definitions.push(`<clipPath id="${svgId("clip", shape)}">${geometry}</clipPath>`);
  }
  if (shape.isMask) definitions.push(`<mask id="${svgId("mask", shape)}"><path d="${svgPath(shape, origin)}" fill="white"/></mask>`);
  if (shape.type === "boolean" && shape.booleanChildren?.length && shape.booleanOperation === "intersect") {
    definitions.push(...shape.booleanChildren.slice(1).map((child, index) =>
      `<clipPath id="${svgId(`boolean-clip-${index}`, shape)}"><path d="${svgPath(child, origin)}"/></clipPath>`
    ));
  }
  if (shape.type === "boolean" && shape.booleanChildren?.length && shape.booleanOperation === "subtract") {
    definitions.push(`<mask id="${svgId("boolean-subtract", shape)}"><rect width="100%" height="100%" fill="black"/><path d="${svgPath(shape.booleanChildren[0]!, origin)}" fill="white"/>${shape.booleanChildren.slice(1).map((child) => `<path d="${svgPath(child, origin)}" fill="black"/>`).join("")}</mask>`);
  }
  return definitions.join("");
}).join("");

const svgShape = (shape: Shape, origin: { x: number; y: number }): string => {
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
  const fill = svgPaint(shape);
  const stroke = escapeXml(shape.borderColor ?? "transparent");
  const strokeWidth = Math.max(0, shape.borderWidth ?? 0);
  const dash = shape.borderStyle === "dashed" ? ` stroke-dasharray="${strokeWidth * 4} ${strokeWidth * 2}"`
    : shape.borderStyle === "dotted" ? ` stroke-dasharray="${strokeWidth} ${strokeWidth * 2}" stroke-linecap="round"` : "";
  const image = shape.backgroundImage
    ? `<image href="${escapeXml(shape.backgroundImage)}" x="${x}" y="${y}" width="${bounds.width}" height="${bounds.height}" preserveAspectRatio="xMidYMid slice" clip-path="url(#${svgId("clip", shape)})"/>`
    : "";
  if (shape.type === "ellipse") {
    return `<g ${common}><ellipse cx="${x + bounds.width / 2}" cy="${y + bounds.height / 2}" rx="${bounds.width / 2}" ry="${bounds.height / 2}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}"${dash}/>${image}</g>`;
  }
  if (shape.type === "text") {
    const lines = escapeXml(shape.text ?? "").split("\n");
    const anchor = shape.textAlign === "center" ? "middle" : shape.textAlign === "right" ? "end" : "start";
    const textX = anchor === "middle" ? x + bounds.width / 2 : anchor === "end" ? x + bounds.width : x;
    return `<text xml:space="preserve" x="${textX}" y="${y + (shape.fontSize ?? 18)}" fill="${escapeXml(shape.color ?? "#000")}" font-family="${escapeXml(shape.fontFamily ?? "Arial")}" font-size="${shape.fontSize ?? 18}" font-weight="${escapeXml(shape.fontWeight ?? "normal")}" letter-spacing="${shape.letterSpacing ?? 0}" text-anchor="${anchor}" ${common}>${lines.map((line, index) => `<tspan x="${textX}" dy="${index ? (shape.fontSize ?? 18) * (shape.lineHeight ?? 1.2) + (shape.paragraphSpacing ?? 0) : 0}">${line}</tspan>`).join("")}</text>`;
  }
  if (shape.type === "vector") {
    return `<path d="${svgPath(shape, origin)}" fill="${shape.vectorClosed ? fill : "none"}" stroke="${stroke}" stroke-width="${strokeWidth}"${dash} ${common}/>`;
  }
  if (shape.type === "boolean" && shape.booleanChildren?.length) {
    const paths = shape.booleanChildren.map((child) => svgPath(child, origin));
    if (shape.booleanOperation === "subtract") {
      return `<rect x="${x}" y="${y}" width="${bounds.width}" height="${bounds.height}" fill="${fill}" mask="url(#${svgId("boolean-subtract", shape)})" ${common}/>`;
    }
    if (shape.booleanOperation === "intersect") {
      const clipped = paths.slice(1).reduce(
        (content, _path, index) => `<g clip-path="url(#${svgId(`boolean-clip-${index}`, shape)})">${content}</g>`,
        `<path d="${paths[0]}" fill="${fill}"/>`
      );
      return `<g ${common}>${clipped}</g>`;
    }
    return `<path d="${paths.join(" ")}" fill="${fill}" fill-rule="${shape.booleanOperation === "union" ? "nonzero" : "evenodd"}" stroke="${stroke}" stroke-width="${strokeWidth}"${dash} ${common}/>`;
  }
  return `<g ${common}><rect x="${x}" y="${y}" width="${bounds.width}" height="${bounds.height}" rx="${shape.borderRadius ?? 0}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}"${dash}/>${image}</g>`;
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
  const bounds = boundsOverride
    ?? selectionBounds(directSelection, directSelection.map((shape) => shape.id))
    ?? { x: 0, y: 0, width: 1, height: 1 };
  const byParent = new Map<string | null, Shape[]>();
  selection.forEach((shape) => {
    const parent = shape.parentId && selection.some((candidate) => candidate.id === shape.parentId) ? shape.parentId : null;
    byParent.set(parent, [...(byParent.get(parent) ?? []), shape]);
  });
  const render = (shape: Shape): string => {
    const children = (byParent.get(shape.id) ?? []).sort((left, right) => left.zIndex - right.zIndex || left.id.localeCompare(right.id));
    const childMarkup = children.map(render).join("");
    const content = `${shape.isMask ? "" : svgShape(shape, bounds)}${childMarkup}`;
    return shape.clipContent && childMarkup
      ? `<g clip-path="url(#${svgId("clip", shape)})">${shape.isMask ? "" : svgShape(shape, bounds)}${childMarkup}</g>`
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
