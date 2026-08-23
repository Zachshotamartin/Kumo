import type { Shape } from "../classes/shape";
import {
  alignShapes,
  copyShapes,
  deleteShapes,
  duplicateShapes,
  frameShapes,
  groupShapes,
  moveShapesRelative,
  orderShapes,
  pasteShapes,
  patchShapes,
  unframeShapes,
} from "./commands";
import {
  hitTest,
  moveShapesFromBaseline,
  normalizeShape,
  resizeSelectionFromPointer,
  selectionFrame,
  shapesInMarquee,
} from "./geometry";
import {
  adoptContainedShapes,
  ancestorsOf,
  descendantIds,
  frameAtPoint,
  isEffectivelyHidden,
  isEffectivelyLocked,
  reparentAfterMove,
  rootSelectionIds,
  topLevelFrameFor,
} from "./hierarchy";
import {
  frameClipInsets,
  snapMoveToObjects,
  snapResizePointerToObjects,
} from "./snapping";

const rectangle = (
  id: string,
  x: number,
  y: number,
  width = 100,
  height = 80,
  extra: Partial<Shape> = {}
): Shape => normalizeShape({
  id,
  type: "rectangle",
  name: id,
  x1: x,
  y1: y,
  x2: x + width,
  y2: y + height,
  width,
  height,
  level: 0,
  zIndex: Number(id.replace(/\D/g, "")) || 1,
  backgroundColor: "#fff",
  ...extra,
});

const frame = (
  id: string,
  x: number,
  y: number,
  width = 300,
  height = 240,
  extra: Partial<Shape> = {}
): Shape => rectangle(id, x, y, width, height, {
  type: "frame",
  name: `Frame ${id}`,
  clipContent: true,
  backgroundColor: "transparent",
  ...extra,
});

describe("frame hierarchy and contextual selection", () => {
  it("walks nested ancestry, roots, descendants, and the outer canvas frame", () => {
    const outer = frame("f1", 0, 0);
    const inner = frame("f2", 20, 20, 200, 160, { parentId: outer.id });
    const child = rectangle("c1", 40, 40, 20, 20, { parentId: inner.id });
    const shapes = [outer, inner, child];

    expect(ancestorsOf(shapes, child.id).map((shape) => shape.id)).toEqual([inner.id, outer.id]);
    expect(descendantIds(shapes, [outer.id])).toEqual(new Set([inner.id, child.id]));
    expect(rootSelectionIds(shapes, [outer.id, child.id])).toEqual([outer.id]);
    expect(topLevelFrameFor(shapes, child)?.id).toBe(outer.id);
    expect(frameAtPoint(shapes, { x: 50, y: 50 })?.id).toBe(inner.id);
  });

  it("inherits visibility and locking and removes locked descendants from canvas hit tests", () => {
    const parent = frame("f1", 0, 0, 200, 200, { locked: true });
    const child = rectangle("c1", 20, 20, 50, 50, { parentId: parent.id, zIndex: 2 });
    expect(isEffectivelyLocked([parent, child], child)).toBe(true);
    expect(hitTest([parent, child], { x: 30, y: 30 })).toBeUndefined();

    const hiddenParent = { ...parent, locked: false, hidden: true };
    expect(isEffectivelyHidden([hiddenParent, child], child)).toBe(true);
  });

  it("selects only top-level objects in a normal marquee and nested objects with deep select", () => {
    const parent = frame("f1", 0, 0, 200, 200);
    const child = rectangle("c1", 20, 20, 50, 50, { parentId: parent.id, zIndex: 2 });
    expect(shapesInMarquee([parent, child], { x: 10, y: 10 }, { x: 100, y: 100 }))
      .toEqual([parent.id]);
    expect(shapesInMarquee([parent, child], { x: 10, y: 10 }, { x: 100, y: 100 }, true))
      .toEqual([parent.id, child.id]);
  });

  it("reparents a smaller moved object into the smallest frame and resolves z-order", () => {
    const parent = frame("f1", 100, 100, 300, 240, { zIndex: 5 });
    const existing = rectangle("c1", 130, 130, 40, 40, { parentId: parent.id, zIndex: 8 });
    const moved = rectangle("m1", 180, 180, 60, 40, { zIndex: 2 });
    const next = reparentAfterMove([moved, parent, existing], [moved.id]);
    const result = next.find((shape) => shape.id === moved.id)!;
    expect(result.parentId).toBe(parent.id);
    expect(result.x1).toBe(180);
    expect(result.zIndex).toBeGreaterThan(existing.zIndex);
  });

  it("does not reparent an oversized object or when Space preserves its current parent", () => {
    const parent = frame("f1", 100, 100, 100, 100);
    const tooLarge = rectangle("m1", 80, 80, 160, 160);
    expect(reparentAfterMove([tooLarge, parent], [tooLarge.id]).find((shape) => shape.id === tooLarge.id)?.parentId)
      .toBeNull();

    const child = rectangle("c1", 300, 300, 20, 20, { parentId: parent.id });
    expect(reparentAfterMove([parent, child], [child.id], true)).toEqual([parent, child]);
  });

  it("adopts contained siblings when a frame is drawn around them", () => {
    const child = rectangle("c1", 20, 20, 30, 30, { zIndex: 4 });
    const outside = rectangle("c2", 300, 300, 30, 30, { zIndex: 5 });
    const parent = frame("f1", 0, 0, 100, 100, { zIndex: 6 });
    const result = adoptContainedShapes([child, outside, parent], parent.id);
    expect(result.find((shape) => shape.id === child.id)?.parentId).toBe(parent.id);
    expect(result.find((shape) => shape.id === outside.id)?.parentId).toBeNull();
    expect(result.find((shape) => shape.id === parent.id)!.zIndex).toBeLessThan(child.zIndex);
  });
});

