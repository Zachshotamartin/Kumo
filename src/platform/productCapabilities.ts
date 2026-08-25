import { createShapeId, type Shape } from "../classes/shape";
import { normalizeShape } from "../editor/geometry";

export interface BoardGraphNode {
  id: string;
  title: string;
  visibility: "private" | "public";
  accessible: boolean;
  manageable: boolean;
}

export interface BoardGraphEdge {
  sourceId: string;
  targetId: string;
}

export interface BoardGraph {
  nodes: BoardGraphNode[];
  edges: BoardGraphEdge[];
  incoming: BoardGraphEdge[];
  broken: BoardGraphEdge[];
}

export const analyzeBoardGraph = (
  sourceId: string,
  nodes: BoardGraphNode[],
  edges: BoardGraphEdge[]
): BoardGraph => {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const unique = new Map<string, BoardGraphEdge>();
  edges.forEach((edge) => unique.set(`${edge.sourceId}:${edge.targetId}`, edge));
  const normalizedEdges = [...unique.values()];
  return {
    nodes,
    edges: normalizedEdges,
    incoming: normalizedEdges.filter((edge) => edge.targetId === sourceId),
    broken: normalizedEdges.filter((edge) => !byId.get(edge.targetId)?.accessible),
  };
};

export const dependencyImpact = (boardId: string, graph: BoardGraph) => ({
  incomingBoardIds: [...new Set(graph.edges.filter((edge) => edge.targetId === boardId).map((edge) => edge.sourceId))],
  outgoingBoardIds: [...new Set(graph.edges.filter((edge) => edge.sourceId === boardId).map((edge) => edge.targetId))],
  brokenAfterDelete: graph.edges.filter((edge) => edge.targetId === boardId).length,
});

export type TextRun = NonNullable<Shape["textRuns"]>[number];

const textRunSignature = (run: Omit<TextRun, "id" | "start" | "end">) => JSON.stringify(run);

export const normalizeTextRuns = (text: string, runs: TextRun[]): TextRun[] => {
  const ordered = runs
    .map((run) => ({ ...run, start: Math.max(0, Math.min(text.length, run.start)), end: Math.max(0, Math.min(text.length, run.end)) }))
    .filter((run) => run.end > run.start)
    .sort((left, right) => left.start - right.start || left.end - right.end);
  const result: TextRun[] = [];
  ordered.forEach((run) => {
    const previous = result.at(-1);
    const start = previous ? Math.max(previous.end, run.start) : run.start;
    if (run.end <= start) return;
    const next = { ...run, start };
    if (previous && previous.end === next.start && textRunSignature(previous) === textRunSignature(next)) {
      previous.end = next.end;
    } else {
      result.push(next);
    }
  });
  return result;
};

export const applyTextRun = (
  shape: Shape,
  start: number,
  end: number,
  style: Omit<TextRun, "id" | "start" | "end">
): Shape => {
  const text = shape.text ?? "";
  const selectionStart = Math.max(0, Math.min(text.length, Math.min(start, end)));
  const selectionEnd = Math.max(0, Math.min(text.length, Math.max(start, end)));
  if (selectionStart === selectionEnd) return shape;
  const preserved = (shape.textRuns ?? []).flatMap((run) => {
    if (run.end <= selectionStart || run.start >= selectionEnd) return [run];
    return [
      ...(run.start < selectionStart ? [{ ...run, end: selectionStart }] : []),
      ...(run.end > selectionEnd ? [{ ...run, start: selectionEnd }] : []),
    ];
  });
  return { ...shape, textRuns: normalizeTextRuns(text, [...preserved, { id: createShapeId(), start: selectionStart, end: selectionEnd, ...style }]) };
};

export const replaceTextAndRemapRuns = (shape: Shape, text: string): Shape => ({
  ...shape,
  text,
  textRuns: normalizeTextRuns(text, shape.textRuns ?? []),
});

