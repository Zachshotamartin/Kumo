import { Shape } from "../classes/shape";
import {
  hitTest,
  moveShapesFromBaseline,
  resizeBounds,
  resizeShapesFromBaseline,
  screenToWorld,
  selectionBounds,
  shapesInMarquee,
  zoomAtPoint,
} from "./geometry";
import {
  alignShapes,
  deleteShapes,
  distributeShapes,
  duplicateShapes,
  groupShapes,
  mergeShapeChanges,
  orderShapes,
  patchShapes,
  ungroupShapes,
} from "./commands";
import {
  commitEditorHistory,
  createEditorHistory,
  redoEditorHistory,
  undoEditorHistory,
} from "./history";

const shape = (id: string, x: number, y: number, width = 100, height = 80): Shape => ({
  id,
  type: "rectangle",
  x1: x,
  y1: y,
  x2: x + width,
  y2: y + height,
  width,
  height,
  level: 0,
  zIndex: Number(id.replace(/\D/g, "")) || 1,
  backgroundColor: "#fff",
});

describe("editor geometry", () => {
  it("converts screen coordinates using a conventional zoom scale", () => {
    expect(screenToWorld({ x: 210, y: 120 }, { left: 10, top: 20 } as DOMRect, { x: 50, y: 30, zoom: 2 }))
      .toEqual({ x: 150, y: 80 });
  });

  it("keeps the world point beneath the cursor fixed while zooming", () => {
    const next = zoomAtPoint({ x: 0, y: 0, zoom: 1 }, { x: 200, y: 100 }, 2);
    expect(next).toEqual({ x: 100, y: 50, zoom: 2 });
  });

  it("hit-tests topmost shapes and respects ellipse geometry", () => {
    const bottom = shape("1", 0, 0);
    const top = { ...shape("2", 10, 10), type: "ellipse", zIndex: 2 };
    expect(hitTest([bottom, top], { x: 60, y: 50 })?.id).toBe("2");
    expect(hitTest([top], { x: 11, y: 11 })).toBeUndefined();
  });

  it("selects every intersecting unlocked shape in a marquee", () => {
    const locked = { ...shape("3", 40, 40), locked: true };
    expect(shapesInMarquee([shape("1", 0, 0), shape("2", 200, 200), locked], { x: 20, y: 20 }, { x: 70, y: 70 }))
      .toEqual(["1"]);
  });

  it("moves from an immutable baseline and snaps the delta", () => {
    const baseline = [shape("1", 10, 10), shape("2", 40, 40)];
    const moved = moveShapesFromBaseline(baseline, ["1"], { x: 13, y: 17 }, 8);
    expect(moved[0]!.x1).toBe(26);
    expect(moved[0]!.y1).toBe(26);
    expect(baseline[0]!.x1).toBe(10);
    expect(moved[1]).toBe(baseline[1]);
  });

  it("resizes a multi-selection proportionally from its baseline", () => {
    const baseline = [shape("1", 0, 0, 100, 100), shape("2", 100, 0, 100, 100)];
    const original = selectionBounds(baseline, ["1", "2"]);
    expect(original).not.toBeNull();
    const nextBounds = resizeBounds(original!, "se", { x: 400, y: 200 });
    const resized = resizeShapesFromBaseline(baseline, ["1", "2"], original!, nextBounds);
    expect(resized[0]!.width).toBe(200);
    expect(resized[1]!.x1).toBe(200);
    expect(resized[1]!.width).toBe(200);
  });
});

describe("editor commands", () => {
  it("patches in place without reordering shapes", () => {
    const shapes = [shape("1", 0, 0), shape("2", 100, 0)];
    const next = patchShapes(shapes, ["1"], { backgroundColor: "#f00" });
    expect(next.map((item) => item.id)).toEqual(["1", "2"]);
    expect(next[0]!.backgroundColor).toBe("#f00");
  });

  it("deletes selected unlocked shapes", () => {
    expect(deleteShapes([shape("1", 0, 0), shape("2", 0, 0)], ["1"]).map((item) => item.id))
      .toEqual(["2"]);
  });

  it("duplicates with new stable ids and offsets", () => {
    const original = shape("1", 10, 20);
    const result = duplicateShapes([original], ["1"]);
    expect(result.shapes).toHaveLength(2);
    expect(result.duplicatedIds[0]).not.toBe("1");
    expect(result.shapes[1]!.x1).toBe(26);
  });

  it("orders selected shapes without losing relative order", () => {
    const shapes = [shape("1", 0, 0), shape("2", 0, 0), shape("3", 0, 0)];
    expect(orderShapes(shapes, ["1", "2"], "front").sort((a, b) => a.zIndex - b.zIndex).map((item) => item.id))
      .toEqual(["3", "1", "2"]);
  });

  it("aligns, distributes, groups, and ungroups selections", () => {
    const shapes = [shape("1", 0, 10, 20), shape("2", 60, 20, 20), shape("3", 140, 30, 20)];
    expect(alignShapes(shapes, ["1", "2"], "top")[1]!.y1).toBe(10);
    expect(distributeShapes(shapes, ["1", "2", "3"], "horizontal")[1]!.x1).toBe(70);
    const grouped = groupShapes(shapes, ["1", "2"], "group");
    expect(grouped[0]!.groupId).toBe("group");
    expect(ungroupShapes(grouped, ["1"])[1]!.groupId).toBeNull();
  });

  it("merges a local shape edit over an unrelated remote edit", () => {
    const baseline = [shape("1", 0, 0), shape("2", 100, 0)];
    const local = [shape("1", 25, 0), baseline[1]!];
    const remote = [baseline[0]!, shape("2", 150, 0), shape("3", 300, 0)];
    const merged = mergeShapeChanges(baseline, local, remote);
    expect(merged.find((item) => item.id === "1")?.x1).toBe(25);
    expect(merged.find((item) => item.id === "2")?.x1).toBe(150);
    expect(merged.find((item) => item.id === "3")?.x1).toBe(300);
  });
});

describe("board-scoped history", () => {
  const snapshot = (boardId: string, x: number) => ({
    boardId,
    backgroundColor: "#313131",
    shapes: [shape("1", x, 0)],
  });

  it("branches after undo and resets when the board changes", () => {
    let history = createEditorHistory(snapshot("a", 0));
    history = commitEditorHistory(history, snapshot("a", 10));
    history = commitEditorHistory(history, snapshot("a", 20));
    history = undoEditorHistory(history);
    expect(history.present.shapes[0]!.x1).toBe(10);
    history = commitEditorHistory(history, snapshot("a", 15));
    expect(history.future).toHaveLength(0);
    expect(redoEditorHistory(history)).toBe(history);
    history = commitEditorHistory(history, snapshot("b", 99));
    expect(history.boardId).toBe("b");
    expect(history.past).toHaveLength(0);
  });
});