describe("frame-aware editing commands", () => {
  it("frames and unframes a selection without changing world coordinates", () => {
    const first = rectangle("c1", 10, 20, 30, 40, { zIndex: 2 });
    const second = rectangle("c2", 80, 60, 20, 30, { zIndex: 3 });
    const framed = frameShapes([first, second], [first.id, second.id]);
    const created = framed.shapes.find((shape) => shape.id === framed.frameId)!;
    expect(created.type).toBe("frame");
    expect([created.x1, created.y1, created.x2, created.y2]).toEqual([10, 20, 100, 90]);
    expect(framed.shapes.filter((shape) => shape.id !== created.id).every((shape) => shape.parentId === created.id)).toBe(true);

    const removed = unframeShapes(framed.shapes, [created.id]);
    expect(removed.shapes.find((shape) => shape.id === created.id)).toBeUndefined();
    expect(removed.shapes.every((shape) => shape.parentId === null)).toBe(true);
    expect(removed.selectedIds).toEqual([first.id, second.id]);
  });

  it("copies frame descendants, remaps parent ids, and selects only pasted roots", () => {
    const parent = frame("f1", 0, 0, 200, 160, { zIndex: 1 });
    const child = rectangle("c1", 20, 30, 40, 50, { parentId: parent.id, zIndex: 2 });
    const clipboard = copyShapes([parent, child], [parent.id]);
    expect(clipboard.map((shape) => shape.id)).toEqual([parent.id, child.id]);

    const pasted = pasteShapes([parent, child], clipboard, 24);
    const pastedFrame = pasted.pasted.find((shape) => shape.type === "frame")!;
    const pastedChild = pasted.pasted.find((shape) => shape.type !== "frame")!;
    expect(pastedChild.parentId).toBe(pastedFrame.id);
    expect(pasted.pastedIds).toEqual([pastedFrame.id]);
  });

  it("preserves source-frame-relative coordinates when pasting into another frame", () => {
    const sourceFrame = frame("f1", 100, 100, 300, 200);
    const copied = rectangle("c1", 140, 130, 50, 40, { parentId: sourceFrame.id });
    const target = frame("f2", 500, 250, 300, 200, { zIndex: 3 });
    const result = pasteShapes([sourceFrame, copied, target], [copied], {
      context: { targetFrameId: target.id },
      sourceParentBounds: { x: 100, y: 100, width: 300, height: 200 },
    });
    expect(result.pasted[0]?.parentId).toBe(target.id);
    expect([result.pasted[0]?.x1, result.pasted[0]?.y1]).toEqual([540, 280]);
  });

  it("centers only an axis that cannot preserve its source-frame coordinate", () => {
    const target = frame("f2", 500, 250, 100, 100);
    const copied = rectangle("c1", 180, 110, 50, 20, { parentId: "source" });
    const result = pasteShapes([target], [copied], {
      context: { targetFrameId: target.id },
      sourceParentBounds: { x: 100, y: 100, width: 200, height: 100 },
    });
    expect(result.pasted[0]?.x1).toBe(525);
    expect(result.pasted[0]?.y1).toBe(260);
  });

  it("pastes bounds at the cursor and chooses the smallest destination frame", () => {
    const outer = frame("f1", 0, 0, 300, 300);
    const inner = frame("f2", 40, 40, 150, 150, { parentId: outer.id, zIndex: 2 });
    const copied = rectangle("c1", 400, 400, 20, 30);
    const result = pasteShapes([outer, inner], [copied], {
      context: { point: { x: 75, y: 80 } },
    });
    expect([result.pasted[0]?.x1, result.pasted[0]?.y1]).toEqual([75, 80]);
    expect(result.pasted[0]?.parentId).toBe(inner.id);
  });

  it("keeps visible top-level paste coordinates and centers offscreen clipboard content", () => {
    const visible = rectangle("c1", 20, 30, 20, 20);
    const view = { x: 0, y: 0, width: 200, height: 100 };
    expect(pasteShapes([], [visible], { context: { viewport: view } }).pasted[0]?.x1).toBe(20);

    const offscreen = rectangle("c2", 500, 500, 20, 20);
    const pasted = pasteShapes([], [offscreen], { context: { viewport: view } }).pasted[0]!;
    expect([pasted.x1, pasted.y1]).toEqual([90, 40]);
  });

  it("duplicates a top-level frame beside it and preserves its child hierarchy", () => {
    const parent = frame("f1", 10, 20, 200, 100, { zIndex: 1 });
    const child = rectangle("c1", 20, 30, 20, 20, { parentId: parent.id, zIndex: 2 });
    const result = duplicateShapes([parent, child], [parent.id]);
    const duplicatedFrame = result.duplicated.find((shape) => shape.type === "frame")!;
    const duplicatedChild = result.duplicated.find((shape) => shape.type !== "frame")!;
    expect(duplicatedFrame.x1).toBe(258);
    expect(duplicatedChild.parentId).toBe(duplicatedFrame.id);
    expect(result.duplicatedIds).toEqual([duplicatedFrame.id]);
  });

  it("pastes a copied root frame as a sibling instead of nesting it into the selected frame", () => {
    const parent = frame("f1", 10, 20, 200, 100);
    const child = rectangle("c1", 20, 30, 20, 20, { parentId: parent.id, zIndex: 2 });
    const result = pasteShapes([parent, child], copyShapes([parent, child], [parent.id]), {
      context: {
        targetFrameId: parent.id,
        viewport: { x: 0, y: 0, width: 800, height: 600 },
      },
    });
    const pastedFrame = result.pasted.find((shape) => shape.type === "frame")!;
    expect(pastedFrame.parentId).toBeNull();
    expect(result.pasted.find((shape) => shape.type !== "frame")?.parentId).toBe(pastedFrame.id);
  });

  it("aligns a single child or logical group to its parent frame", () => {
    const parent = frame("f1", 100, 100, 300, 200, { zIndex: 1 });
    const child = rectangle("c1", 160, 150, 50, 40, { parentId: parent.id, zIndex: 2 });
    expect(alignShapes([parent, child], [child.id], "right").find((shape) => shape.id === child.id)?.x1)
      .toBe(350);

    const group = [
      rectangle("g1", 150, 130, 20, 20, { parentId: parent.id, groupId: "g", zIndex: 3 }),
      rectangle("g2", 180, 130, 20, 20, { parentId: parent.id, groupId: "g", zIndex: 4 }),
    ];
    const aligned = alignShapes([parent, ...group], group.map((shape) => shape.id), "left");
    expect(aligned.find((shape) => shape.id === "g1")?.x1).toBe(100);
    expect(aligned.find((shape) => shape.id === "g2")?.x1).toBe(130);
  });

  it("scopes grouping, ordering, and layer drag to siblings", () => {
    const firstFrame = frame("f1", 0, 0);
    const secondFrame = frame("f2", 400, 0);
    const first = rectangle("c1", 10, 10, 20, 20, { parentId: firstFrame.id, zIndex: 2 });
    const second = rectangle("c2", 40, 10, 20, 20, { parentId: firstFrame.id, zIndex: 3 });
    const other = rectangle("c3", 410, 10, 20, 20, { parentId: secondFrame.id, zIndex: 20 });
    const shapes = [firstFrame, first, second, secondFrame, other];

    const ordered = orderShapes(shapes, [first.id], "front");
    expect(ordered.find((shape) => shape.id === other.id)?.zIndex).toBe(20);
    expect(ordered.find((shape) => shape.id === first.id)!.zIndex)
      .toBeGreaterThan(ordered.find((shape) => shape.id === second.id)!.zIndex);
    expect(moveShapesRelative(shapes, [first.id], other.id, "front")).toBe(shapes);
    expect(groupShapes(shapes, [first.id, other.id], "cross-parent")).toBe(shapes);
  });

  it("reorders a frame and its descendants as one contiguous visual stack", () => {
    const backFrame = frame("f1", 0, 0, 100, 100, { zIndex: 1 });
    const backChild = rectangle("c1", 10, 10, 20, 20, { parentId: backFrame.id, zIndex: 2 });
    const frontFrame = frame("f2", 150, 0, 100, 100, { zIndex: 3 });
    const frontChild = rectangle("c2", 160, 10, 20, 20, { parentId: frontFrame.id, zIndex: 4 });
    const reordered = orderShapes([backFrame, backChild, frontFrame, frontChild], [frontFrame.id], "back");
    expect(reordered.map((shape) => shape.id)).toEqual([frontFrame.id, frontChild.id, backFrame.id, backChild.id]);
    expect(reordered.map((shape) => shape.zIndex)).toEqual([1, 2, 3, 4]);
  });

  it("moves and deletes a frame with locked descendants while keeping direct child locks useful", () => {
    const parent = frame("f1", 0, 0, 100, 100);
    const lockedChild = rectangle("c1", 10, 10, 20, 20, { parentId: parent.id, locked: true, zIndex: 2 });
    const moved = moveShapesFromBaseline([parent, lockedChild], [parent.id], { x: 25, y: 30 });
    expect([moved[0]?.x1, moved[1]?.x1, moved[1]?.y1]).toEqual([25, 35, 40]);
    expect(deleteShapes([parent, lockedChild], [lockedChild.id])).toEqual([parent, lockedChild]);
    expect(deleteShapes([parent, lockedChild], [parent.id])).toEqual([]);
  });

  it("does not group a frame with its descendants or relocate mixed-parent duplicates", () => {
    const firstFrame = frame("f1", 0, 0, 100, 100);
    const child = rectangle("c1", 10, 10, 20, 20, { parentId: firstFrame.id, zIndex: 2 });
    expect(groupShapes([firstFrame, child], [firstFrame.id], "bad-group")).toEqual([firstFrame, child]);

    const secondFrame = frame("f2", 200, 0, 100, 100, { zIndex: 3 });
    const other = rectangle("c2", 210, 10, 20, 20, { parentId: secondFrame.id, zIndex: 4 });
    const duplicated = duplicateShapes([firstFrame, child, secondFrame, other], [child.id, other.id], 10);
    expect(duplicated.duplicated.map((shape) => shape.parentId)).toEqual([firstFrame.id, secondFrame.id]);
  });

  it("propagates parent locks to edits, deletion, and frame transforms without rewriting children", () => {
    const parent = frame("f1", 0, 0, 200, 160, { locked: true });
    const child = rectangle("c1", 20, 20, 30, 30, { parentId: parent.id, zIndex: 2 });
    expect(patchShapes([parent, child], [child.id], { backgroundColor: "#f00" })[1]).toBe(child);
    expect(deleteShapes([parent, child], [child.id])).toEqual([parent, child]);
    const selection = selectionFrame([parent, child], [parent.id])!;
    expect(resizeSelectionFromPointer([parent, child], [parent.id], selection, "se", { x: 400, y: 300 }))
      .toEqual([parent, child]);
  });
});

