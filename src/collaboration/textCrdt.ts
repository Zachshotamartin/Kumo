export interface CollaborativeTextCharacter {
  id: string;
  shapeId: string;
  leftId: string | null;
  position: number;
  value: string;
  deleted: boolean;
}

export const orderedTextCharacters = (records: CollaborativeTextCharacter[], shapeId: string) => {
  const relevant = records.filter((record) => record.shapeId === shapeId);
  if (relevant.every((record) => Number.isFinite(record.position))) {
    return relevant.sort((left, right) => left.position - right.position || left.id.localeCompare(right.id));
  }
  const ids = new Set(relevant.map((record) => record.id));
  const children = new Map<string | null, CollaborativeTextCharacter[]>();
  relevant.forEach((record) => {
    const parent = record.leftId && ids.has(record.leftId) ? record.leftId : null;
    const values = children.get(parent) ?? [];
    values.push(record);
    children.set(parent, values);
  });
  children.forEach((values) => values.sort((left, right) => left.id.localeCompare(right.id)));
  const ordered: CollaborativeTextCharacter[] = [];
  const visited = new Set<string>();
  const visit = (parent: string | null) => {
    (children.get(parent) ?? []).forEach((record) => {
      if (visited.has(record.id)) return;
      visited.add(record.id);
      ordered.push(record);
      visit(record.id);
    });
  };
  visit(null);
  relevant.filter((record) => !visited.has(record.id)).sort((left, right) => left.id.localeCompare(right.id)).forEach((record) => ordered.push(record));
  return ordered;
};

export const collaborativeTextValue = (records: CollaborativeTextCharacter[], shapeId: string) =>
  orderedTextCharacters(records, shapeId).filter((record) => !record.deleted).map((record) => record.value).join("");

export const applyCollaborativeTextChange = (
  records: CollaborativeTextCharacter[],
  shapeId: string,
  previousText: string,
  nextText: string,
  createId: () => string
) => {
  const nextRecords = records.map((record) => ({ ...record }));
  let visible = orderedTextCharacters(nextRecords, shapeId).filter((record) => !record.deleted);
  orderedTextCharacters(nextRecords, shapeId).forEach((record, index) => {
    if (!Number.isFinite(record.position)) record.position = index + 1;
  });
  if (!nextRecords.some((record) => record.shapeId === shapeId) && previousText) {
    let leftId: string | null = null;
    [...previousText].forEach((value, index) => {
      const record = { id: `seed:${shapeId}:${String(index).padStart(8, "0")}`, shapeId, leftId, position: index + 1, value, deleted: false };
      nextRecords.push(record);
      leftId = record.id;
    });
    visible = orderedTextCharacters(nextRecords, shapeId).filter((record) => !record.deleted);
  }

  const before = [...previousText];
  const after = [...nextText];
  let prefix = 0;
  while (prefix < before.length && prefix < after.length && before[prefix] === after[prefix]) prefix += 1;
  let suffix = 0;
  while (suffix < before.length - prefix && suffix < after.length - prefix && before[before.length - 1 - suffix] === after[after.length - 1 - suffix]) suffix += 1;

  const deleteEnd = before.length - suffix;
  visible.slice(prefix, deleteEnd).forEach((record) => {
    const target = nextRecords.find((candidate) => candidate.id === record.id);
    if (target) target.deleted = true;
  });
  let leftId = prefix > 0 ? visible[prefix - 1]?.id ?? null : null;
  const inserted = after.slice(prefix, after.length - suffix);
  const leftPosition = prefix > 0 ? visible[prefix - 1]?.position ?? 0 : 0;
  const rightPosition = visible[deleteEnd]?.position ?? leftPosition + Math.max(1, inserted.length + 1);
  inserted.forEach((value, index) => {
    const position = leftPosition + ((rightPosition - leftPosition) * (index + 1)) / (inserted.length + 1);
    const record = { id: createId(), shapeId, leftId, position, value, deleted: false };
    nextRecords.push(record);
    leftId = record.id;
  });
  return { records: nextRecords, text: collaborativeTextValue(nextRecords, shapeId) };
};

export const pruneCollaborativeText = (records: CollaborativeTextCharacter[], existingShapeIds: Set<string>) =>
  records.filter((record) => existingShapeIds.has(record.shapeId));
