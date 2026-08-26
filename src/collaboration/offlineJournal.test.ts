import {
  deleteJournalMutation,
  deleteJournalRecoverySnapshot,
  journalMutation,
  journalRecoverySnapshot,
  readJournalMutations,
  readJournalRecoverySnapshot,
  readSyncEvents,
  recordSyncEvent,
} from "./offlineJournal";

interface FakeRequest<T = unknown> {
  result: T;
  error: Error | null;
  onsuccess: (() => void) | null;
  onerror: (() => void) | null;
  onupgradeneeded?: (() => void) | null;
}

const asyncRequest = <T,>(result: T, error: Error | null = null): FakeRequest<T> => {
  const request: FakeRequest<T> = { result, error, onsuccess: null, onerror: null };
  queueMicrotask(() => error ? request.onerror?.() : request.onsuccess?.());
  return request;
};

const fakeIndexedDb = () => {
  const stores = new Map<string, Map<IDBValidKey, unknown>>();
  const names = new Set<string>();
  let operationError: Error | null = null;
  let openError: Error | null = null;
  const close = vi.fn();
  const database = {
    objectStoreNames: { contains: (name: string) => names.has(name) },
    createObjectStore: (name: string) => { names.add(name); stores.set(name, new Map()); },
    transaction: (storeName: string) => ({ objectStore: () => ({
      put: (value: Record<string, unknown>) => {
        const key = storeName === "recovery" ? value.boardId : value.id;
        if (key !== undefined) stores.get(storeName)?.set(key as IDBValidKey, value);
        return asyncRequest(key, operationError);
      },
      get: (key: IDBValidKey) => asyncRequest(stores.get(storeName)?.get(key), operationError),
      delete: (key: IDBValidKey) => {
        stores.get(storeName)?.delete(key);
        return asyncRequest(undefined, operationError);
      },
      getAll: () => asyncRequest([...(stores.get(storeName)?.values() ?? [])], operationError),
      add: (value: unknown) => {
        const store = stores.get(storeName)!;
        store.set(store.size + 1, value);
        return asyncRequest(store.size, operationError);
      },
    }) }),
    close,
  };
  const indexed = {
    open: () => {
      const request: FakeRequest<typeof database> = { result: database, error: openError, onsuccess: null, onerror: null, onupgradeneeded: null };
      queueMicrotask(() => {
        if (openError) request.onerror?.();
        else {
          request.onupgradeneeded?.();
          request.onsuccess?.();
        }
      });
      return request;
    },
  };
  return {
    indexed,
    close,
    stores,
    setOperationError: (error: Error | null) => { operationError = error; },
    setOpenError: (error: Error | null) => { openError = error; },
  };
};

describe("IndexedDB offline journal", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("persists, validates, sorts, and removes recovery and mutation records", async () => {
    const fake = fakeIndexedDb();
    vi.stubGlobal("indexedDB", fake.indexed);
    const snapshot = { boardId: "board", savedAt: 1, baseRevision: 0, backgroundColor: "#000", baseBackgroundColor: "#000", baseShapes: [], shapes: [] };
    await journalRecoverySnapshot(snapshot);
    await expect(readJournalRecoverySnapshot("board")).resolves.toEqual(snapshot);
    fake.stores.get("recovery")?.set("invalid", { boardId: "invalid", shapes: null });
    await expect(readJournalRecoverySnapshot("invalid")).resolves.toBeNull();
    await deleteJournalRecoverySnapshot("board");
    await expect(readJournalRecoverySnapshot("board")).resolves.toBeNull();

    await journalMutation({ id: "later", boardId: "board", createdAt: 2, kind: "settings", payload: {} });
    await journalMutation({ id: "earlier", boardId: "board", createdAt: 1, kind: "settings", payload: {} });
    await expect(readJournalMutations()).resolves.toEqual([expect.objectContaining({ id: "earlier" }), expect.objectContaining({ id: "later" })]);
    await deleteJournalMutation("earlier");
    await expect(readJournalMutations()).resolves.toEqual([expect.objectContaining({ id: "later" })]);
    await recordSyncEvent({ boardId: "board", status: "synced", at: 3, detail: "done" });
    await recordSyncEvent({ boardId: "other", status: "failed", at: 8 });
    await recordSyncEvent({ boardId: "board", status: "offline", at: 5 });
    expect(fake.stores.get("syncEvents")?.size).toBe(3);
    await expect(readSyncEvents("board", 1)).resolves.toEqual([{ boardId: "board", status: "offline", at: 5 }]);
    expect(fake.close).toHaveBeenCalled();
  });

  it("degrades to no-op values without IndexedDB", async () => {
    vi.stubGlobal("indexedDB", undefined);
    const snapshot = { boardId: "board", savedAt: 1, baseRevision: 0, backgroundColor: "#000", baseBackgroundColor: "#000", baseShapes: [], shapes: [] };
    await expect(journalRecoverySnapshot(snapshot)).resolves.toBeUndefined();
    await expect(readJournalRecoverySnapshot("board")).resolves.toBeNull();
    await expect(deleteJournalRecoverySnapshot("board")).resolves.toBeUndefined();
    await expect(journalMutation({ id: "one", boardId: "board", createdAt: 1, kind: "settings", payload: {} })).resolves.toBeUndefined();
    await expect(deleteJournalMutation("one")).resolves.toBeUndefined();
    await expect(readJournalMutations()).resolves.toEqual([]);
    await expect(recordSyncEvent({ boardId: "board", status: "offline", at: 1 })).resolves.toBeUndefined();
    await expect(readSyncEvents("board")).resolves.toEqual([]);
  });

  it("serializes a queued write before its delete so completed replays cannot resurrect", async () => {
    const fake = fakeIndexedDb();
    vi.stubGlobal("indexedDB", fake.indexed);
    const write = journalMutation({ id: "race", boardId: "board", createdAt: 1, kind: "settings", payload: {} });
    const deletion = deleteJournalMutation("race");
    await Promise.all([write, deletion]);
    await expect(readJournalMutations()).resolves.toEqual([]);
  });

  it("surfaces database-open and object-request failures", async () => {
    const fake = fakeIndexedDb();
    vi.stubGlobal("indexedDB", fake.indexed);
    fake.setOpenError(new Error("open failed"));
    await expect(readJournalMutations()).rejects.toThrow("open failed");
    fake.setOpenError(null);
    fake.setOperationError(new Error("request failed"));
    await expect(readJournalMutations()).rejects.toThrow("request failed");
    await expect(journalMutation({ id: "failed", boardId: "board", createdAt: 1, kind: "settings", payload: {} })).rejects.toThrow("request failed");
    fake.setOperationError(null);
    await expect(journalMutation({ id: "recovered", boardId: "board", createdAt: 2, kind: "settings", payload: {} })).resolves.toBeUndefined();
  });
});