describe("object snapping and frame clipping", () => {
  it("snaps move edges and centers on both axes and emits visible guide geometry", () => {
    const moving = rectangle("c1", 0, 0, 20, 20, { zIndex: 1 });
    const target = rectangle("c2", 100, 80, 40, 40, { zIndex: 2 });
    const snapped = snapMoveToObjects([moving, target], [moving.id], { x: 79, y: 59 }, 3);
    expect(snapped.delta).toEqual({ x: 80, y: 60 });
    expect(snapped.guides.map((guide) => guide.axis).sort()).toEqual(["x", "y"]);
  });

  it("snaps resize pointers and excludes objects in another frame hierarchy", () => {
    const firstFrame = frame("f1", 0, 0, 200, 200);
    const moving = rectangle("c1", 20, 20, 20, 20, { parentId: firstFrame.id, zIndex: 2 });
    const sibling = rectangle("c2", 100, 80, 30, 30, { parentId: firstFrame.id, zIndex: 3 });
    const otherFrame = frame("f2", 400, 0, 200, 200, { zIndex: 4 });
    const other = rectangle("c3", 45, 45, 20, 20, { parentId: otherFrame.id, zIndex: 5 });
    const result = snapResizePointerToObjects(
      [firstFrame, moving, sibling, otherFrame, other],
      [moving.id],
      "se",
      { x: 99, y: 79 },
      3
    );
    expect(result.point).toEqual({ x: 100, y: 80 });
    expect(result.guides).toHaveLength(2);
  });

  it("computes clipping insets for content extending outside a clipping frame", () => {
    const parent = frame("f1", 0, 0, 100, 100);
    const child = rectangle("c1", -10, -10, 130, 130, { parentId: parent.id });
    expect(frameClipInsets([parent, child], child)).toEqual({
      top: 10,
      right: 20,
      bottom: 20,
      left: 10,
    });
    expect(frameClipInsets([{ ...parent, clipContent: false }, child], child)).toBeNull();
  });
});
