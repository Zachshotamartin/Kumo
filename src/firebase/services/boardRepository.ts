import {
  DataSnapshot,
  get,
  increment,
  onDisconnect,
  onValue,
  push,
  ref,
  remove,
  serverTimestamp,
  set,
  update,
} from "firebase/database";
import { createShapeId, Shape } from "../../classes/shape";
import { normalizeShape } from "../../editor/geometry";
import { WhiteBoardState } from "../../features/whiteBoard/whiteBoardSlice";
import { auth, realtimeDb } from "../../config/firebase";

export type BoardVisibility = "private" | "public";
export type BoardRole = "owner" | "editor" | "viewer";

export interface BoardSummary {
  id: string;
  title: string;
  ownerId: string;
  visibility: BoardVisibility;
  updatedAt: number | null;
}

export interface BoardRecord {
  schemaVersion: 2;
  id: string;
  title: string;
  ownerId: string;
  visibility: BoardVisibility;
  members: Record<string, BoardRole>;
  backgroundColor: string;
  shapesById: Record<string, Shape>;
  shapeOrder: string[];
  revision: number;
  lastChangedBy: string | null;
  updatedAt: number | null;
}

interface LegacyBoardSummary {
  id?: string;
  title?: string;
  ownerId?: string;
  uid?: string;
  visibility?: string;
  type?: string;
}

const asArray = <T>(value: T[] | Record<string, T> | null | undefined): T[] => {
  if (Array.isArray(value)) return value.filter(Boolean);
  if (value && typeof value === "object") return Object.values(value).filter(Boolean);
  return [];
};

const shapeMap = (shapes: Shape[]): Record<string, Shape> =>
  Object.fromEntries(shapes.map((shape) => [shape.id, normalizeShape(shape)]));

const orderedShapes = (
  shapesById: Record<string, Shape> | null | undefined,
  shapeOrder: string[] | Record<string, string> | null | undefined
): Shape[] => {
  const map = shapesById ?? {};
  const order = asArray(shapeOrder);
  const ordered = order.map((id) => map[id]).filter((shape): shape is Shape => Boolean(shape));
  const seen = new Set(ordered.map((shape) => shape.id));
  const remaining = Object.values(map)
    .filter((shape) => !seen.has(shape.id))
    .sort((left, right) => left.zIndex - right.zIndex);
  return [...ordered, ...remaining].map(normalizeShape);
};

export const deserializeBoard = (
  id: string,
  raw: Record<string, unknown>
): WhiteBoardState => {
  const legacyShapes = asArray<Shape>(raw.shapes as Shape[] | Record<string, Shape> | undefined);
  const rawShapeMap = raw.shapesById as Record<string, Shape> | undefined;
  const rawShapeOrder = raw.shapeOrder as string[] | Record<string, string> | undefined;
  const shapes = rawShapeMap
    ? orderedShapes(rawShapeMap, rawShapeOrder)
    : legacyShapes.map(normalizeShape);
  const ownerId = typeof raw.ownerId === "string"
    ? raw.ownerId
    : typeof raw.uid === "string"
    ? raw.uid
    : null;
  const visibility = raw.visibility ?? (raw.type === "public" ? "public" : "private");
  const members = raw.members && typeof raw.members === "object"
    ? { ...(raw.members as Record<string, BoardRole>) }
    : Object.fromEntries(
        asArray<string>(raw.sharedWith as string[] | Record<string, string> | undefined).map((uid) => [
          uid,
          uid === ownerId ? "owner" : "editor",
        ])
      ) as Record<string, BoardRole>;
  if (ownerId) members[ownerId] = "owner";

  return {
    id,
    shapes,
    title: typeof raw.title === "string" ? raw.title : "Untitled",
    uid: ownerId,
    type: typeof visibility === "string" ? visibility : "private",
    sharedWith: Object.keys(members),
    members,
    backGroundColor: typeof raw.backgroundColor === "string"
      ? raw.backgroundColor
      : typeof raw.backGroundColor === "string"
      ? raw.backGroundColor
      : "#252629",
    lastChangedBy: typeof raw.lastChangedBy === "string" ? raw.lastChangedBy : null,
    currentUsers: [],
    schemaVersion: 2,
    revision: typeof raw.revision === "number" ? raw.revision : 0,
    updatedAt: typeof raw.updatedAt === "number" ? raw.updatedAt : null,
  };
};

