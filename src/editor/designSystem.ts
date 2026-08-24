import { createShapeId, type Shape } from "../classes/shape";
import { frameShapes, patchShapes } from "./commands";
import { descendantIds, rootSelectionIds } from "./hierarchy";
import { boundsToEdges, normalizeShape, shapeBounds } from "./geometry";
import type { Point } from "./types";

export type SharedStyleKind = "fill-style" | "text-style" | "effect-style";
export type VariableKind = "color-variable" | "number-variable" | "string-variable" | "boolean-variable" | "timing-variable" | "easing-variable";

const SYNC_FIELDS: Array<keyof Shape> = [
  "type", "name", "width", "height", "rotation", "flipX", "flipY", "clipContent",
  "borderRadius", "borderWidth", "borderStyle", "borderColor", "backgroundColor",
  "backgroundImage", "assetId", "color", "opacity", "text", "fontSize", "fontFamily",
  "fontWeight", "textAlign", "alignItems", "textDecoration", "lineHeight", "letterSpacing",
  "textRuns", "fontAxes", "openTypeFeatures", "componentProperties", "instanceProperties",
  "textAutoResize", "paragraphSpacing", "textIndent", "textCase", "listStyle", "layoutMode",
  "layoutWrap", "layoutGap", "layoutCounterGap", "paddingTop", "paddingRight", "paddingBottom",
  "paddingLeft", "primaryAlign", "counterAlign", "horizontalSizing", "verticalSizing",
  "constraintHorizontal", "constraintVertical", "layoutPositioning", "layoutGrow", "layoutAlign",
  "fillStyleId", "textStyleId", "effectStyleId", "variableBindings",
  "vectorPoints", "vectorPaths", "vectorClosed", "strokeCap", "strokeJoin", "strokeAlign", "strokeDash", "booleanOperation", "booleanChildren", "maskId", "isMask",
  "fillType", "gradientAngle", "gradientStops", "effects", "blendMode",
  "imageFit", "imageCrop", "imageFilters", "mediaType", "altText", "semanticRole", "focusOrder",
  "devStatus", "devAnnotation", "codeComponentUrl",
  "prototypeStart", "prototypeOverflow", "prototypeInteractions",
];

const resourceNode = (
  kind: SharedStyleKind | VariableKind,
  name: string,
  value: Record<string, string | number | boolean>,
  zIndex: number
): Shape => normalizeShape({
  id: createShapeId(),
  type: "resource",
  name,
  resourceName: name,
  resourceKind: kind,
  resourceValue: value,
  x1: 0,
  y1: 0,
  x2: 0,
  y2: 0,
  width: 0,
  height: 0,
  level: 0,
  zIndex,
  hidden: true,
  locked: true,
});

export const documentResources = (shapes: Shape[]) => shapes.filter((shape) => shape.type === "resource" && shape.resourceKind);
export const componentDefinitions = (shapes: Shape[]) => shapes.filter((shape) => shape.componentDefinition);

export const createComponent = (
  shapes: Shape[],
  selectedIds: readonly string[],
  name = "Component"
): { shapes: Shape[]; componentId: string | null } => {
  const roots = rootSelectionIds(shapes, selectedIds);
  if (!roots.length) return { shapes, componentId: null };
  let document = shapes;
  let rootId = roots[0]!;
  if (roots.length > 1) {
    const framed = frameShapes(shapes, roots);
    document = framed.shapes;
    if (!framed.frameId) return { shapes, componentId: null };
    rootId = framed.frameId;
  }
  return {
    componentId: rootId,
    shapes: document.map((shape) => shape.id === rootId
      ? normalizeShape({ ...shape, componentDefinition: true, componentName: name, name })
      : shape),
  };
};

export const createVariantSet = (
  shapes: Shape[],
  selectedIds: readonly string[],
  propertyName = "State"
): { shapes: Shape[]; componentSetId: string | null } => {
  const selected = shapes.filter((shape) => selectedIds.includes(shape.id) && shape.componentDefinition);
  if (selected.length < 2) return { shapes, componentSetId: null };
  const componentSetId = createShapeId();
  const selectedSet = new Set(selected.map((shape) => shape.id));
  return {
    componentSetId,
    shapes: shapes.map((shape, index) => selectedSet.has(shape.id) ? {
      ...shape,
      componentSetId,
      variantProperties: { ...(shape.variantProperties ?? {}), [propertyName]: shape.componentName ?? `Variant ${index + 1}` },
    } : shape),
  };
};

const sourceTree = (shapes: Shape[], componentId: string) => {
  const ids = new Set([componentId, ...descendantIds(shapes, [componentId])]);
  return shapes.filter((shape) => ids.has(shape.id)).sort((left, right) => left.zIndex - right.zIndex);
};

