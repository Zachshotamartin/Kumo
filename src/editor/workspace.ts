import { createShapeId, type Shape } from "../classes/shape";
import { descendantIds, rootSelectionIds } from "./hierarchy";
import { normalizeShape, selectionBounds } from "./geometry";

export const DEFAULT_PAGE_ID = "page:default";

export interface DocumentPage {
  id: string;
  name: string;
  order: number;
  implicit?: boolean;
}

export const documentPages = (shapes: Shape[]): DocumentPage[] => {
  const explicit = shapes
    .filter((shape) => shape.type === "page-resource")
    .map((shape) => ({ id: shape.id, name: shape.pageName ?? shape.name ?? "Page", order: shape.pageOrder ?? 0 }))
    .sort((left, right) => left.order - right.order || left.name.localeCompare(right.name));
  return explicit.length ? explicit : [{ id: DEFAULT_PAGE_ID, name: "Page 1", order: 0, implicit: true }];
};

export const pageIdForShape = (shape: Shape, pages: readonly DocumentPage[]) =>
  shape.pageId ?? (pages.some((page) => page.id === DEFAULT_PAGE_ID) ? DEFAULT_PAGE_ID : pages[0]?.id ?? DEFAULT_PAGE_ID);

export const shapesOnPage = (shapes: Shape[], pageId: string | null): Shape[] => {
  const pages = documentPages(shapes);
  const active = pageId && pages.some((page) => page.id === pageId) ? pageId : pages[0]!.id;
  return shapes.filter((shape) => !["page-resource", "collection-resource", "resource"].includes(shape.type) && pageIdForShape(shape, pages) === active);
};

const hiddenRecord = (type: "page-resource" | "collection-resource", name: string, zIndex: number): Shape => normalizeShape({
  id: createShapeId(), type, name, x1: 0, y1: 0, x2: 0, y2: 0, width: 0, height: 0,
  level: 0, zIndex, hidden: true, locked: true, parentId: null,
});

export const createPage = (shapes: Shape[], name = `Page ${documentPages(shapes).length + 1}`) => {
  const pages = documentPages(shapes);
  const explicitCount = shapes.filter((shape) => shape.type === "page-resource").length;
  const highestZ = Math.max(0, ...shapes.map((shape) => shape.zIndex));
  const legacyPage = pages[0]?.implicit
    ? { ...hiddenRecord("page-resource", "Page 1", highestZ + 1), pageName: "Page 1", pageOrder: 0 }
    : null;
  const migrated = legacyPage
    ? shapes.map((shape) => shape.type === "collection-resource" || shape.type === "resource" ? shape : { ...shape, pageId: legacyPage.id })
    : shapes;
  const recordOrder = legacyPage ? 1 : explicitCount;
  const record = {
    ...hiddenRecord("page-resource", name, highestZ + (legacyPage ? 2 : 1)),
    pageName: name,
    pageOrder: recordOrder,
  };
  return { shapes: [...migrated, ...(legacyPage ? [legacyPage] : []), record], pageId: record.id };
};

export const renamePage = (shapes: Shape[], pageId: string, name: string) => shapes.map((shape) =>
  shape.id === pageId && shape.type === "page-resource" ? { ...shape, pageName: name.trim() || "Untitled page", name: name.trim() || "Untitled page" } : shape);