export const createBoard = async (
  ownerId: string,
  title = "Untitled board"
): Promise<string> => {
  const boardId = push(ref(realtimeDb, "boards")).key;
  if (!boardId) throw new Error("Firebase did not allocate a board ID.");

  const record: BoardRecord = {
    schemaVersion: 2,
    id: boardId,
    title,
    ownerId,
    visibility: "private",
    members: { [ownerId]: "owner" },
    backgroundColor: "#252629",
    shapesById: {},
    shapeOrder: [],
    revision: 0,
    lastChangedBy: ownerId,
    updatedAt: Date.now(),
  };
  const summary: BoardSummary = {
    id: boardId,
    title,
    ownerId,
    visibility: "private",
    updatedAt: record.updatedAt,
  };

  await update(ref(realtimeDb), {
    [`boards/${boardId}`]: record,
    [`userBoards/${ownerId}/${boardId}`]: summary,
  });
  return boardId;
};

export const duplicateBoard = async (
  sourceBoardId: string,
  ownerId: string
): Promise<string> => {
  const source = await getBoard(sourceBoardId);
  const boardId = push(ref(realtimeDb, "boards")).key;
  if (!boardId) throw new Error("Firebase did not allocate a board ID.");

  const groups = new Map<string, string>();
  const shapes = source.shapes.map((shape) => {
    const sourceGroup = shape.groupId;
    if (sourceGroup && !groups.has(sourceGroup)) groups.set(sourceGroup, createShapeId());
    return normalizeShape({
      ...shape,
      id: createShapeId(),
      groupId: sourceGroup ? groups.get(sourceGroup) ?? null : null,
    });
  });
  const title = `${source.title ?? "Untitled board"} copy`;
  const record: BoardRecord = {
    schemaVersion: 2,
    id: boardId,
    title,
    ownerId,
    visibility: "private",
    members: { [ownerId]: "owner" },
    backgroundColor: source.backGroundColor,
    shapesById: shapeMap(shapes),
    shapeOrder: shapes.slice().sort((a, b) => a.zIndex - b.zIndex).map((shape) => shape.id),
    revision: 0,
    lastChangedBy: ownerId,
    updatedAt: Date.now(),
  };
  const summary: BoardSummary = {
    id: boardId,
    title,
    ownerId,
    visibility: "private",
    updatedAt: record.updatedAt,
  };
  await update(ref(realtimeDb), {
    [`boards/${boardId}`]: record,
    [`userBoards/${ownerId}/${boardId}`]: summary,
  });
  return boardId;
};

const migrateLegacyBoardAccess = async (boardId: string): Promise<void> => {
  const token = await auth.currentUser?.getIdToken();
  if (!token) throw new Error("Authentication required.");
  const response = await fetch("/api/migrate-board", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ boardId }),
  });
  if (!response.ok) {
    const result = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(result?.error ?? "This legacy board could not be migrated.");
  }
};

export const getBoard = async (boardId: string): Promise<WhiteBoardState> => {
  try {
    const snapshot = await get(ref(realtimeDb, `boards/${boardId}`));
    if (!snapshot.exists()) throw new Error("Board not found.");
    return deserializeBoard(boardId, snapshot.val());
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error
      ? String(error.code)
      : "";
    const message = error instanceof Error ? error.message : "";
    if (!/permission/i.test(`${code} ${message}`)) throw error;
    await migrateLegacyBoardAccess(boardId);
    const migrated = await get(ref(realtimeDb, `boards/${boardId}`));
    if (!migrated.exists()) throw new Error("Board not found.");
    return deserializeBoard(boardId, migrated.val());
  }
};

export const subscribeBoard = (
  boardId: string,
  onBoard: (board: WhiteBoardState) => void,
  onError: (error: Error) => void
): (() => void) =>
  onValue(
    ref(realtimeDb, `boards/${boardId}`),
    (snapshot) => {
      if (!snapshot.exists()) {
        onError(new Error("Board not found or no longer available."));
        return;
      }
      onBoard(deserializeBoard(boardId, snapshot.val()));
    },
    onError
  );

const summaryFromSnapshot = (snapshot: DataSnapshot): BoardSummary[] => {
  if (!snapshot.exists()) return [];
  return Object.values(snapshot.val() as Record<string, BoardSummary>).sort(
    (left, right) => (right.updatedAt ?? 0) - (left.updatedAt ?? 0)
  );
};