const translateVectorData = (shape: Shape, offset: Point): Pick<Shape, "vectorPoints" | "booleanChildren"> => ({
  ...(shape.vectorPoints
    ? {
        vectorPoints: shape.vectorPoints.map((point) => ({
          ...point,
          x: point.x + offset.x,
          y: point.y + offset.y,
          ...(point.handleIn ? { handleIn: { x: point.handleIn.x + offset.x, y: point.handleIn.y + offset.y } } : {}),
          ...(point.handleOut ? { handleOut: { x: point.handleOut.x + offset.x, y: point.handleOut.y + offset.y } } : {}),
        })),
      }
    : {}),
  ...(shape.booleanChildren
    ? { booleanChildren: shape.booleanChildren.map((child) => normalizeShape({
        ...child,
        x1: child.x1 + offset.x,
        x2: child.x2 + offset.x,
        y1: child.y1 + offset.y,
        y2: child.y2 + offset.y,
        ...translateVectorData(child, offset),
      })) }
    : {}),
});

const componentNodePaths = (shapes: Shape[], componentId: string): Map<string, Shape> => {
  const result = new Map<string, Shape>();
  const visit = (id: string, path: string) => {
    const node = shapes.find((shape) => shape.id === id);
    if (!node) return;
    result.set(path, node);
    shapes
      .filter((shape) => shape.parentId === id)
      .sort((left, right) => left.zIndex - right.zIndex || left.id.localeCompare(right.id))
      .forEach((child, index) => visit(child.id, `${path}/${child.type}:${child.name ?? ""}:${index}`));
  };
  visit(componentId, "root");
  return result;
};

export const instantiateComponent = (
  shapes: Shape[],
  componentId: string,
  point?: Point
): { shapes: Shape[]; instanceId: string | null } => {
  const component = shapes.find((shape) => shape.id === componentId && shape.componentDefinition);
  if (!component) return { shapes, instanceId: null };
  const source = sourceTree(shapes, componentId);
  const idMap = new Map(source.map((shape) => [shape.id, createShapeId()]));
  const instanceId = idMap.get(componentId)!;
  const componentBounds = shapeBounds(component);
  const offset = point
    ? { x: point.x - componentBounds.x, y: point.y - componentBounds.y }
    : { x: componentBounds.width + 48, y: 0 };
  const highestZ = Math.max(0, ...shapes.map((shape) => shape.zIndex));
  const clones = source.map((shape, index) => normalizeShape({
    ...shape,
    id: idMap.get(shape.id)!,
    name: shape.id === componentId ? `${component.componentName ?? component.name ?? "Component"} instance` : shape.name,
    parentId: shape.id === componentId ? component.parentId ?? null : shape.parentId ? idMap.get(shape.parentId) ?? null : null,
    x1: shape.x1 + offset.x,
    x2: shape.x2 + offset.x,
    y1: shape.y1 + offset.y,
    y2: shape.y2 + offset.y,
    ...translateVectorData(shape, offset),
    zIndex: highestZ + index + 1,
    componentDefinition: false,
    componentNodeId: shape.id,
    instanceRootId: instanceId,
    instanceOf: shape.id === componentId ? componentId : undefined,
    overriddenFields: [],
    maskId: shape.maskId ? idMap.get(shape.maskId) ?? shape.maskId : undefined,
    sectionId: shape.sectionId ? idMap.get(shape.sectionId) ?? shape.sectionId : shape.sectionId,
    prototypeInteractions: shape.prototypeInteractions?.map((interaction) => ({
      ...interaction,
      destinationId: interaction.destinationId ? idMap.get(interaction.destinationId) ?? interaction.destinationId : undefined,
    })),
  }));
  return { shapes: [...shapes, ...clones], instanceId };
};

export const patchInstanceAware = (
  shapes: Shape[],
  selectedIds: readonly string[],
  patch: Partial<Shape>
): Shape[] => {
  const patched = patchShapes(shapes, selectedIds, patch);
  const fields = Object.keys(patch);
  return patched.map((shape, index) => {
    if (shape === shapes[index] || (!shape.instanceRootId && !shape.instanceOf)) return shape;
    return { ...shape, overriddenFields: [...new Set([...(shape.overriddenFields ?? []), ...fields])] };
  });
};

