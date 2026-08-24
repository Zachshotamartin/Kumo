import { randomUUID } from "node:crypto";

type JsonShape = Record<string, unknown>;

export interface LibraryDiffItem {
  sourceId: string;
  status: "added" | "changed" | "removed" | "unchanged";
}

const documentRecord = (document: unknown) => document && typeof document === "object"
  ? document as Record<string, unknown>
  : {};

export const documentNodes = (document: unknown): Record<string, JsonShape> => {
  const nodes = documentRecord(document).nodes;
  return nodes && typeof nodes === "object" ? nodes as Record<string, JsonShape> : {};
};

export const extractLibraryAssets = (document: unknown): JsonShape[] => {
  const nodes = documentNodes(document);
  const values = Object.values(nodes);
  const children = new Map<string, JsonShape[]>();
  values.forEach((shape) => {
    if (typeof shape.parentId !== "string") return;
    children.set(shape.parentId, [...(children.get(shape.parentId) ?? []), shape]);
  });
  const included = new Set<string>();
  const include = (shape: JsonShape) => {
    if (typeof shape.id !== "string" || included.has(shape.id)) return;
    included.add(shape.id);
    (children.get(shape.id) ?? []).forEach(include);
  };
  values.filter((shape) => shape.type === "resource" || shape.componentDefinition === true).forEach(include);
  return values.filter((shape) => typeof shape.id === "string" && included.has(shape.id)).map((shape) => ({
    ...JSON.parse(JSON.stringify(shape)),
    librarySourceId: typeof shape.librarySourceId === "string" ? shape.librarySourceId : shape.id,
  }));
};

const comparable = (shape: JsonShape) => {
  const copy = { ...shape };
  ["id", "zIndex", "libraryId", "libraryVersion"].forEach((key) => delete copy[key]);
  return copy;
};

export const diffLibraryPayload = (current: JsonShape[], incoming: JsonShape[]): LibraryDiffItem[] => {
  const before = new Map(current.map((shape) => [String(shape.librarySourceId ?? shape.id), shape]));
  const after = new Map(incoming.map((shape) => [String(shape.librarySourceId ?? shape.id), shape]));
  return [...new Set([...before.keys(), ...after.keys()])].map((sourceId) => ({
    sourceId,
    status: !before.has(sourceId) ? "added" as const : !after.has(sourceId) ? "removed" as const
      : JSON.stringify(comparable(before.get(sourceId)!)) === JSON.stringify(comparable(after.get(sourceId)!))
        ? "unchanged" as const : "changed" as const,
  }));
};

export const mergeLibraryPayload = (document: unknown, incoming: JsonShape[], libraryId: string, version: number) => {
  const source = documentRecord(document);
  const nodes = documentNodes(document);
  const existing = Object.values(nodes).filter((shape) => shape.libraryId === libraryId);
  const bySource = new Map(existing.map((shape) => [String(shape.librarySourceId ?? shape.id), shape]));
  const idMap = new Map(incoming.map((shape) => {
    const sourceId = String(shape.librarySourceId ?? shape.id);
    return [String(shape.id), String(bySource.get(sourceId)?.id ?? randomUUID())];
  }));
  const nextNodes = Object.fromEntries(Object.entries(nodes).filter(([, shape]) => shape.libraryId !== libraryId));
  const highestZ = Math.max(0, ...Object.values(nextNodes).map((shape) => typeof shape.zIndex === "number" ? shape.zIndex : 0));
  incoming.forEach((shape, index) => {
    const sourceId = String(shape.librarySourceId ?? shape.id);
    const prior = bySource.get(sourceId);
    const id = String(prior?.id ?? idMap.get(String(shape.id)));
    nextNodes[id] = {
      ...JSON.parse(JSON.stringify(shape)),
      id,
      parentId: typeof shape.parentId === "string" ? idMap.get(shape.parentId) ?? shape.parentId : shape.parentId,
      zIndex: typeof prior?.zIndex === "number" ? prior.zIndex : highestZ + index + 1,
      libraryId,
      libraryVersion: version,
      librarySourceId: sourceId,
    };
  });
  return { ...source, nodes: nextNodes };
};

export const cleanProductName = (value: unknown, fallback: string) => {
  const name = typeof value === "string" ? value.trim().slice(0, 120) : "";
  return name || fallback;
};
