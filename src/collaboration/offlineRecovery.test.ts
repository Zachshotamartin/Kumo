import type { Shape } from "../classes/shape";
import {
  clearRecoverySnapshot,
  hydrateQueuedMutations,
  hydrateRecoverySnapshot,
  loadRecoverySnapshot,
  mergeRecoverySnapshot,
  resolveRecoveryConflicts,
  queueBoardMutation,
  queuedMutations,
  recoveryKey,
  removeQueuedMutation,
  replayQueuedMutations,
  saveRecoverySnapshot,
} from "./offlineRecovery";

const journalMocks = vi.hoisted(() => ({
  journalRecoverySnapshot: vi.fn(),
  deleteJournalRecoverySnapshot: vi.fn(),
  journalMutation: vi.fn(),
  deleteJournalMutation: vi.fn(),
  readJournalMutations: vi.fn(),
  readJournalRecoverySnapshot: vi.fn(),
}));

vi.mock("./offlineJournal", () => journalMocks);

const shape = (id: string, patch: Partial<Shape> = {}): Shape => ({
  id, type: "rectangle", name: id, x1: 0, y1: 0, x2: 20, y2: 20,
  width: 20, height: 20, level: 0, zIndex: 1, ...patch,
});

describe("offline recovery", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.clearAllMocks();
    journalMocks.journalRecoverySnapshot.mockResolvedValue(undefined);
    journalMocks.deleteJournalRecoverySnapshot.mockResolvedValue(undefined);
    journalMocks.journalMutation.mockResolvedValue(undefined);
    journalMocks.deleteJournalMutation.mockResolvedValue(undefined);
    journalMocks.readJournalMutations.mockResolvedValue([]);
    journalMocks.readJournalRecoverySnapshot.mockResolvedValue(null);
  });

  it("persists, validates, and clears board recovery snapshots", () => {
    const snapshot = { boardId: "board", savedAt: 10, baseRevision: 2, baseBackgroundColor: "#111", backgroundColor: "#000", baseShapes: [shape("base")], shapes: [shape("one")] };
    saveRecoverySnapshot(snapshot);
    expect(recoveryKey("board")).toBe("kumo:recovery:board");
    expect(loadRecoverySnapshot("board")).toEqual(snapshot);
    expect(loadRecoverySnapshot("other")).toBeNull();
    window.localStorage.setItem(recoveryKey("broken"), "not-json");
    expect(loadRecoverySnapshot("broken")).toBeNull();
    window.localStorage.setItem(recoveryKey("invalid"), JSON.stringify({ boardId: "invalid", shapes: null }));
    expect(loadRecoverySnapshot("invalid")).toBeNull();
    clearRecoverySnapshot("board");
    expect(loadRecoverySnapshot("board")).toBeNull();
  });

  it("queues unique settings mutations and removes them deterministically", () => {
    const first = { id: "one", boardId: "board", createdAt: 1, kind: "settings" as const, payload: { title: "First" } };
    queueBoardMutation(first);
    queueBoardMutation({ ...first, payload: { title: "Latest" } });
    queueBoardMutation({ id: "two", boardId: "board", createdAt: 2, kind: "settings", payload: { visibility: "public" } });
    expect(queuedMutations()).toHaveLength(2);
    expect(queuedMutations()[0]?.payload).toEqual({ title: "Latest" });
    removeQueuedMutation("one");
    expect(queuedMutations().map((mutation) => mutation.id)).toEqual(["two"]);
    window.localStorage.setItem("kumo:offline-queue", "bad-json");
    expect(queuedMutations()).toEqual([]);
    window.localStorage.setItem("kumo:offline-queue", JSON.stringify({ invalid: true }));
    expect(queuedMutations()).toEqual([]);
  });

  it("three-way merges independent fields and reports overlapping edits", () => {
    const base = [shape("one", { name: "Base", backgroundColor: "#000" }), shape("deleted")];
    const remote = [shape("one", { name: "Remote", backgroundColor: "#000" }), shape("deleted")];
    const local = [shape("one", { name: "Local", backgroundColor: "#fff" })];
    const result = mergeRecoverySnapshot(base, remote, local);
    expect(result.shapes.find((candidate) => candidate.id === "one")).toMatchObject({ name: "Remote", backgroundColor: "#fff" });
    expect(result.conflicts).toContainEqual({ shapeId: "one", fields: ["name"] });
    expect(result.shapes.some((candidate) => candidate.id === "deleted")).toBe(false);
  });

  it("keeps remote values by default and applies explicit per-object recovery choices", () => {
    const base = [shape("one", { name: "Base" }), shape("delete-conflict")];
    const remote = [shape("one", { name: "Remote" }), shape("delete-conflict", { x1: 5 })];
    const local = [shape("one", { name: "Local" })];
    const merged = mergeRecoverySnapshot(base, remote, local);
    expect(merged.shapes.find((candidate) => candidate.id === "one")?.name).toBe("Remote");
    expect(resolveRecoveryConflicts(merged, remote, local, { one: "local", "delete-conflict": "local" })).toEqual([expect.objectContaining({ id: "one", name: "Local" })]);
    expect(resolveRecoveryConflicts(merged, remote, local, {})).toEqual(expect.arrayContaining([expect.objectContaining({ id: "one", name: "Remote" }), expect.objectContaining({ id: "delete-conflict" })]));
  });

  it("handles remote deletions, divergent additions, and clean mutual deletions", () => {
    const base = [shape("changed"), shape("gone")];
    const local = [shape("changed", { x1: 10 }), shape("new", { name: "Local" })];
    const remote = [shape("new", { name: "Remote" })];
    const result = mergeRecoverySnapshot(base, remote, local);
    expect(result.conflicts).toEqual(expect.arrayContaining([
      { shapeId: "changed", fields: ["__deleted"] },
      { shapeId: "new", fields: ["__shape"] },
    ]));
    expect(result.shapes.some((candidate) => candidate.id === "gone")).toBe(false);
    const equalAddition = shape("equal");
    expect(mergeRecoverySnapshot([], [equalAddition], [equalAddition]).conflicts).toEqual([]);
    expect(mergeRecoverySnapshot([], [], [shape("local-only")]).shapes).toHaveLength(1);
    expect(mergeRecoverySnapshot([], [shape("remote-only")], []).shapes).toHaveLength(1);
    expect(mergeRecoverySnapshot([shape("unchanged")], [shape("unchanged")], []).conflicts).toEqual([]);
    expect(mergeRecoverySnapshot([shape("remote-deleted")], [], [shape("remote-deleted")]).conflicts).toEqual([]);
    expect(mergeRecoverySnapshot(
      [shape("independent", { name: "Base", backgroundColor: "#000" })],
      [shape("independent", { name: "Remote", backgroundColor: "#000" })],
      [shape("independent", { name: "Base", backgroundColor: "#fff" })]
    ).conflicts).toEqual([]);
  });

  it("replays in order, removes successful work, and retains failures", async () => {
    queueBoardMutation({ id: "ok", boardId: "board", createdAt: 1, kind: "settings", payload: { title: "Saved" } });
    queueBoardMutation({ id: "fail", boardId: "board", createdAt: 2, kind: "settings", payload: { title: "Retry" } });
    const send = vi.fn(async (mutation: { id: string }) => {
      if (mutation.id === "fail") throw new Error("offline");
    });
    const failures = await replayQueuedMutations(send);
    expect(send).toHaveBeenCalledTimes(2);
    expect(failures).toHaveLength(1);
    expect(failures[0]?.mutation.id).toBe("fail");
    expect(queuedMutations().map((mutation) => mutation.id)).toEqual(["fail"]);
  });

  it("hydrates snapshots and mutation queues from cache or the durable journal", async () => {
    const snapshot = { boardId: "board", savedAt: 10, baseRevision: 2, baseBackgroundColor: "#111", backgroundColor: "#000", baseShapes: [shape("base")], shapes: [shape("one")] };
    saveRecoverySnapshot(snapshot);
    await expect(hydrateRecoverySnapshot("board")).resolves.toEqual(snapshot);
    expect(journalMocks.readJournalRecoverySnapshot).toHaveBeenCalledWith("board");

    window.localStorage.clear();
    journalMocks.readJournalRecoverySnapshot.mockResolvedValueOnce(snapshot);
    await expect(hydrateRecoverySnapshot("board")).resolves.toEqual(snapshot);
    expect(loadRecoverySnapshot("board")).toEqual(snapshot);

    window.localStorage.clear();
    journalMocks.readJournalRecoverySnapshot.mockRejectedValueOnce(new Error("journal failed"));
    await expect(hydrateRecoverySnapshot("board")).resolves.toBeNull();

    saveRecoverySnapshot({ ...snapshot, savedAt: 20 });
    journalMocks.readJournalRecoverySnapshot.mockResolvedValueOnce({ ...snapshot, savedAt: 30 });
    await expect(hydrateRecoverySnapshot("board")).resolves.toMatchObject({ savedAt: 30 });
    journalMocks.readJournalRecoverySnapshot.mockResolvedValueOnce({ ...snapshot, savedAt: 10 });
    await expect(hydrateRecoverySnapshot("board")).resolves.toMatchObject({ savedAt: 30 });

    const mutation = { id: "one", boardId: "board", createdAt: 1, kind: "settings" as const, payload: { title: "Saved" } };
    queueBoardMutation(mutation);
    await expect(hydrateQueuedMutations()).resolves.toEqual([mutation]);
    expect(journalMocks.readJournalMutations).toHaveBeenCalled();

    window.localStorage.clear();
    journalMocks.readJournalMutations.mockResolvedValueOnce([mutation]);
    await expect(hydrateQueuedMutations()).resolves.toEqual([mutation]);
    expect(queuedMutations()).toEqual([mutation]);

    window.localStorage.clear();
    journalMocks.readJournalMutations.mockRejectedValueOnce(new Error("journal failed"));
    await expect(hydrateQueuedMutations()).resolves.toEqual([]);

    window.localStorage.setItem("kumo:offline-queue", JSON.stringify([{ ...mutation, createdAt: 5 }, { ...mutation, id: "two", createdAt: 1 }]));
    journalMocks.readJournalMutations.mockResolvedValueOnce([{ ...mutation, createdAt: 4 }, { ...mutation, id: "two", createdAt: 2 }]);
    await expect(hydrateQueuedMutations()).resolves.toEqual([expect.objectContaining({ id: "two", createdAt: 2 }), expect.objectContaining({ id: "one", createdAt: 5 })]);

    vi.stubGlobal("window", undefined);
    journalMocks.readJournalMutations.mockResolvedValueOnce([mutation]);
    await expect(hydrateQueuedMutations()).resolves.toEqual([mutation]);
    vi.unstubAllGlobals();
  });

  it("degrades when browser access to localStorage throws", () => {
    const descriptor = Object.getOwnPropertyDescriptor(window, "localStorage")!;
    Object.defineProperty(window, "localStorage", { configurable: true, get: () => { throw new DOMException("blocked"); } });
    try {
      expect(loadRecoverySnapshot("board")).toBeNull();
      expect(queuedMutations()).toEqual([]);
    } finally {
      Object.defineProperty(window, "localStorage", descriptor);
    }
  });

  it("contains all asynchronous journal failures behind local recovery operations", async () => {
    const snapshot = { boardId: "board", savedAt: 1, baseRevision: 0, baseBackgroundColor: "#000", backgroundColor: "#000", baseShapes: [], shapes: [] };
    journalMocks.journalRecoverySnapshot.mockRejectedValueOnce(new Error("save failed"));
    saveRecoverySnapshot(snapshot);
    journalMocks.deleteJournalRecoverySnapshot.mockRejectedValueOnce(new Error("delete failed"));
    clearRecoverySnapshot("board");
    journalMocks.journalMutation.mockRejectedValueOnce(new Error("queue failed"));
    queueBoardMutation({ id: "one", boardId: "board", createdAt: 1, kind: "settings", payload: {} });
    journalMocks.deleteJournalMutation.mockRejectedValueOnce(new Error("remove failed"));
    removeQueuedMutation("one");
    await Promise.resolve();
    await Promise.resolve();
    expect(queuedMutations()).toEqual([]);
  });

  it("keeps durable journaling active when browser local storage is unavailable", async () => {
    vi.stubGlobal("window", undefined);
    const snapshot = { boardId: "board", savedAt: 1, baseRevision: 0, baseBackgroundColor: "#000", backgroundColor: "#000", baseShapes: [], shapes: [] };
    await expect(saveRecoverySnapshot(snapshot)).resolves.toBeUndefined();
    expect(loadRecoverySnapshot("board")).toBeNull();
    await expect(clearRecoverySnapshot("board")).resolves.toBeUndefined();
    expect(queuedMutations()).toEqual([]);
    await expect(queueBoardMutation({ id: "one", boardId: "board", createdAt: 1, kind: "settings", payload: {} })).resolves.toBeUndefined();
    await expect(removeQueuedMutation("one")).resolves.toBeUndefined();
    expect(journalMocks.journalMutation).toHaveBeenCalled();
    expect(journalMocks.deleteJournalMutation).toHaveBeenCalledWith("one");
    vi.unstubAllGlobals();
  });
});