export const synchronizeComponentInstances = (shapes: Shape[]): Shape[] => {
  const byId = new Map(shapes.map((shape) => [shape.id, shape]));
  const instanceRoots = shapes.filter((shape) => shape.instanceOf && shape.instanceRootId === shape.id);
  const updates = new Map<string, Shape>();
  const additions: Shape[] = [];
  const removals = new Set<string>();
  instanceRoots.forEach((root) => {
    const definition = byId.get(root.instanceOf!);
    if (!definition?.componentDefinition) return;
    const definitionBounds = shapeBounds(definition);
    const rootBounds = shapeBounds(root);
    const source = sourceTree(shapes, definition.id);
    const sourceIds = new Set(source.map((shape) => shape.id));
    const instanceNodes = shapes.filter((shape) => shape.instanceRootId === root.id);
    const instanceBaseZ = Math.min(...instanceNodes.map((shape) => shape.zIndex));
    const instanceBySource = new Map(instanceNodes
      .filter((shape) => shape.componentNodeId)
      .map((shape) => [shape.componentNodeId!, shape]));
    const idMap = new Map(source.map((sourceNode) => [
      sourceNode.id,
      sourceNode.id === definition.id ? root.id : instanceBySource.get(sourceNode.id)?.id ?? createShapeId(),
    ]));
    instanceNodes.forEach((node) => {
      if (!node.componentNodeId || !sourceIds.has(node.componentNodeId)) removals.add(node.id);
    });
    source.forEach((sourceNode, sourceIndex) => {
      const instanceNode = sourceNode.id === definition.id ? root : instanceBySource.get(sourceNode.id);
      const overrides = new Set(instanceNode?.overriddenFields ?? []);
      const offset = { x: rootBounds.x - definitionBounds.x, y: rootBounds.y - definitionBounds.y };
      const next: Shape = instanceNode ? { ...instanceNode } : normalizeShape({
        ...sourceNode,
        id: idMap.get(sourceNode.id)!,
        x1: sourceNode.x1 + offset.x,
        x2: sourceNode.x2 + offset.x,
        y1: sourceNode.y1 + offset.y,
        y2: sourceNode.y2 + offset.y,
        ...translateVectorData(sourceNode, offset),
        level: sourceNode.level,
        zIndex: instanceBaseZ + sourceIndex,
        pageId: root.pageId,
        overriddenFields: [],
      });
      SYNC_FIELDS.forEach((field) => {
        if (!overrides.has(field as string)) (next as unknown as Record<string, unknown>)[field] = sourceNode[field];
      });
      next.zIndex = instanceBaseZ + sourceIndex;
      const sourceBounds = shapeBounds(sourceNode);
      if (sourceNode.id === definition.id) {
        const nextWidth = overrides.has("width") ? rootBounds.width : sourceBounds.width;
        const nextHeight = overrides.has("height") ? rootBounds.height : sourceBounds.height;
        Object.assign(next, boundsToEdges({ x: rootBounds.x, y: rootBounds.y, width: nextWidth, height: nextHeight }));
      } else {
        Object.assign(next, boundsToEdges({
          x: rootBounds.x + sourceBounds.x - definitionBounds.x,
          y: rootBounds.y + sourceBounds.y - definitionBounds.y,
          width: sourceBounds.width,
          height: sourceBounds.height,
        }));
      }
      const translatedVectorData = translateVectorData(sourceNode, offset);
      if (!overrides.has("vectorPoints") && translatedVectorData.vectorPoints) next.vectorPoints = translatedVectorData.vectorPoints;
      if (!overrides.has("booleanChildren") && translatedVectorData.booleanChildren) next.booleanChildren = translatedVectorData.booleanChildren;
      next.id = idMap.get(sourceNode.id)!;
      next.parentId = sourceNode.id === definition.id
        ? root.parentId ?? null
        : sourceNode.parentId ? idMap.get(sourceNode.parentId) ?? null : null;
      next.componentDefinition = false;
      next.componentNodeId = sourceNode.id;
      next.instanceRootId = root.id;
      next.instanceOf = sourceNode.id === definition.id ? definition.id : undefined;
      next.maskId = sourceNode.maskId ? idMap.get(sourceNode.maskId) ?? sourceNode.maskId : undefined;
      next.sectionId = sourceNode.sectionId ? idMap.get(sourceNode.sectionId) ?? sourceNode.sectionId : sourceNode.sectionId;
      next.prototypeInteractions = sourceNode.prototypeInteractions?.map((interaction) => ({
        ...interaction,
        destinationId: interaction.destinationId
          ? idMap.get(interaction.destinationId) ?? interaction.destinationId
          : undefined,
      }));
      const normalized = normalizeShape(next);
      if (instanceNode) updates.set(instanceNode.id, normalized);
      else additions.push(normalized);
    });
  });
  return [...shapes.filter((shape) => !removals.has(shape.id)).map((shape) => updates.get(shape.id) ?? shape), ...additions];
};

export const detachInstance = (shapes: Shape[], instanceId: string): Shape[] => shapes.map((shape) =>
  shape.instanceRootId === instanceId
    ? { ...shape, instanceOf: undefined, instanceRootId: undefined, componentNodeId: undefined, overriddenFields: undefined }
    : shape);

