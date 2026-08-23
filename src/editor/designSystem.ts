import { createShapeId, type Shape } from "../classes/shape";
import { frameShapes, patchShapes } from "./commands";
import { descendantIds, rootSelectionIds } from "./hierarchy";
import { boundsToEdges, normalizeShape, shapeBounds } from "./geometry";
import type { Point } from "./types";

export type SharedStyleKind = "fill-style" | "text-style" | "effect-style";
export type VariableKind = "color-variable" | "number-variable" | "string-variable";

const SYNC_FIELDS: Array<keyof Shape> = [
  "type", "name", "width", "height", "rotation", "flipX", "flipY", "clipContent",
  "borderRadius", "borderWidth", "borderStyle", "borderColor", "backgroundColor",
  "backgroundImage", "assetId", "color", "opacity", "text", "fontSize", "fontFamily",
  "fontWeight", "textAlign", "alignItems", "textDecoration", "lineHeight", "letterSpacing",
  "textAutoResize", "paragraphSpacing", "textIndent", "textCase", "listStyle", "layoutMode",
  "layoutWrap", "layoutGap", "layoutCounterGap", "paddingTop", "paddingRight", "paddingBottom",
  "paddingLeft", "primaryAlign", "counterAlign", "horizontalSizing", "verticalSizing",
  "constraintHorizontal", "constraintVertical", "layoutPositioning", "layoutGrow", "layoutAlign",
  "fillStyleId", "textStyleId", "effectStyleId", "variableBindings",
];

const resourceNode = (
  kind: SharedStyleKind | VariableKind,
  name: string,
  value: Record<string, string | number>,
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
    zIndex: highestZ + index + 1,
    componentDefinition: false,
    componentNodeId: shape.id,
    instanceRootId: instanceId,
    instanceOf: shape.id === componentId ? componentId : undefined,
    overriddenFields: [],
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
  instanceRoots.forEach((root) => {
    const definition = byId.get(root.instanceOf!);
    if (!definition?.componentDefinition) return;
    const definitionBounds = shapeBounds(definition);
    const rootBounds = shapeBounds(root);
    shapes.filter((shape) => shape.instanceRootId === root.id).forEach((instanceNode) => {
      const source = instanceNode.componentNodeId ? byId.get(instanceNode.componentNodeId) : undefined;
      if (!source) return;
      const overrides = new Set(instanceNode.overriddenFields ?? []);
      const next = { ...instanceNode };
      SYNC_FIELDS.forEach((field) => {
        if (!overrides.has(field as string)) (next as Record<string, unknown>)[field] = source[field];
      });
      const sourceBounds = shapeBounds(source);
      if (instanceNode.id === root.id) {
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
      updates.set(instanceNode.id, normalizeShape(next));
    });
  });
  return shapes.map((shape) => updates.get(shape.id) ?? shape);
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
  return synchronizeComponentInstances(shapes.map((shape) => shape.id === instanceId
    ? { ...shape, instanceOf: componentId, componentNodeId: componentId, overriddenFields: [] }
    : shape));
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
  value: string | number
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
