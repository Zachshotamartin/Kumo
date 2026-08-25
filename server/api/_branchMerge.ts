type JsonRecord = Record<string, unknown>;

export interface BranchConflict {
  shapeId: string;
  baseValue: unknown;
  mainValue: unknown;
  branchValue: unknown;
}

const equal = (left: unknown, right: unknown) => JSON.stringify(left) === JSON.stringify(right);
const object = (value: unknown): JsonRecord => value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};

const mergeRecord = (
  prefix: string,
  base: JsonRecord,
  main: JsonRecord,
  branch: JsonRecord,
  resolutions: Record<string, "main" | "branch">,
  conflicts: BranchConflict[]
) => {
  const merged: JsonRecord = {};
  const ids = new Set([...Object.keys(base), ...Object.keys(main), ...Object.keys(branch)]);
  for (const id of ids) {
    const conflictId = `${prefix}${id}`;
    const baseValue = base[id];
    const mainValue = main[id];
    const branchValue = branch[id];
    if (equal(mainValue, branchValue)) {
      if (mainValue !== undefined) merged[id] = mainValue;
    } else if (equal(branchValue, baseValue)) {
      if (mainValue !== undefined) merged[id] = mainValue;
    } else if (equal(mainValue, baseValue)) {
      if (branchValue !== undefined) merged[id] = branchValue;
    } else if (resolutions[conflictId]) {
      const selected = resolutions[conflictId] === "main" ? mainValue : branchValue;
      if (selected !== undefined) merged[id] = selected;
    } else {
      conflicts.push({ shapeId: conflictId, baseValue, mainValue, branchValue });
    }
  }
  return merged;
};

export const threeWayMergeDocuments = (
  baseValue: unknown,
  mainValue: unknown,
  branchValue: unknown,
  resolutions: Record<string, "main" | "branch"> = {}
) => {
  const base = object(baseValue);
  const main = object(mainValue);
  const branch = object(branchValue);
  const conflicts: BranchConflict[] = [];
  const nodes = mergeRecord("", object(base.nodes), object(main.nodes), object(branch.nodes), resolutions, conflicts);
  const textCharacters = mergeRecord("text:", object(base.textCharacters), object(main.textCharacters), object(branch.textCharacters), resolutions, conflicts);
  const backgroundId = "__background__";
  const baseBackground = base.backgroundColor;
  const mainBackground = main.backgroundColor;
  const branchBackground = branch.backgroundColor;
  let backgroundColor: unknown = branchBackground ?? mainBackground ?? "#252629";
  if (!equal(mainBackground, branchBackground)) {
    if (equal(branchBackground, baseBackground)) backgroundColor = mainBackground;
    else if (equal(mainBackground, baseBackground)) backgroundColor = branchBackground;
    else if (resolutions[backgroundId]) backgroundColor = resolutions[backgroundId] === "main" ? mainBackground : branchBackground;
    else conflicts.push({ shapeId: backgroundId, baseValue: baseBackground, mainValue: mainBackground, branchValue: branchBackground });
  }
  return {
    document: {
      schemaVersion: Math.max(Number(base.schemaVersion ?? 0), Number(main.schemaVersion ?? 0), Number(branch.schemaVersion ?? 0), 5),
      backgroundColor,
      nodes,
      textCharacters,
    },
    conflicts,
  };
};

export const branchVisualDiff = (mainValue: unknown, branchValue: unknown) => {
  const main = object(object(mainValue).nodes);
  const branch = object(object(branchValue).nodes);
  return [...new Set([...Object.keys(main), ...Object.keys(branch)])].flatMap((shapeId) => {
    const before = main[shapeId] as JsonRecord | undefined;
    const after = branch[shapeId] as JsonRecord | undefined;
    if (equal(before, after)) return [];
    return [{
      shapeId,
      status: !before ? "added" as const : !after ? "removed" as const : "changed" as const,
      name: String(after?.name ?? before?.name ?? after?.type ?? before?.type ?? shapeId),
      before: before ?? null,
      after: after ?? null,
    }];
  });
};
