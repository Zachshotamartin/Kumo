import type { Shape } from "../classes/shape";
import {
  clearRecoverySnapshot,
  loadRecoverySnapshot,
  mergeRecoverySnapshot,
  queueBoardMutation,
  queuedMutations,
  recoveryKey,
  removeQueuedMutation,
  replayQueuedMutations,
  saveRecoverySnapshot,
} from "./offlineRecovery";

const shape = (id: string, patch: Partial<Shape> = {}): Shape => ({
  id, type: "rectangle", name: id, x1: 0, y1: 0, x2: 20, y2: 20,
  width: 20, height: 20, level: 0, zIndex: 1, ...patch,
});

describe("offline recovery", () => {
  beforeEach(() => window.localStorage.clear());

  it("persists, validates, and clears board recovery snapshots", () => {
    const snapshot = { boardId: "board", savedAt: 10, baseRevision: 2, backgroundColor: "#000", shapes: [shape("one")] };
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
  });

  it("three-way merges independent fields and reports overlapping edits", () => {
    const base = [shape("one", { name: "Base", backgroundColor: "#000" }), shape("deleted")];
    const remote = [shape("one", { name: "Remote", backgroundColor: "#000" }), shape("deleted")];
    const local = [shape("one", { name: "Local", backgroundColor: "#fff" })];
    const result = mergeRecoverySnapshot(base, remote, local);
    expect(result.shapes.find((candidate) => candidate.id === "one")).toMatchObject({ name: "Local", backgroundColor: "#fff" });
    expect(result.conflicts).toContainEqual({ shapeId: "one", fields: ["name"] });
    expect(result.shapes.some((candidate) => candidate.id === "deleted")).toBe(true);
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
});