export const textSegments = (shape: Shape): Array<{ text: string; style: Omit<TextRun, "id" | "start" | "end"> }> => {
  const text = shape.text ?? "";
  const runs = normalizeTextRuns(text, shape.textRuns ?? []);
  const boundaries = [...new Set([0, text.length, ...runs.flatMap((run) => [run.start, run.end])])].sort((left, right) => left - right);
  return boundaries.slice(0, -1).map((start, index) => {
    const end = boundaries[index + 1] ?? text.length;
    const run = runs.find((candidate) => candidate.start <= start && candidate.end >= end);
    if (!run) return { text: text.slice(start, end), style: {} };
    const style = Object.fromEntries(Object.entries(run).filter(([key]) => !["id", "start", "end"].includes(key))) as Omit<TextRun, "id" | "start" | "end">;
    return { text: text.slice(start, end), style };
  });
};

export type VariableValue = string | number | boolean;

export interface VariableMode {
  id: string;
  name: string;
}

export const createVariableCollection = (shapes: Shape[], name: string, modes: string[] = ["Default"]) => {
  const id = createShapeId();
  const normalizedModes = modes.map((mode) => ({ id: createShapeId(), name: mode.trim() || "Mode" }));
  const resource: Shape = normalizeShape({
    ...createBaseResource(shapes, "variable-collection", name),
    id,
    resourceValue: Object.fromEntries(normalizedModes.map((mode) => [mode.id, mode.name])),
  });
  return { shapes: [...shapes, resource], collectionId: id, resource };
};

const createBaseResource = (shapes: Shape[], kind: NonNullable<Shape["resourceKind"]>, name: string): Shape => ({
  id: createShapeId(), type: "resource", name, resourceName: name.trim() || "Untitled resource", resourceKind: kind,
  x1: 0, y1: 0, x2: 0, y2: 0, width: 0, height: 0, level: 0,
  zIndex: Math.max(0, ...shapes.map((shape) => shape.zIndex)) + 1, hidden: true,
});

export const createModeVariable = (
  shapes: Shape[],
  kind: "color-variable" | "number-variable" | "string-variable" | "boolean-variable" | "timing-variable" | "easing-variable",
  name: string,
  collectionId: string,
  values: Record<string, VariableValue>,
  group = ""
) => {
  const variable = normalizeShape({
    ...createBaseResource(shapes, kind, name),
    resourceValue: { value: Object.values(values)[0] ?? "" },
    variableCollectionId: collectionId,
    variableModeValues: values,
    variableGroup: group,
  });
  return { shapes: [...shapes, variable], variableId: variable.id };
};

const resolveVariableValue = (
  variable: Shape,
  resources: Map<string, Shape>,
  modes: Record<string, string>,
  visiting = new Set<string>()
): VariableValue | undefined => {
  if (visiting.has(variable.id)) return undefined;
  visiting.add(variable.id);
  if (variable.variableAliasId) {
    const alias = resources.get(variable.variableAliasId);
    if (alias) return resolveVariableValue(alias, resources, modes, visiting);
  }
  const mode = variable.variableCollectionId ? modes[variable.variableCollectionId] : undefined;
  return (mode ? variable.variableModeValues?.[mode] : undefined)
    ?? variable.resourceValue?.value;
};

export const resolveVariableModes = (shapes: Shape[], activeModes: Record<string, string>): Shape[] => {
  const resources = new Map(shapes.filter((shape) => shape.type === "resource").map((shape) => [shape.id, shape]));
  return shapes.map((shape) => {
    if (!shape.variableBindings) return shape;
    const next = { ...shape } as Record<string, unknown>;
    Object.entries(shape.variableBindings).forEach(([property, id]) => {
      const variable = resources.get(id);
      const value = variable ? resolveVariableValue(variable, resources, activeModes) : undefined;
      if (value !== undefined) next[property] = value;
    });
    return normalizeShape(next as unknown as Shape);
  });
};

export type ComponentProperty = NonNullable<Shape["componentProperties"]>[string];

