import type { Shape } from '../classes/shape';
import { isEffectivelyLocked } from '../editor/hierarchy';
import { storedShape, shapePatch } from '../collaboration/shapes';
import { validateShape } from './capabilityManifest';

export interface DocumentReceipt { runId: string; operationId: string; before: Shape[]; after: Shape[]; timestamp: number; beforeBackground?: string; afterBackground?: string }
export const equalValue = (left: unknown, right: unknown) => JSON.stringify(left) === JSON.stringify(right);
export function changedShapes(before: Shape[], after: Shape[]) {
  const old = new Map(before.map(shape => [shape.id, shape]));
  const next = new Map(after.map(shape => [shape.id, shape]));
  const ids = new Set([...old.keys(), ...next.keys()].filter(id => !equalValue(old.get(id), next.get(id))));
  return { before: before.filter(shape => ids.has(shape.id)), after: after.filter(shape => ids.has(shape.id)), ids: [...ids] };
}
export function withinSelection(shapes: Shape[], id: string, selection: string[]): boolean {
  const visited = new Set<string>();
  let current: string | null | undefined = id;
  while (current && !visited.has(current)) {
    if (selection.includes(current)) return true;
    visited.add(current);
    current = shapes.find(shape => shape.id === current)?.parentId;
  }
  return false;
}
export function patchDocument(shapes: Shape[], changes: Array<{ id: string; expected: Record<string, unknown>; patch: Record<string, unknown> }>): Shape[] {
  const next = [...shapes];
  const ids = new Set<string>();
  for (const change of changes) {
    if (ids.has(change.id)) throw new Error('Patch an object only once per batch.');
    ids.add(change.id);
    const index = next.findIndex(shape => shape.id === change.id);
    const shape = next[index];
    if (!shape) throw new Error('An object no longer exists. Inspect again.');
    if ('id' in change.patch) throw new Error('Object IDs cannot be changed.');
    const keys = Object.keys(change.patch);
    if (isEffectivelyLocked(shapes, shape) && !(keys.length === 1 && keys[0] === 'locked' && change.patch.locked === false)) throw new Error('Unlock the object before editing it.');
    const current = shape as unknown as Record<string, unknown>;
    if (keys.some(key => !Object.hasOwn(change.expected, key) || !equalValue(current[key] ?? null, change.expected[key]))) throw new Error('An object changed since inspection. Inspect again before editing.');
    const updated = { ...shape, ...change.patch };
    if (!validateShape(updated)) throw new Error('The patch contains unsupported Shape fields or values.');
    next[index] = updated;
  }
  return next;
}

/** Field-wise inverse; never replaces the whole board or later collaborator edits. */
export function undoReceipts(shapes: Shape[], receipts: DocumentReceipt[]): Shape[] {
  const next = new Map(shapes.map(shape => [shape.id, { ...shape }]));
  for (const receipt of [...receipts].reverse()) {
    const before = new Map(receipt.before.map(shape => [shape.id, shape]));
    const after = new Map(receipt.after.map(shape => [shape.id, shape]));
    const restore = new Map([...before].filter(([id]) => !after.has(id) && !next.has(id)));
    let restored: boolean;
    do {
      restored = false;
      for (const [id, previous] of restore) if (!previous.parentId || next.has(previous.parentId)) { next.set(id, previous); restore.delete(id); restored = true; }
    } while (restored);
    for (const [id, previous] of before) {
      const current = next.get(id);
      const applied = after.get(id);
      if (!applied) continue;
      if (!current) continue;
      const delta = shapePatch(previous, applied);
      const record = current as unknown as Record<string, unknown>;
      const old = storedShape(previous);
      const final = storedShape(applied);
      for (const key of [...Object.keys(delta.update), ...delta.remove]) {
        if (!equalValue(record[key], final[key])) continue;
        if (key === 'parentId' && previous.parentId && !next.has(previous.parentId)) continue;
        if (Object.hasOwn(old, key)) record[key] = old[key]; else delete record[key];
      }
    }
    const removable = new Set([...after].filter(([id, applied]) => !before.has(id) && next.has(id) && equalValue(storedShape(next.get(id)!), storedShape(applied))).map(([id]) => id));
    // Preserve a created object when any retained object still refers to it.
    // Repeat because retaining a child can also require retaining its parent.
    let retained: boolean;
    do {
      retained = false;
      for (const id of removable) if ([...next.values()].some(shape => !removable.has(shape.id) && referencesShape(shape, id))) { removable.delete(id); retained = true; }
    } while (retained);
    for (const id of removable) next.delete(id);
  }
  return [...next.values()];
}

function referencesShape(value: unknown, id: string): boolean {
  if (!value || typeof value !== 'object') return false;
  return Object.entries(value).some(([key, child]) => (/Ids?$/.test(key) && (child === id || Array.isArray(child) && child.includes(id))) || referencesShape(child, id));
}

export function checkDocument(shapes: Shape[]) {
  const ids = new Set(shapes.map(shape => shape.id));
  return shapes.flatMap(shape => {
    const findings: string[] = [];
    if (!validateShape(shape)) findings.push('Invalid shape geometry or field values');
    if (shape.parentId && !ids.has(shape.parentId)) findings.push('Missing parent');
    if (shape.type === 'text' && shape.text && shape.fontSize && shape.height < shape.fontSize) findings.push('Text box is shorter than one line');
    if (shape.parentId && withinSelection(shapes, shape.parentId, [shape.id])) findings.push('Cyclic parent reference');
    return findings.map(message => ({ shapeId: shape.id, message }));
  });
}
