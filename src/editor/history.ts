import { EditorDocumentSnapshot, EditorHistory } from "./types";

const HISTORY_LIMIT = 100;

export const cloneSnapshot = (
  snapshot: EditorDocumentSnapshot
): EditorDocumentSnapshot => JSON.parse(JSON.stringify(snapshot));

const snapshotsEqual = (
  left: EditorDocumentSnapshot,
  right: EditorDocumentSnapshot
): boolean => JSON.stringify(left) === JSON.stringify(right);

export const createEditorHistory = (
  snapshot: EditorDocumentSnapshot
): EditorHistory => ({
  boardId: snapshot.boardId,
  past: [],
  present: cloneSnapshot(snapshot),
  future: [],
});

export const commitEditorHistory = (
  history: EditorHistory,
  snapshot: EditorDocumentSnapshot
): EditorHistory => {
  if (history.boardId !== snapshot.boardId) return createEditorHistory(snapshot);
  if (snapshotsEqual(history.present, snapshot)) return history;

  return {
    boardId: history.boardId,
    past: [...history.past, cloneSnapshot(history.present)].slice(-HISTORY_LIMIT),
    present: cloneSnapshot(snapshot),
    future: [],
  };
};

export const undoEditorHistory = (history: EditorHistory): EditorHistory => {
  if (history.past.length === 0) return history;
  const previous = history.past[history.past.length - 1]!;
  return {
    ...history,
    past: history.past.slice(0, -1),
    present: cloneSnapshot(previous),
    future: [cloneSnapshot(history.present), ...history.future],
  };
};

export const redoEditorHistory = (history: EditorHistory): EditorHistory => {
  if (history.future.length === 0) return history;
  const next = history.future[0]!;
  return {
    ...history,
    past: [...history.past, cloneSnapshot(history.present)].slice(-HISTORY_LIMIT),
    present: cloneSnapshot(next),
    future: history.future.slice(1),
  };
};