export const resetInstance = (shapes: Shape[], instanceId: string): Shape[] => synchronizeComponentInstances(
  shapes.map((shape) => shape.instanceRootId === instanceId ? { ...shape, overriddenFields: [] } : shape)
);

export const swapInstanceVariant = (shapes: Shape[], instanceId: string, componentId: string): Shape[] => {
  const root = shapes.find((shape) => shape.id === instanceId && shape.instanceOf);
  const target = shapes.find((shape) => shape.id === componentId && shape.componentDefinition);
  const current = root ? shapes.find((shape) => shape.id === root.instanceOf) : undefined;
  if (!root || !target || !current?.componentSetId || current.componentSetId !== target.componentSetId) return shapes;
  const currentPaths = componentNodePaths(shapes, current.id);
  const targetPaths = componentNodePaths(shapes, target.id);
  const remap = new Map<string, string>();
  currentPaths.forEach((source, path) => {
    const destination = targetPaths.get(path);
    if (destination) remap.set(source.id, destination.id);
  });
  return synchronizeComponentInstances(shapes.map((shape) => {
    if (shape.id === instanceId) return { ...shape, instanceOf: componentId, componentNodeId: componentId, overriddenFields: [] };
    if (shape.instanceRootId !== instanceId || !shape.componentNodeId) return shape;
    const destination = remap.get(shape.componentNodeId);
    return destination ? { ...shape, componentNodeId: destination } : shape;
  }));
};

export const createSharedStyle = (
  shapes: Shape[],
  source: Shape,
  kind: SharedStyleKind,
  name: string
): { shapes: Shape[]; styleId: string } => {
  const values: Record<string, string | number> = kind === "fill-style"
    ? { backgroundColor: source.backgroundColor ?? "transparent", opacity: source.opacity ?? 1 }
    : kind === "text-style"
      ? {
          color: source.color ?? "#ffffff", fontSize: source.fontSize ?? 18,
          fontFamily: source.fontFamily ?? "Arial", fontWeight: source.fontWeight ?? "normal",
          lineHeight: source.lineHeight ?? 1.2, letterSpacing: source.letterSpacing ?? 0,
        }
      : { borderColor: source.borderColor ?? "transparent", borderWidth: source.borderWidth ?? 0, borderRadius: source.borderRadius ?? 0 };
  const node = resourceNode(kind, name, values, Math.max(0, ...shapes.map((shape) => shape.zIndex)) + 1);
  return { shapes: [...shapes, node], styleId: node.id };
};

export const applySharedStyle = (shapes: Shape[], selectedIds: readonly string[], styleId: string): Shape[] => {
  const resource = shapes.find((shape) => shape.id === styleId && shape.resourceValue);
  if (!resource?.resourceKind || !resource.resourceValue) return shapes;
  const binding = resource.resourceKind === "fill-style" ? { fillStyleId: styleId }
    : resource.resourceKind === "text-style" ? { textStyleId: styleId }
      : { effectStyleId: styleId };
  return patchInstanceAware(shapes, selectedIds, { ...resource.resourceValue, ...binding } as Partial<Shape>);
};

export const createVariable = (
  shapes: Shape[],
  kind: VariableKind,
  name: string,
  value: string | number | boolean
): { shapes: Shape[]; variableId: string } => {
  const node = resourceNode(kind, name, { value }, Math.max(0, ...shapes.map((shape) => shape.zIndex)) + 1);
  return { shapes: [...shapes, node], variableId: node.id };
};

export const bindVariable = (
  shapes: Shape[],
  selectedIds: readonly string[],
  property: "backgroundColor" | "color" | "opacity" | "borderRadius",
  variableId: string
): Shape[] => {
  const variable = shapes.find((shape) => shape.id === variableId && shape.resourceValue);
  if (!variable?.resourceValue) return shapes;
  const value = variable.resourceValue.value;
  if ((property === "opacity" || property === "borderRadius") && typeof value !== "number") return shapes;
  if ((property === "backgroundColor" || property === "color") && typeof value !== "string") return shapes;
  const selected = new Set(selectedIds);
  return shapes.map((shape) => selected.has(shape.id) ? normalizeShape({
    ...shape,
    [property]: value,
    variableBindings: { ...(shape.variableBindings ?? {}), [property]: variableId },
  }) : shape);
};

export const resolveVariables = (shapes: Shape[]): Shape[] => {
  const resources = new Map(shapes.filter((shape) => shape.resourceValue).map((shape) => [shape.id, shape.resourceValue!.value]));
  return shapes.map((shape) => {
    if (!shape.variableBindings) return shape;
    const next = { ...shape } as Record<string, unknown>;
    Object.entries(shape.variableBindings).forEach(([property, id]) => {
      if (resources.has(id)) next[property] = resources.get(id);
    });
    return normalizeShape(next as unknown as Shape);
  });
};
