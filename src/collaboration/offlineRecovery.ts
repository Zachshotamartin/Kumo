import type { Shape } from "../classes/shape";

export interface RecoverySnapshot {
  boardId: string;
  savedAt: number;
  baseRevision: number;
  backgroundColor: string;
  shapes: Shape[];
}

export interface QueuedBoardMutation {
  id: string;
  boardId: string;
  createdAt: number;
  kind: "settings";
  payload: { title?: string; visibility?: "private" | "public" };
}

export interface RecoveryConflict {
  shapeId: string;
  fields: string[];
}

export interface RecoveryMerge {
  shapes: Shape[];
  conflicts: RecoveryConflict[];
}

const RECOVERY_PREFIX = "kumo:recovery:";
const QUEUE_KEY = "kumo:offline-queue";

const storageAvailable = () => typeof window !== "undefined" && Boolean(window.localStorage);

export const recoveryKey = (boardId: string) => `${RECOVERY_PREFIX}${boardId}`;

export const saveRecoverySnapshot = (snapshot: RecoverySnapshot) => {
  if (!storageAvailable()) return;
  window.localStorage.setItem(recoveryKey(snapshot.boardId), JSON.stringify(snapshot));
};

export const loadRecoverySnapshot = (boardId: string): RecoverySnapshot | null => {
  if (!storageAvailable()) return null;
  const value = window.localStorage.getItem(recoveryKey(boardId));
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as RecoverySnapshot;
    return parsed.boardId === boardId && Array.isArray(parsed.shapes) ? parsed : null;
  } catch {
    return null;
  }
};

export const clearRecoverySnapshot = (boardId: string) => {
  if (storageAvailable()) window.localStorage.removeItem(recoveryKey(boardId));
};

export const queuedMutations = (): QueuedBoardMutation[] => {
  if (!storageAvailable()) return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(QUEUE_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

export const queueBoardMutation = (mutation: QueuedBoardMutation) => {
  if (!storageAvailable()) return;
  const current = queuedMutations().filter((candidate) => candidate.id !== mutation.id);
  window.localStorage.setItem(QUEUE_KEY, JSON.stringify([...current, mutation]));
};

export const removeQueuedMutation = (id: string) => {
  if (!storageAvailable()) return;
  window.localStorage.setItem(QUEUE_KEY, JSON.stringify(queuedMutations().filter((mutation) => mutation.id !== id)));
};

const changedFields = (base: Shape, candidate: Shape) => {
  const keys = new Set([...Object.keys(base), ...Object.keys(candidate)]);
  return new Set([...keys].filter((key) => JSON.stringify((base as unknown as Record<string, unknown>)[key]) !== JSON.stringify((candidate as unknown as Record<string, unknown>)[key])));
};

export const mergeRecoverySnapshot = (base: Shape[], remote: Shape[], local: Shape[]): RecoveryMerge => {
  const baseById = new Map(base.map((shape) => [shape.id, shape]));
  const remoteById = new Map(remote.map((shape) => [shape.id, shape]));
  const localById = new Map(local.map((shape) => [shape.id, shape]));
  const ids = new Set([...baseById.keys(), ...remoteById.keys(), ...localById.keys()]);
  const conflicts: RecoveryConflict[] = [];
  const merged: Shape[] = [];
  ids.forEach((id) => {
    const baseShape = baseById.get(id);
    const remoteShape = remoteById.get(id);
    const localShape = localById.get(id);
    if (!localShape && !remoteShape) return;
    if (!baseShape) {
      if (localShape && remoteShape && JSON.stringify(localShape) !== JSON.stringify(remoteShape)) conflicts.push({ shapeId: id, fields: ["__shape"] });
      merged.push(localShape ?? remoteShape!);
      return;
    }
    if (!localShape || !remoteShape) {
      const surviving = (localShape ?? remoteShape)!;
      const changed = changedFields(baseShape, surviving).size > 0;
      if (changed) conflicts.push({ shapeId: id, fields: ["__deleted"] });
      merged.push(surviving);
      return;
    }
    const localChanges = changedFields(baseShape, localShape);
    const remoteChanges = changedFields(baseShape, remoteShape);
    const overlapping = [...localChanges].filter((field) => remoteChanges.has(field) && JSON.stringify((localShape as unknown as Record<string, unknown>)[field]) !== JSON.stringify((remoteShape as unknown as Record<string, unknown>)[field]));
    if (overlapping.length) conflicts.push({ shapeId: id, fields: overlapping });
    const next = { ...remoteShape } as Record<string, unknown>;
    localChanges.forEach((field) => { next[field] = (localShape as unknown as Record<string, unknown>)[field]; });
    merged.push(next as unknown as Shape);
  });
  return { shapes: merged.sort((left, right) => left.zIndex - right.zIndex || left.id.localeCompare(right.id)), conflicts };
};

export const replayQueuedMutations = async (
  send: (mutation: QueuedBoardMutation) => Promise<void>
) => {
  const failures: Array<{ mutation: QueuedBoardMutation; error: unknown }> = [];
  for (const mutation of queuedMutations()) {
    try {
      await send(mutation);
      removeQueuedMutation(mutation.id);
    } catch (error) {
      failures.push({ mutation, error });
    }
  }
  return failures;
};