export const subscribeUserBoards = (
  uid: string,
  onBoards: (boards: BoardSummary[]) => void,
  onError: (error: Error) => void
): (() => void) => onValue(ref(realtimeDb, `userBoards/${uid}`), (snapshot) => onBoards(summaryFromSnapshot(snapshot)), onError);

export const migrateLegacyBoardIndex = async (uid: string): Promise<void> => {
  const [currentIndex, legacyProfile] = await Promise.all([
    get(ref(realtimeDb, `userBoards/${uid}`)),
    get(ref(realtimeDb, `users/${uid}`)),
  ]);
  if (currentIndex.exists() || !legacyProfile.exists()) return;
  const legacy = legacyProfile.val() as Record<string, unknown>;
  const entries = [
    ...asArray<LegacyBoardSummary>(legacy.privateBoardsIds as LegacyBoardSummary[] | Record<string, LegacyBoardSummary> | undefined),
    ...asArray<LegacyBoardSummary>(legacy.publicBoardsIds as LegacyBoardSummary[] | Record<string, LegacyBoardSummary> | undefined),
    ...asArray<LegacyBoardSummary>(legacy.sharedBoardsIds as LegacyBoardSummary[] | Record<string, LegacyBoardSummary> | undefined),
  ];
  const updates: Record<string, BoardSummary> = {};
  entries.forEach((entry) => {
    if (!entry?.id) return;
    updates[`userBoards/${uid}/${entry.id}`] = {
      id: entry.id,
      title: entry.title ?? "Untitled board",
      ownerId: entry.ownerId ?? entry.uid ?? uid,
      visibility: entry.visibility === "public" || entry.type === "public" ? "public" : "private",
      updatedAt: null,
    };
  });
  if (Object.keys(updates).length > 0) await update(ref(realtimeDb), updates);
};

export const subscribePublicBoards = (
  onBoards: (boards: BoardSummary[]) => void,
  onError: (error: Error) => void
): (() => void) => onValue(ref(realtimeDb, "publicBoards"), (snapshot) => onBoards(summaryFromSnapshot(snapshot)), onError);

const diffShapeIds = (previous: Shape[], next: Shape[]) => {
  const previousMap = new Map(previous.map((shape) => [shape.id, shape]));
  const nextMap = new Map(next.map((shape) => [shape.id, shape]));
  const changed = next.filter(
    (shape) => JSON.stringify(previousMap.get(shape.id)) !== JSON.stringify(shape)
  );
  const deleted = previous.filter((shape) => !nextMap.has(shape.id)).map((shape) => shape.id);
  const previousOrder = previous.slice().sort((a, b) => a.zIndex - b.zIndex).map((shape) => shape.id);
  const nextOrder = next.slice().sort((a, b) => a.zIndex - b.zIndex).map((shape) => shape.id);
  return { changed, deleted, orderChanged: JSON.stringify(previousOrder) !== JSON.stringify(nextOrder), nextOrder };
};

const boardSaveQueues = new Map<string, Promise<void>>();

