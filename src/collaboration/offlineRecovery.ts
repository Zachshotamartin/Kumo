import type { Shape } from "../classes/shape";
import { deleteJournalMutation, deleteJournalRecoverySnapshot, journalMutation, journalRecoverySnapshot, readJournalMutations, readJournalRecoverySnapshot } from "./offlineJournal";

export interface RecoverySnapshot {
  boardId: string;
  savedAt: number;
  baseRevision: number;
  backgroundColor: string;
  baseBackgroundColor: string;
  baseShapes: Shape[];
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

export type RecoveryResolution = "remote" | "local";

const RECOVERY_PREFIX = "kumo:recovery:";
const QUEUE_KEY = "kumo:offline-queue";

const localStorage = (): Storage | null => {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
};

export const recoveryKey = (boardId: string) => `${RECOVERY_PREFIX}${boardId}`;

export const saveRecoverySnapshot = (snapshot: RecoverySnapshot) => {
  const storage = localStorage();
  if (storage) storage.setItem(recoveryKey(snapshot.boardId), JSON.stringify(snapshot));
  return journalRecoverySnapshot(snapshot).catch(() => undefined);
};

export const loadRecoverySnapshot = (boardId: string): RecoverySnapshot | null => {
  const storage = localStorage();
  if (!storage) return null;
  const value = storage.getItem(recoveryKey(boardId));
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as RecoverySnapshot;
    return parsed.boardId === boardId && Array.isArray(parsed.shapes) && Array.isArray(parsed.baseShapes) ? parsed : null;
  } catch {
    return null;
  }
};

export const clearRecoverySnapshot = (boardId: string) => {
  localStorage()?.removeItem(recoveryKey(boardId));
  return deleteJournalRecoverySnapshot(boardId).catch(() => undefined);
};

export const hydrateRecoverySnapshot = async (boardId: string) => {
  const cached = loadRecoverySnapshot(boardId);
  const journaled = await readJournalRecoverySnapshot(boardId).catch(() => null);
  const selected = !cached ? journaled : !journaled ? cached : cached.savedAt >= journaled.savedAt ? cached : journaled;
  const storage = localStorage();
  if (selected && storage) storage.setItem(recoveryKey(boardId), JSON.stringify(selected));
  return selected;
};

export const queuedMutations = (): QueuedBoardMutation[] => {
  const storage = localStorage();
  if (!storage) return [];
  try {
    const parsed = JSON.parse(storage.getItem(QUEUE_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

export const queueBoardMutation = (mutation: QueuedBoardMutation) => {
  const storage = localStorage();
  const current = queuedMutations().filter((candidate) => candidate.id !== mutation.id);
  if (storage) storage.setItem(QUEUE_KEY, JSON.stringify([...current, mutation]));
  return journalMutation(mutation).catch(() => undefined);
};

export const removeQueuedMutation = (id: string) => {
  const storage = localStorage();
  if (storage) storage.setItem(QUEUE_KEY, JSON.stringify(queuedMutations().filter((mutation) => mutation.id !== id)));
  return deleteJournalMutation(id).catch(() => undefined);
};

export const hydrateQueuedMutations = async () => {
  const cached = queuedMutations();
  const journaled = await readJournalMutations().catch(() => []);
  const merged = new Map<string, QueuedBoardMutation>();
  [...journaled, ...cached].forEach((mutation) => {
    const current = merged.get(mutation.id);
    if (!current || mutation.createdAt >= current.createdAt) merged.set(mutation.id, mutation);
  });
  const result = [...merged.values()].sort((left, right) => left.createdAt - right.createdAt);
  const storage = localStorage();
  if (storage) storage.setItem(QUEUE_KEY, JSON.stringify(result));
  return result;
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
      merged.push(remoteShape ?? localShape!);
      return;
    }
    if (!localShape && remoteShape) {
      const remoteChanged = changedFields(baseShape, remoteShape).size > 0;
      if (remoteChanged) {
        conflicts.push({ shapeId: id, fields: ["__deleted"] });
        merged.push(remoteShape);
      }
      return;
    }
    if (localShape && !remoteShape) {
      const localChanged = changedFields(baseShape, localShape).size > 0;
      if (localChanged) conflicts.push({ shapeId: id, fields: ["__deleted"] });
      return;
    }
    const localChanges = changedFields(baseShape, localShape!);
    const remoteChanges = changedFields(baseShape, remoteShape!);
    const overlapping = [...localChanges].filter((field) => remoteChanges.has(field) && JSON.stringify((localShape as unknown as Record<string, unknown>)[field]) !== JSON.stringify((remoteShape as unknown as Record<string, unknown>)[field]));
    if (overlapping.length) conflicts.push({ shapeId: id, fields: overlapping });
    const next = { ...remoteShape } as Record<string, unknown>;
    localChanges.forEach((field) => {
      if (!overlapping.includes(field)) next[field] = (localShape as unknown as Record<string, unknown>)[field];
    });
    merged.push(next as unknown as Shape);
  });
  return { shapes: merged.sort((left, right) => left.zIndex - right.zIndex || left.id.localeCompare(right.id)), conflicts };
};

export const resolveRecoveryConflicts = (
  merge: RecoveryMerge,
  remote: Shape[],
  local: Shape[],
  resolutions: Record<string, RecoveryResolution>
): Shape[] => {
  const remoteById = new Map(remote.map((shape) => [shape.id, shape]));
  const localById = new Map(local.map((shape) => [shape.id, shape]));
  const conflictIds = new Set(merge.conflicts.map((conflict) => conflict.shapeId));
  const resolved = new Map(merge.shapes.map((shape) => [shape.id, shape]));
  conflictIds.forEach((shapeId) => {
    const choice = resolutions[shapeId] ?? "remote";
    const chosen = choice === "local" ? localById.get(shapeId) : remoteById.get(shapeId);
    if (chosen) resolved.set(shapeId, chosen);
    else resolved.delete(shapeId);
  });
  return [...resolved.values()].sort((left, right) => left.zIndex - right.zIndex || left.id.localeCompare(right.id));
};

export const replayQueuedMutations = async (
  send: (mutation: QueuedBoardMutation) => Promise<void>
) => {
  const failures: Array<{ mutation: QueuedBoardMutation; error: unknown }> = [];
  for (const mutation of await hydrateQueuedMutations()) {
    try {
      await send(mutation);
      await removeQueuedMutation(mutation.id);
    } catch (error) {
      failures.push({ mutation, error });
    }
  }
  return failures;
};