export const defineComponentProperty = (shape: Shape, key: string, property: ComponentProperty): Shape => ({
  ...shape,
  componentProperties: { ...(shape.componentProperties ?? {}), [key]: property },
});

export const applyComponentProperties = (shapes: Shape[], instanceId: string, values: Record<string, string | boolean>): Shape[] => {
  const root = shapes.find((shape) => shape.id === instanceId && shape.instanceOf);
  const definition = root ? shapes.find((shape) => shape.id === root.instanceOf) : undefined;
  if (!root || !definition?.componentProperties) return shapes;
  const nextValues = { ...(root.instanceProperties ?? {}), ...values };
  return shapes.map((shape) => {
    if (shape.id === root.id) return { ...shape, instanceProperties: nextValues };
    if (shape.instanceRootId !== root.id || !shape.componentNodeId) return shape;
    let next = shape;
    Object.entries(definition.componentProperties ?? {}).forEach(([key, property]) => {
      if (property.targetNodeId !== shape.componentNodeId || !(key in nextValues)) return;
      const value = nextValues[key];
      if (property.type === "text") next = { ...next, text: String(value) };
      if (property.type === "boolean") next = { ...next, hidden: !(value === true || value === "true") };
      if (property.type === "instance-swap") next = { ...next, instanceOf: String(value) };
      if (property.type === "slot") next = { ...next, [property.targetField ?? "text"]: String(value) };
    });
    return next;
  });
};

export interface LibraryAssetDiff {
  sourceId: string;
  status: "added" | "changed" | "removed" | "unchanged";
  before?: Shape;
  after?: Shape;
}

const comparableLibraryShape = (shape: Shape) => {
  const comparable: Partial<Shape> = { ...shape };
  delete comparable.id;
  delete comparable.zIndex;
  delete comparable.libraryId;
  delete comparable.libraryVersion;
  return comparable;
};

export const publishableLibraryAssets = (shapes: Shape[]) => {
  const componentRoots = new Set(shapes.filter((shape) => shape.componentDefinition).map((shape) => shape.id));
  const included = new Set(shapes.filter((shape) => shape.type === "resource").map((shape) => shape.id));
  const includeChildren = (parentId: string) => shapes.filter((shape) => shape.parentId === parentId).forEach((shape) => {
    included.add(shape.id);
    includeChildren(shape.id);
  });
  componentRoots.forEach((id) => { included.add(id); includeChildren(id); });
  return shapes.filter((shape) => included.has(shape.id)).map((shape) => ({ ...shape, librarySourceId: shape.librarySourceId ?? shape.id }));
};

export const diffLibraryAssets = (current: Shape[], incoming: Shape[]): LibraryAssetDiff[] => {
  const before = new Map(current.map((shape) => [shape.librarySourceId ?? shape.id, shape]));
  const after = new Map(incoming.map((shape) => [shape.librarySourceId ?? shape.id, shape]));
  return [...new Set([...before.keys(), ...after.keys()])].map((sourceId) => {
    const left = before.get(sourceId);
    const right = after.get(sourceId);
    const status = !left ? "added" : !right ? "removed"
      : JSON.stringify(comparableLibraryShape(left)) === JSON.stringify(comparableLibraryShape(right)) ? "unchanged" : "changed";
    return { sourceId, status, before: left, after: right };
  });
};