const writeBoardChanges = async (
  previous: WhiteBoardState,
  next: WhiteBoardState,
  editorUid: string
): Promise<void> => {
  if (!next.id) throw new Error("Cannot save a board without an ID.");
  const changes = diffShapeIds(previous.shapes, next.shapes);
  const updates: Record<string, unknown> = {
    [`boards/${next.id}/schemaVersion`]: 2,
    [`boards/${next.id}/id`]: next.id,
    [`boards/${next.id}/ownerId`]: next.uid ?? editorUid,
    [`boards/${next.id}/title`]: next.title ?? "Untitled",
    [`boards/${next.id}/visibility`]: next.type === "public" ? "public" : "private",
    [`boards/${next.id}/backgroundColor`]: next.backGroundColor,
    [`boards/${next.id}/lastChangedBy`]: editorUid,
    [`boards/${next.id}/revision`]: increment(1),
    [`boards/${next.id}/updatedAt`]: serverTimestamp(),
    // Remove the legacy full-board shape array once this board is edited in v2.
    [`boards/${next.id}/shapes`]: null,
  };

  changes.changed.forEach((shape) => {
    updates[`boards/${next.id}/shapesById/${shape.id}`] = normalizeShape(shape);
  });
  changes.deleted.forEach((shapeId) => {
    updates[`boards/${next.id}/shapesById/${shapeId}`] = null;
  });
  if (changes.orderChanged || changes.changed.length > 0 || changes.deleted.length > 0) {
    updates[`boards/${next.id}/shapeOrder`] = changes.nextOrder;
  }

  const ownerId = next.uid ?? editorUid;
  if (ownerId === editorUid) {
    updates[`boards/${next.id}/members`] = {
      ...next.members,
      [ownerId]: "owner",
    };
  }
  const summary: BoardSummary = {
    id: next.id,
    title: next.title ?? "Untitled",
    ownerId,
    visibility: next.type === "public" ? "public" : "private",
    updatedAt: Date.now(),
  };
  const summaryRecipients = ownerId === editorUid
    ? new Set([ownerId, ...Object.keys(next.members)])
    : new Set([editorUid]);
  summaryRecipients.forEach((uid) => {
    updates[`userBoards/${uid}/${next.id}`] = summary;
  });
  if (ownerId === editorUid) {
    updates[`publicBoards/${next.id}`] = next.type === "public" ? summary : null;
  }

  await update(ref(realtimeDb), updates);
};

export const saveBoardChanges = (
  previous: WhiteBoardState,
  next: WhiteBoardState,
  editorUid: string
): Promise<void> => {
  if (!next.id) return Promise.reject(new Error("Cannot save a board without an ID."));
  const boardId = next.id;
  const queued = (boardSaveQueues.get(boardId) ?? Promise.resolve())
    .catch(() => undefined)
    .then(() => writeBoardChanges(previous, next, editorUid));
  boardSaveQueues.set(boardId, queued);
  void queued
    .finally(() => {
      if (boardSaveQueues.get(boardId) === queued) boardSaveQueues.delete(boardId);
    })
    .catch(() => undefined);
  return queued;
};

export const setBoardVisibility = async (
  board: WhiteBoardState,
  visibility: BoardVisibility,
  actorUid: string
): Promise<void> => {
  if (!board.id || board.uid !== actorUid) throw new Error("Only the board owner can change visibility.");
  const summary: BoardSummary = {
    id: board.id,
    title: board.title ?? "Untitled",
    ownerId: actorUid,
    visibility,
    updatedAt: Date.now(),
  };
  await update(ref(realtimeDb), {
    [`boards/${board.id}/visibility`]: visibility,
    [`boards/${board.id}/updatedAt`]: serverTimestamp(),
    [`userBoards/${actorUid}/${board.id}`]: summary,
    [`publicBoards/${board.id}`]: visibility === "public" ? summary : null,
  });
};

export const deleteBoard = async (board: WhiteBoardState, actorUid: string): Promise<void> => {
  if (!board.id || board.uid !== actorUid) throw new Error("Only the board owner can delete this board.");
  const updates: Record<string, null> = {
    [`boards/${board.id}`]: null,
    [`publicBoards/${board.id}`]: null,
  };
  [...new Set([actorUid, ...board.sharedWith])].forEach((uid) => {
    updates[`userBoards/${uid}/${board.id}`] = null;
  });
  await update(ref(realtimeDb), updates);
};

export const connectPresence = async (
  boardId: string,
  uid: string,
  email: string | null
): Promise<() => Promise<void>> => {
  const presenceRef = ref(realtimeDb, `presence/${boardId}/${uid}`);
  await onDisconnect(presenceRef).remove();
  await set(presenceRef, {
    uid,
    label: email?.split("@")[0] ?? "Collaborator",
    cursorX: 0,
    cursorY: 0,
    updatedAt: serverTimestamp(),
  });
  return () => remove(presenceRef);
};

export const updatePresenceCursor = (
  boardId: string,
  uid: string,
  point: { x: number; y: number }
): Promise<void> =>
  update(ref(realtimeDb, `presence/${boardId}/${uid}`), {
    cursorX: point.x,
    cursorY: point.y,
    updatedAt: serverTimestamp(),
  });

export const subscribePresence = (
  boardId: string,
  onPresence: (users: WhiteBoardState["currentUsers"]) => void
): (() => void) => onValue(ref(realtimeDb, `presence/${boardId}`), (snapshot) => onPresence(asArray(snapshot.val())));