export const duplicatePage = (shapes: Shape[], pageId: string) => {
  const pages = documentPages(shapes);
  const sourcePage = pages.find((page) => page.id === pageId);
  if (!sourcePage) return { shapes, pageId: null };
  const created = createPage(shapes, `${sourcePage.name} copy`);
  const source = shapesOnPage(shapes, pageId);
  const collectNodes = (shape: Shape): Shape[] => [
    shape,
    ...(shape.shapes ?? []).flatMap(collectNodes),
    ...(shape.booleanChildren ?? []).flatMap(collectNodes),
  ];
  const sourceNodes = source.flatMap(collectNodes);
  const idMap = new Map(sourceNodes.map((shape) => [shape.id, createShapeId()]));
  const groupIdMap = new Map(
    sourceNodes.flatMap((shape) => shape.groupId ? [[shape.groupId, createShapeId()] as const] : [])
  );
  const internalId = (value: string | null | undefined) => value ? idMap.get(value) : undefined;
  const cloneNode = (shape: Shape): Shape => normalizeShape({
    ...shape,
    id: idMap.get(shape.id)!,
    pageId: created.pageId,
    groupId: shape.groupId ? groupIdMap.get(shape.groupId) ?? null : null,
    parentId: internalId(shape.parentId) ?? null,
    sectionId: internalId(shape.sectionId) ?? null,
    instanceRootId: internalId(shape.instanceRootId),
    componentNodeId: internalId(shape.componentNodeId) ?? shape.componentNodeId,
    instanceOf: internalId(shape.instanceOf) ?? shape.instanceOf,
    componentSetId: internalId(shape.componentSetId) ?? shape.componentSetId,
    maskId: internalId(shape.maskId),
    prototypeInteractions: shape.prototypeInteractions?.map((interaction) => ({
      ...interaction,
      id: createShapeId(),
      destinationId: internalId(interaction.destinationId) ?? interaction.destinationId,
    })),
    vectorPoints: shape.vectorPoints?.map((point) => ({ ...point, id: createShapeId() })),
    gradientStops: shape.gradientStops?.map((stop) => ({ ...stop, id: createShapeId() })),
    effects: shape.effects?.map((effect) => ({ ...effect, id: createShapeId() })),
    shapes: shape.shapes?.map(cloneNode),
    booleanChildren: shape.booleanChildren?.map(cloneNode),
  });
  const highestZ = Math.max(0, ...created.shapes.map((shape) => shape.zIndex));
  const copies = source.map((shape, index) => ({
    ...cloneNode(shape),
    zIndex: highestZ + index + 1,
  }));
  return { shapes: [...created.shapes, ...copies], pageId: created.pageId };
};

export const deletePage = (shapes: Shape[], pageId: string) => {
  const pages = documentPages(shapes);
  if (pages.length <= 1) return { shapes, nextPageId: pageId };
  const remaining = pages.filter((page) => page.id !== pageId);
  const removedIndex = pages.findIndex((page) => page.id === pageId);
  const nextPageId = pages[removedIndex + 1]?.id ?? pages[removedIndex - 1]?.id ?? remaining[0]!.id;
  return {
    shapes: shapes.filter((shape) => {
      if (shape.type === "page-resource") return shape.id !== pageId;
      if (shape.type === "collection-resource" || shape.type === "resource") return true;
      return pageIdForShape(shape, pages) !== pageId;
    }),
    nextPageId,
  };
};

export const createSection = (
  shapes: Shape[],
  selectedIds: readonly string[],
  pageId: string,
  name = "Section"
): { shapes: Shape[]; sectionId: string | null } => {
  const roots = rootSelectionIds(shapes, selectedIds);
  const bounds = selectionBounds(shapes, roots);
  if (!bounds) return { shapes, sectionId: null };
  const sectionId = createShapeId();
  const section = normalizeShape({
    id: sectionId, type: "section", name, x1: bounds.x - 32, y1: bounds.y - 48,
    x2: bounds.x + bounds.width + 32, y2: bounds.y + bounds.height + 32,
    width: bounds.width + 64, height: bounds.height + 80, level: 0,
    zIndex: Math.min(...roots.map((id) => shapes.find((shape) => shape.id === id)?.zIndex ?? 1)) - 1,
    parentId: null, pageId, backgroundColor: "#2b2c30", borderColor: "#606269", borderWidth: 1,
  });
  const affected = new Set(roots);
  descendantIds(shapes, roots).forEach((id) => affected.add(id));
  return {
    sectionId,
    shapes: [...shapes.map((shape) => affected.has(shape.id) ? {
      ...shape,
      pageId,
      sectionId,
      parentId: roots.includes(shape.id) ? sectionId : shape.parentId,
    } : shape), section],
  };
};

export const createSectionCollection = (shapes: Shape[], sectionIds: readonly string[], name = "Collection") => {
  const selected = new Set(sectionIds);
  if (!shapes.some((shape) => selected.has(shape.id) && shape.type === "section")) return { shapes, collectionId: null };
  const record = { ...hiddenRecord("collection-resource", name, Math.max(0, ...shapes.map((shape) => shape.zIndex)) + 1), collectionName: name };
  return {
    collectionId: record.id,
    shapes: [...shapes.map((shape) => selected.has(shape.id) && shape.type === "section" ? { ...shape, collectionId: record.id } : shape), record],
  };
};
