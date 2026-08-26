import type { QueuedBoardMutation, RecoverySnapshot } from "./offlineRecovery";

const DATABASE = "kumo-offline-journal";
const VERSION = 1;
let pendingWrite: Promise<void> = Promise.resolve();

const serializeWrite = <T>(operation: () => Promise<T>): Promise<T> => {
  const result = pendingWrite.then(operation, operation);
  pendingWrite = result.then(() => undefined, () => undefined);
  return result;
};

export const flushOfflineJournal = () => pendingWrite;

const openJournal = (): Promise<IDBDatabase | null> => {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains("recovery")) database.createObjectStore("recovery", { keyPath: "boardId" });
      if (!database.objectStoreNames.contains("mutations")) database.createObjectStore("mutations", { keyPath: "id" });
      if (!database.objectStoreNames.contains("syncEvents")) database.createObjectStore("syncEvents", { keyPath: "id", autoIncrement: true });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

const requestResult = <T>(request: IDBRequest<T>) => new Promise<T>((resolve, reject) => {
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error);
});

export const journalRecoverySnapshot = (snapshot: RecoverySnapshot) => serializeWrite(async () => {
  const database = await openJournal();
  if (!database) return;
  await requestResult(database.transaction("recovery", "readwrite").objectStore("recovery").put(snapshot));
  database.close();
});

export const readJournalRecoverySnapshot = async (boardId: string): Promise<RecoverySnapshot | null> => {
  await flushOfflineJournal();
  const database = await openJournal();
  if (!database) return null;
  const value = await requestResult(database.transaction("recovery").objectStore("recovery").get(boardId));
  database.close();
  const snapshot = value as RecoverySnapshot | undefined;
  return snapshot && Array.isArray(snapshot.baseShapes) && Array.isArray(snapshot.shapes) ? snapshot : null;
};

export const deleteJournalRecoverySnapshot = (boardId: string) => serializeWrite(async () => {
  const database = await openJournal();
  if (!database) return;
  await requestResult(database.transaction("recovery", "readwrite").objectStore("recovery").delete(boardId));
  database.close();
});

export const journalMutation = (mutation: QueuedBoardMutation) => serializeWrite(async () => {
  const database = await openJournal();
  if (!database) return;
  await requestResult(database.transaction("mutations", "readwrite").objectStore("mutations").put(mutation));
  database.close();
});

export const deleteJournalMutation = (id: string) => serializeWrite(async () => {
  const database = await openJournal();
  if (!database) return;
  await requestResult(database.transaction("mutations", "readwrite").objectStore("mutations").delete(id));
  database.close();
});

export const readJournalMutations = async (): Promise<QueuedBoardMutation[]> => {
  await flushOfflineJournal();
  const database = await openJournal();
  if (!database) return [];
  const values = await requestResult(database.transaction("mutations").objectStore("mutations").getAll());
  database.close();
  return (values as QueuedBoardMutation[]).sort((left, right) => left.createdAt - right.createdAt);
};

export interface OfflineSyncEvent {
  id?: number;
  boardId: string;
  status: "offline" | "replaying" | "synced" | "failed";
  at: number;
  detail?: string;
}

export const recordSyncEvent = (event: OfflineSyncEvent) => serializeWrite(async () => {
  const database = await openJournal();
  if (!database) return;
  await requestResult(database.transaction("syncEvents", "readwrite").objectStore("syncEvents").add(event));
  database.close();
});

export const readSyncEvents = async (boardId: string, limit = 20): Promise<OfflineSyncEvent[]> => {
  await flushOfflineJournal();
  const database = await openJournal();
  if (!database) return [];
  const values = await requestResult(database.transaction("syncEvents").objectStore("syncEvents").getAll());
  database.close();
  return (values as OfflineSyncEvent[])
    .filter((event) => event.boardId === boardId)
    .sort((left, right) => right.at - left.at)
    .slice(0, Math.max(0, limit));
};