export const applyLibraryUpdate = (document: Shape[], incoming: Shape[], libraryId: string, version: number): Shape[] => {
  const importedBySource = new Map(document.filter((shape) => shape.libraryId === libraryId).map((shape) => [shape.librarySourceId ?? shape.id, shape]));
  const incomingSources = new Set(incoming.map((shape) => shape.librarySourceId ?? shape.id));
  const retained = document.filter((shape) => shape.libraryId !== libraryId || incomingSources.has(shape.librarySourceId ?? shape.id));
  const idMap = new Map(incoming.map((shape) => {
    const sourceId = shape.librarySourceId ?? shape.id;
    return [shape.id, importedBySource.get(sourceId)?.id ?? createShapeId()];
  }));
  const updatedSources = new Set<string>();
  const updates = incoming.map((shape) => {
    const sourceId = shape.librarySourceId ?? shape.id;
    updatedSources.add(sourceId);
    const existing = importedBySource.get(sourceId);
    return normalizeShape({
      ...shape,
      id: existing?.id ?? idMap.get(shape.id)!,
      parentId: shape.parentId ? idMap.get(shape.parentId) ?? shape.parentId : shape.parentId,
      libraryId,
      libraryVersion: version,
      librarySourceId: sourceId,
      zIndex: existing?.zIndex ?? Math.max(0, ...retained.map((candidate) => candidate.zIndex)) + updatedSources.size,
    });
  });
  const bySource = new Map(updates.map((shape) => [shape.librarySourceId!, shape]));
  return [...retained.filter((shape) => shape.libraryId !== libraryId), ...retained.filter((shape) => shape.libraryId === libraryId).map((shape) => bySource.get(shape.librarySourceId ?? shape.id) ?? shape), ...updates.filter((shape) => !importedBySource.has(shape.librarySourceId!))];
};

export interface VectorNetworkIssue { type: "missing-point" | "short-path" | "duplicate-edge"; pathId: string; detail: string }

export const validateVectorNetwork = (shape: Shape): VectorNetworkIssue[] => {
  const points = new Set((shape.vectorPoints ?? []).map((point) => point.id));
  const edges = new Set<string>();
  return (shape.vectorPaths ?? []).flatMap((path) => {
    const issues: VectorNetworkIssue[] = [];
    if (path.pointIds.length < 2) issues.push({ type: "short-path", pathId: path.id, detail: "A path needs at least two points." });
    path.pointIds.forEach((pointId) => {
      if (!points.has(pointId)) issues.push({ type: "missing-point", pathId: path.id, detail: `Point ${pointId} is missing.` });
    });
    path.pointIds.slice(1).forEach((pointId, index) => {
      const pair = [path.pointIds[index], pointId].sort().join(":");
      if (edges.has(pair)) issues.push({ type: "duplicate-edge", pathId: path.id, detail: `Edge ${pair} is duplicated.` });
      edges.add(pair);
    });
    return issues;
  });
};

export const splitVectorPath = (shape: Shape, pathId: string, pointId: string): Shape => {
  const path = shape.vectorPaths?.find((candidate) => candidate.id === pathId);
  const index = path?.pointIds.indexOf(pointId) ?? -1;
  if (!path || index <= 0 || index >= path.pointIds.length - 1) return shape;
  return {
    ...shape,
    vectorPaths: [
      ...(shape.vectorPaths ?? []).filter((candidate) => candidate.id !== pathId),
      { ...path, id: createShapeId(), pointIds: path.pointIds.slice(0, index + 1), closed: false },
      { ...path, id: createShapeId(), pointIds: path.pointIds.slice(index), closed: false },
    ],
  };
};

export const branchVectorPath = (shape: Shape, pointId: string, endpoint: { x: number; y: number }): Shape => {
  if (!shape.vectorPoints?.some((point) => point.id === pointId)) return shape;
  const endpointId = createShapeId();
  return normalizeShape({
    ...shape,
    vectorPoints: [...shape.vectorPoints, { id: endpointId, ...endpoint }],
    vectorPaths: [...(shape.vectorPaths ?? []), { id: createShapeId(), pointIds: [pointId, endpointId], closed: false }],
  });
};

export const prototypeConditionMatches = (
  condition: NonNullable<NonNullable<Shape["prototypeInteractions"]>[number]["condition"]> | undefined,
  values: Record<string, VariableValue>
) => {
  if (!condition) return true;
  const actual = values[condition.variableId];
  if (condition.operator === "truthy") return Boolean(actual);
  if (condition.operator === "equals") return actual === condition.value;
  if (condition.operator === "not-equals") return actual !== condition.value;
  if (condition.operator === "greater") return typeof actual === "number" && typeof condition.value === "number" && actual > condition.value;
  return typeof actual === "number" && typeof condition.value === "number" && actual < condition.value;
};

export interface AccessibilityFinding {
  shapeId: string;
  severity: "error" | "warning";
  rule: "image-alt" | "link-name" | "contrast" | "focus-order" | "touch-target";
  message: string;
}

const parseHex = (value: string) => {
  const normalized = value.replace("#", "");
  if (!/^[0-9a-f]{6}$/i.test(normalized)) return null;
  return [0, 2, 4].map((index) => Number.parseInt(normalized.slice(index, index + 2), 16) / 255);
};

const luminance = (value: string) => {
  const rgb = parseHex(value);
  if (!rgb) return null;
  const channels = rgb.map((channel) => channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
  return (channels[0] ?? 0) * 0.2126 + (channels[1] ?? 0) * 0.7152 + (channels[2] ?? 0) * 0.0722;
};

export const contrastRatio = (foreground: string, background: string) => {
  const first = luminance(foreground);
  const second = luminance(background);
  if (first === null || second === null) return null;
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
};

export const auditAccessibility = (shapes: Shape[]): AccessibilityFinding[] => shapes.flatMap((shape) => {
  const findings: AccessibilityFinding[] = [];
  if ((shape.type === "image" || shape.semanticRole === "image") && !shape.altText?.trim()) {
    findings.push({ shapeId: shape.id, severity: "error", rule: "image-alt", message: "Images need alternative text." });
  }
  if ((shape.semanticRole === "button" || shape.semanticRole === "link") && !(shape.text ?? shape.name)?.trim()) {
    findings.push({ shapeId: shape.id, severity: "error", rule: "link-name", message: "Interactive layers need an accessible name." });
  }
  if (shape.type === "text" && shape.color && shape.backgroundColor) {
    const ratio = contrastRatio(shape.color, shape.backgroundColor);
    if (ratio !== null && ratio < (shape.fontSize ?? 18 >= 24 ? 3 : 4.5)) findings.push({ shapeId: shape.id, severity: "error", rule: "contrast", message: `Text contrast is ${ratio.toFixed(2)}:1.` });
  }
  if (shape.focusOrder !== undefined && shape.focusOrder < 1) findings.push({ shapeId: shape.id, severity: "warning", rule: "focus-order", message: "Focus order must be a positive number." });
  if ((shape.semanticRole === "button" || shape.semanticRole === "link") && (shape.width < 44 || shape.height < 44)) findings.push({ shapeId: shape.id, severity: "warning", rule: "touch-target", message: "Interactive targets should be at least 44×44." });
  return findings;
});

export const accessibilityFixPatch = (shape: Shape, rule: AccessibilityFinding["rule"]): Partial<Shape> => {
  if (rule === "image-alt") return { altText: shape.name?.trim() || "Describe this image" };
  if (rule === "link-name") return shape.type === "text" ? { text: shape.name?.trim() || "Accessible label" } : { name: shape.name?.trim() || "Accessible control" };
  if (rule === "focus-order") return { focusOrder: 1 };
  if (rule === "touch-target") return { width: Math.max(44, shape.width), height: Math.max(44, shape.height), x2: shape.x1 + Math.max(44, shape.width), y2: shape.y1 + Math.max(44, shape.height) };
  if (rule === "contrast") {
    const background = shape.backgroundColor ?? "#ffffff";
    const black = contrastRatio("#111111", background) ?? 0;
    const white = contrastRatio("#ffffff", background) ?? 0;
    return { color: black >= white ? "#111111" : "#ffffff" };
  }
  return {};
};

export const applyAccessibilityFixes = (shapes: Shape[], findings: AccessibilityFinding[]) => {
  const rules = new Map<string, AccessibilityFinding["rule"][]>();
  findings.forEach((finding) => rules.set(finding.shapeId, [...(rules.get(finding.shapeId) ?? []), finding.rule]));
  return shapes.map((shape) => (rules.get(shape.id) ?? []).reduce((current, rule) => ({ ...current, ...accessibilityFixPatch(current, rule) }), shape));
};

export interface DocumentPerformanceReport {
  shapeCount: number;
  renderedShapeCount: number;
  imageCount: number;
  effectCount: number;
  vectorPointCount: number;
  estimatedComplexity: number;
  level: "healthy" | "watch" | "heavy";
}

export const shapeIntersectsViewport = (shape: Shape, viewport: { x: number; y: number; width: number; height: number }, margin = 400) => {
  const left = Math.min(shape.x1, shape.x2);
  const top = Math.min(shape.y1, shape.y2);
  const right = Math.max(shape.x1, shape.x2);
  const bottom = Math.max(shape.y1, shape.y2);
  return right >= viewport.x - margin && left <= viewport.x + viewport.width + margin && bottom >= viewport.y - margin && top <= viewport.y + viewport.height + margin;
};

export const cullDocumentShapes = (shapes: Shape[], viewport: { x: number; y: number; width: number; height: number }, selectedIds: string[] = []) => {
  const keep = new Set(selectedIds);
  shapes.forEach((shape) => {
    if (shapeIntersectsViewport(shape, viewport) || shape.type === "guide" || shape.type === "page-resource" || shape.type === "resource") {
      keep.add(shape.id);
      let parentId = shape.parentId;
      while (parentId) {
        keep.add(parentId);
        parentId = shapes.find((candidate) => candidate.id === parentId)?.parentId ?? null;
      }
    }
  });
  return shapes.filter((shape) => keep.has(shape.id));
};

export const analyzeDocumentPerformance = (shapes: Shape[], viewport?: { x: number; y: number; width: number; height: number }): DocumentPerformanceReport => {
  const rendered = viewport ? cullDocumentShapes(shapes, viewport) : shapes;
  const imageCount = shapes.filter((shape) => shape.type === "image").length;
  const effectCount = shapes.reduce((count, shape) => count + (shape.effects?.length ?? 0) + (shape.imageFilters?.blur ? 1 : 0), 0);
  const vectorPointCount = shapes.reduce((count, shape) => count + (shape.vectorPoints?.length ?? 0), 0);
  const estimatedComplexity = shapes.length + imageCount * 8 + effectCount * 5 + Math.ceil(vectorPointCount / 10);
  return { shapeCount: shapes.length, renderedShapeCount: rendered.length, imageCount, effectCount, vectorPointCount, estimatedComplexity, level: estimatedComplexity > 5000 ? "heavy" : estimatedComplexity > 1500 ? "watch" : "healthy" };
};

export interface DocumentSearchResult {
  shapeId: string;
  pageId: string | null;
  kind: "layer" | "text" | "resource" | "annotation" | "link";
  label: string;
  match: string;
}

export const searchDocument = (shapes: Shape[], query: string): DocumentSearchResult[] => {
  const normalized = query.trim().toLocaleLowerCase();
  if (!normalized) return [];
  return shapes.flatMap((shape) => {
    const candidates: Array<[DocumentSearchResult["kind"], string | undefined]> = [
      [shape.type === "resource" ? "resource" : "layer", shape.name],
      ["text", shape.text], ["resource", shape.resourceName], ["annotation", shape.devAnnotation],
      ["link", shape.type === "board" ? shape.title ?? undefined : undefined],
    ];
    return candidates.filter(([, value]) => value?.toLocaleLowerCase().includes(normalized)).map(([kind, value]) => ({
      shapeId: shape.id, pageId: shape.pageId ?? null, kind, label: shape.name ?? shape.resourceName ?? shape.type, match: value!,
    }));
  });
};

export const replaceDocumentText = (shapes: Shape[], query: string, replacement: string) => {
  if (!query) return shapes;
  return shapes.map((shape) => shape.text?.includes(query)
    ? replaceTextAndRemapRuns(shape, shape.text.split(query).join(replacement))
    : shape);
};

export interface ExtensionManifest {
  id: string;
  name: string;
  permissions: Array<"read-document" | "write-document">;
  commands: Array<{ id: string; name: string; operation: "rename-selected" | "set-fill" | "create-rectangle" }>;
}

export const validateExtensionManifest = (manifest: ExtensionManifest) => {
  if (!/^[a-z0-9][a-z0-9.-]+$/i.test(manifest.id)) throw new Error("Extension IDs must use letters, numbers, dots, or dashes.");
  if (!manifest.name.trim() || !manifest.commands.length) throw new Error("Extensions need a name and at least one command.");
  if (new Set(manifest.commands.map((command) => command.id)).size !== manifest.commands.length) throw new Error("Extension command IDs must be unique.");
  return manifest;
};

export const runExtensionCommand = (
  shapes: Shape[],
  selectedIds: string[],
  manifest: ExtensionManifest,
  commandId: string,
  input: string
) => {
  validateExtensionManifest(manifest);
  const command = manifest.commands.find((candidate) => candidate.id === commandId);
  if (!command) throw new Error("Extension command not found.");
  if (!manifest.permissions.includes("write-document")) throw new Error("This extension cannot edit the document.");
  if (command.operation === "rename-selected") return shapes.map((shape) => selectedIds.includes(shape.id) ? { ...shape, name: input.trim().slice(0, 120) || shape.name } : shape);
  if (command.operation === "set-fill") return shapes.map((shape) => selectedIds.includes(shape.id) ? { ...shape, backgroundColor: /^#[0-9a-f]{6}$/i.test(input) ? input : shape.backgroundColor } : shape);
  const base = createBaseResource(shapes, "fill-style", "extension-placeholder");
  const rectangle = normalizeShape({ ...base, id: createShapeId(), type: "rectangle", name: input.trim() || "Extension rectangle", hidden: false, x1: 80, y1: 80, x2: 240, y2: 180, width: 160, height: 100, backgroundColor: "#b87a2e", resourceKind: undefined, resourceName: undefined });
  return [...shapes, rectangle];
};

export const mediaFilterCss = (shape: Shape) => {
  const filters = shape.imageFilters;
  if (!filters) return "none";
  return `brightness(${filters.brightness}) contrast(${filters.contrast}) saturate(${filters.saturation}) blur(${filters.blur}px)`;
};

export const mediaCropCss = (shape: Shape) => {
  if (shape.imageFit !== "crop" || !shape.imageCrop) return null;
  const crop = {
    x: Math.max(0, Math.min(1, shape.imageCrop.x)),
    y: Math.max(0, Math.min(1, shape.imageCrop.y)),
    width: Math.max(0.05, Math.min(1, shape.imageCrop.width)),
    height: Math.max(0.05, Math.min(1, shape.imageCrop.height)),
  };
  return {
    backgroundSize: `${100 / crop.width}% ${100 / crop.height}%`,
    backgroundPosition: `${crop.x >= 1 ? 100 : crop.x * 100}% ${crop.y >= 1 ? 100 : crop.y * 100}%`,
  };
};

export const fontVariationCss = (axes?: Record<string, number>) => axes && Object.keys(axes).length
  ? Object.entries(axes).sort(([left], [right]) => left.localeCompare(right)).map(([tag, value]) => `"${tag.slice(0, 4)}" ${value}`).join(", ")
  : undefined;

export const fontFeatureCss = (features?: Record<string, boolean>) => features && Object.keys(features).length
  ? Object.entries(features).sort(([left], [right]) => left.localeCompare(right)).map(([tag, enabled]) => `"${tag.slice(0, 4)}" ${enabled ? 1 : 0}`).join(", ")
  : undefined;
