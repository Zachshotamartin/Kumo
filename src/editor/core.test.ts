import { Shape } from "../classes/shape";
import {
  clampZoom,
  hitTest,
  moveShapesFromBaseline,
  effectiveGridSize,
  resizeBounds,
  resizeSelectionFromPointer,
  resizeShapesFromBaseline,
  resizeTransform,
  rotatePoint,
  rotateShapesFromBaseline,
  screenToWorld,
  selectionBounds,
  selectionFrame,
  shapeBounds,
  shapeVisualBounds,
  shapesInMarquee,
  snapPointToGrid,
  worldToScreen,
  zoomAtPoint,
} from "./geometry";
import {
  alignShapes,
  copyShapes,
  deleteShapes,
  distributeShapes,
  duplicateShapes,
  groupShapes,
  mergeShapeChanges,
  moveShapesRelative,
  orderShapes,
  pasteShapes,
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
    expect(worldToScreen({ x: 200, y: 100 }, next)).toEqual({ x: 200, y: 100 });
    expect(clampZoom(0.01)).toBe(0.1);
    expect(clampZoom(20)).toBe(8);
  });

  it("hit-tests topmost shapes and respects ellipse geometry", () => {
    const bottom = shape("1", 0, 0);
    const top = { ...shape("2", 10, 10), type: "ellipse", zIndex: 2 };
    expect(hitTest([bottom, top], { x: 60, y: 50 })?.id).toBe("2");
    expect(hitTest([top], { x: 11, y: 11 })).toBeUndefined();
  });

  it("hit-tests the same layer that renders on top when z-index values tie", () => {
    const first = { ...shape("1", 0, 0), zIndex: 4 };
    const later = { ...shape("2", 0, 0), zIndex: 4 };
    expect(hitTest([first, later], { x: 50, y: 40 })?.id).toBe("2");
  });

  it("selects intersecting unlocked shapes and expands logical groups", () => {
    const grouped = { ...shape("1", 0, 0), groupId: "group" };
    const lockedMember = { ...shape("3", 200, 200), groupId: "group", locked: true };
    expect(shapesInMarquee([grouped, shape("2", 400, 400), lockedMember], { x: 20, y: 20 }, { x: 70, y: 70 }))
      .toEqual(["1", "3"]);
  });

  it("moves from an immutable baseline and snaps the final position", () => {
    const baseline = [shape("1", 10, 10), shape("2", 40, 40)];
    const moved = moveShapesFromBaseline(baseline, ["1"], { x: 13, y: 17 }, 8);
    expect(moved[0]!.x1).toBe(24);
    expect(moved[0]!.y1).toBe(24);
    expect(baseline[0]!.x1).toBe(10);
    expect(moved[1]).toBe(baseline[1]);
  });

  it("moves and resizes vector points, bezier handles, and boolean source geometry", () => {
    const vector = {
      ...shape("vector", 10, 20, 100, 50),
      type: "vector",
      vectorPoints: [
        { id: "a", x: 10, y: 20, handleOut: { x: 20, y: 25 } },
        { id: "b", x: 110, y: 70, handleIn: { x: 90, y: 65 } },
      ],
    };
    const composite = { ...shape("boolean", 10, 20, 100, 50), type: "boolean", booleanChildren: [vector] };
    const moved = moveShapesFromBaseline([vector, composite], ["vector", "boolean"], { x: 30, y: 40 });
    expect(moved[0]!.vectorPoints?.[0]).toMatchObject({ x: 40, y: 60, handleOut: { x: 50, y: 65 } });
    expect(moved[1]!.booleanChildren?.[0]?.vectorPoints?.[1]).toMatchObject({ x: 140, y: 110, handleIn: { x: 120, y: 105 } });

    const bounds = selectionBounds([vector], [vector.id])!;
    const resized = resizeShapesFromBaseline([vector], [vector.id], bounds, { x: 20, y: 40, width: 200, height: 100 });
    expect(resized[0]!.vectorPoints).toEqual([
      { id: "a", x: 20, y: 40, handleOut: { x: 40, y: 50 } },
      { id: "b", x: 220, y: 140, handleIn: { x: 180, y: 130 } },
    ]);
  });

  it("uses one effective grid increment for rendering and snapping", () => {
    expect(effectiveGridSize(8, 1)).toBe(8);
    expect(effectiveGridSize(8, 0.5)).toBe(16);
    expect(effectiveGridSize(8, 0.2)).toBe(40);
  });

  it("blocks a whole group transform when one member is locked", () => {
    const baseline = [
      { ...shape("1", 0, 0), groupId: "group" },
      { ...shape("2", 100, 0), groupId: "group", locked: true },
    ];
    expect(moveShapesFromBaseline(baseline, ["1"], { x: 20, y: 20 })).toEqual(baseline);
    const frame = selectionFrame(baseline, ["1"]);
    expect(resizeSelectionFromPointer(baseline, ["1"], frame!, "se", { x: 300, y: 200 }))
      .toEqual(baseline);
    expect(rotateShapesFromBaseline(
      baseline,
      ["1"],
      frame!.bounds,
      { x: 100, y: -100 },
      { x: 300, y: 40 }
    )).toEqual(baseline);
  });

  it("snaps drawing points without mutating their input", () => {
    const point = { x: 13, y: -11 };
    expect(snapPointToGrid(point, 8)).toEqual({ x: 16, y: -8 });
    expect(point).toEqual({ x: 13, y: -11 });
  });

  it("moves every nested descendant without mutating the baseline", () => {
    const grandchild = shape("3", 8, 9, 10, 10);
    const child = { ...shape("2", 5, 6, 20, 20), shapes: [grandchild] };
    const parent = { ...shape("1", 0, 0), shapes: [child] };
    const moved = moveShapesFromBaseline([parent], ["1"], { x: 7, y: -3 });
    expect(moved[0]!.shapes?.[0]?.x1).toBe(12);
    expect(moved[0]!.shapes?.[0]?.shapes?.[0]?.y1).toBe(6);
    expect(parent.shapes?.[0]?.x1).toBe(5);
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
    const translated = resizeShapesFromBaseline(
      baseline,
      ["1", "2"],
      original!,
      { x: 50, y: 25, width: 400, height: 200 }
    );
    expect(translated[0]!.x1).toBe(50);
    expect(translated[0]!.y1).toBe(25);
    expect(translated[1]!.x1).toBe(250);
  });

  it.each([
    ["n", { x: 60, y: 110 }, false, true],
    ["ne", { x: 0, y: 110 }, true, true],
    ["e", { x: 0, y: 60 }, true, false],
    ["se", { x: 0, y: 10 }, true, true],
    ["s", { x: 60, y: 10 }, false, true],
    ["sw", { x: 120, y: 10 }, true, true],
    ["w", { x: 120, y: 60 }, true, false],
    ["nw", { x: 120, y: 110 }, true, true],
  ] as const)(
    "reverses through the opposite anchor from the %s handle",
    (handle, pointer, flipX, flipY) => {
      const baseline = [shape("1", 10, 20, 100, 80)];
      const frame = selectionFrame(baseline, ["1"]);
      expect(frame).not.toBeNull();
      const resized = resizeSelectionFromPointer(
        baseline,
        ["1"],
        frame!,
        handle,
        pointer
      );
      expect(resized[0]!.flipX ?? false).toBe(flipX);
      expect(resized[0]!.flipY ?? false).toBe(flipY);
      expect(resized[0]!.width).toBeGreaterThanOrEqual(1);
      expect(resized[0]!.height).toBeGreaterThanOrEqual(1);
      expect(baseline[0]!.flipX).toBeUndefined();
      expect(baseline[0]!.flipY).toBeUndefined();
    }
  );

  it("toggles an existing flip and restores the baseline when the pointer crosses back", () => {
    const baseline = [{ ...shape("1", 0, 0), flipX: true }];
    const frame = selectionFrame(baseline, ["1"]);
    const crossed = resizeSelectionFromPointer(baseline, ["1"], frame!, "e", { x: -50, y: 40 });
    const restored = resizeSelectionFromPointer(baseline, ["1"], frame!, "e", { x: 150, y: 40 });
    expect(crossed[0]!.flipX).toBe(false);
    expect(restored[0]!.flipX).toBe(true);
  });

  it("preserves aspect ratio and flip direction while crossing a corner", () => {
    const original = { x: 0, y: 0, width: 100, height: 80 };
    const transform = resizeTransform(original, "se", { x: -200, y: -20 }, {
      lockAspectRatio: true,
    });
    expect(transform.scaleX).toBe(-2);
    expect(transform.scaleY).toBe(-2);
    expect(transform.bounds.width / transform.bounds.height).toBeCloseTo(1.25);
  });

  it("supports center-resize reversal and grid-snapped handles", () => {
    const original = { x: 0, y: 0, width: 100, height: 80 };
    const centered = resizeTransform(original, "se", { x: 25, y: 20 }, { fromCenter: true });
    expect(centered.scaleX).toBe(-0.5);
    expect(centered.scaleY).toBe(-0.5);
    expect(centered.bounds).toEqual({ x: 25, y: 20, width: 50, height: 40 });
    const snapped = resizeBounds(original, "se", { x: 113, y: 93 }, { gridSize: 10 });
    expect(snapped.x).toBe(0);
    expect(snapped.y).toBe(0);
    expect(snapped.width).toBeCloseTo(110);
    expect(snapped.height).toBeCloseTo(90);
  });

  it("mirrors a multi-selection around the stable opposite corner", () => {
    const baseline = [shape("1", 0, 0, 100, 100), shape("2", 100, 0, 100, 100)];
    const frame = selectionFrame(baseline, ["1", "2"]);
    const resized = resizeSelectionFromPointer(
      baseline,
      ["1", "2"],
      frame!,
      "se",
      { x: -200, y: 100 }
    );
    expect(resized[0]!.x1).toBe(-100);
    expect(resized[1]!.x1).toBe(-200);
    expect(resized.every((item) => item.flipX)).toBe(true);
  });

  it("uses visual bounds for rotated selection and marquee geometry", () => {
    const rotated = { ...shape("1", 0, 0, 100, 50), rotation: 90 };
    const visual = shapeVisualBounds(rotated);
    expect(visual.x).toBeCloseTo(25);
    expect(visual.y).toBeCloseTo(-25);
    expect(visual.width).toBeCloseTo(50);
    expect(visual.height).toBeCloseTo(100);
    expect(selectionBounds([rotated], ["1"])).toEqual(visual);
    expect(selectionFrame([rotated], ["1"])).toEqual({
      bounds: shapeBounds(rotated),
      rotation: 90,
    });
    expect(shapesInMarquee([rotated], { x: 30, y: -20 }, { x: 40, y: -10 }))
      .toEqual(["1"]);
  });

  it("resizes a rotated shape in local axes while keeping the opposite corner fixed", () => {
    const baseline = [{ ...shape("1", 0, 0, 100, 50), rotation: 90 }];
    const frame = selectionFrame(baseline, ["1"]);
    const originalCenter = { x: 50, y: 25 };
    const originalNorthWest = rotatePoint({ x: 0, y: 0 }, originalCenter, 90);
    const resized = resizeSelectionFromPointer(
      baseline,
      ["1"],
      frame!,
      "se",
      { x: 0, y: 125 }
    );
    const nextBounds = shapeBounds(resized[0]!);
    const nextCenter = {
      x: nextBounds.x + nextBounds.width / 2,
      y: nextBounds.y + nextBounds.height / 2,
    };
    const nextNorthWest = rotatePoint(
      { x: nextBounds.x, y: nextBounds.y },
      nextCenter,
      90
    );
    expect(nextBounds.width).toBeCloseTo(150);
    expect(nextBounds.height).toBeCloseTo(75);
    expect(nextNorthWest.x).toBeCloseTo(originalNorthWest.x);
    expect(nextNorthWest.y).toBeCloseTo(originalNorthWest.y);
  });

  it("rotates one or many shapes around the selection center and snaps to 15 degrees", () => {
    const baseline = [shape("1", 0, 0, 100, 80), shape("2", 100, 0, 100, 80)];
    const selection = selectionBounds(baseline, ["1", "2"]);
    const rotated = rotateShapesFromBaseline(
      baseline,
      ["1", "2"],
      selection!,
      { x: 100, y: -60 },
      { x: 200, y: 40 },
      15
    );
    expect(rotated[0]!.rotation).toBe(90);
    expect(rotated[0]!.x1).toBeCloseTo(50);
    expect(rotated[0]!.y1).toBeCloseTo(-50);
    expect(rotated[1]!.x1).toBeCloseTo(50);
    expect(rotated[1]!.y1).toBeCloseTo(50);
  });

  it("rotates embedded legacy children with their parent", () => {
    const parent = { ...shape("parent", 0, 0, 100, 80), type: "group" as const, shapes: [shape("embedded", 10, 10, 20, 20)] };
    const rotated = rotateShapesFromBaseline([parent], [parent.id], shapeBounds(parent), { x: 100, y: 40 }, { x: 50, y: 90 });
    expect(rotated[0]!.shapes?.[0]?.rotation).toBe(90);
  });

  it("snaps the resulting angle instead of only the pointer delta", () => {
    const baseline = [{ ...shape("1", 0, 0, 100, 80), rotation: 7 }];
    const rotated = rotateShapesFromBaseline(
      baseline,
      ["1"],
      shapeBounds(baseline[0]!),
      { x: 100, y: 40 },
      { x: 99.03, y: 49.73 },
      15,
      7
    );
    expect(rotated[0]!.rotation).toBe(15);
  });

  it("retains an oriented frame for a rotated logical group", () => {
    const grouped = [
      { ...shape("1", 0, 0, 100, 50), groupId: "group", groupRotation: 0 },
      { ...shape("2", 120, 0, 100, 50), groupId: "group", groupRotation: 0 },
    ];
    const initial = selectionFrame(grouped, ["1"]);
    const baseline = rotateShapesFromBaseline(
      grouped,
      ["1"],
      initial!.bounds,
      { x: 210, y: 25 },
      { x: 196.6025, y: 75 }
    );
    const frame = selectionFrame(baseline, ["1"]);
    expect(frame?.rotation).toBeCloseTo(30);
    expect(frame?.bounds.width).toBeCloseTo(220);
    expect(frame?.bounds.height).toBeCloseTo(50);
  });

  it("forces uniform scaling when a rotated member cannot represent skew", () => {
    const baseline = [
      { ...shape("1", 0, 0, 100, 100), rotation: 45 },
      shape("2", 150, 0, 100, 100),
    ];
    const frame = selectionFrame(baseline, ["1", "2"]);
    const resized = resizeSelectionFromPointer(
      baseline,
      ["1", "2"],
      frame!,
      "se",
      { x: frame!.bounds.x + frame!.bounds.width * 2, y: frame!.bounds.y + frame!.bounds.height }
    );
    expect(resized[0]!.width / baseline[0]!.width)
      .toBeCloseTo(resized[0]!.height / baseline[0]!.height);
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

  it("deletes an unlocked group atomically and preserves a locked group", () => {
    const group = [
      { ...shape("1", 0, 0), groupId: "group" },
      { ...shape("2", 100, 0), groupId: "group" },
    ];
    expect(deleteShapes(group, ["1"])).toEqual([]);
    const locked = [{ ...group[0]!, locked: true }, group[1]!];
    expect(deleteShapes(locked, ["2"])).toEqual(locked);
  });

  it("can unlock a locked shape but blocks unrelated property changes", () => {
    const locked = { ...shape("1", 0, 0), locked: true };
    expect(patchShapes([locked], ["1"], { locked: false })[0]!.locked).toBe(false);
    expect(patchShapes([locked], ["1"], { backgroundColor: "#f00" })[0])
      .toBe(locked);
  });

  it("duplicates with new stable ids and offsets", () => {
    const original = shape("1", 10, 20);
    const result = duplicateShapes([original], ["1"]);
    expect(result.shapes).toHaveLength(2);
    expect(result.duplicatedIds[0]).not.toBe("1");
    expect(result.shapes[1]!.x1).toBe(26);
  });

  it("copies and pastes a whole group in layer order with fresh ids", () => {
    const first = { ...shape("1", 0, 0), zIndex: 5, groupId: "source-group" };
    const second = { ...shape("2", 100, 0), zIndex: 2, groupId: "source-group" };
    const background = { ...shape("3", 200, 0), zIndex: 8 };
    const clipboard = copyShapes([first, second, background], ["1"]);
    expect(clipboard.map((item) => item.id)).toEqual(["2", "1"]);

    const result = pasteShapes([first, second, background], clipboard);
    expect(result.pasted).toHaveLength(2);
    expect(result.pasted.map((item) => item.id)).not.toContain("1");
    expect(result.pasted.map((item) => item.id)).not.toContain("2");
    expect(new Set(result.pasted.map((item) => item.id)).size).toBe(2);
    expect(result.pasted[0]!.groupId).toBe(result.pasted[1]!.groupId);
    expect(result.pasted[0]!.groupId).not.toBe("source-group");
    expect(result.pasted.map((item) => item.zIndex)).toEqual([9, 10]);
    expect(result.pasted.map((item) => item.x1)).toEqual([124, 24]);
  });

  it("cascades repeated pastes and removes orphan group identities", () => {
    const grouped = { ...shape("1", 10, 20), groupId: "source-group" };
    const firstPaste = pasteShapes([grouped], [grouped]);
    expect(firstPaste.pasted[0]!.groupId).toBeNull();
    expect(firstPaste.pasted[0]!.x1).toBe(34);
    const secondPaste = pasteShapes(firstPaste.shapes, firstPaste.pasted);
    expect(secondPaste.pasted[0]!.x1).toBe(58);
    expect(secondPaste.pasted[0]!.id).not.toBe(firstPaste.pasted[0]!.id);
  });

  it("regenerates ids throughout nested copied content", () => {
    const child = shape("2", 5, 5, 20, 20);
    const parent = { ...shape("1", 0, 0), shapes: [child] };
    const result = pasteShapes([parent], copyShapes([parent], ["1"]));
    expect(result.pasted[0]!.id).not.toBe(parent.id);
    expect(result.pasted[0]!.shapes?.[0]?.id).not.toBe(child.id);
    expect(result.pasted[0]!.shapes?.[0]?.x1).toBe(29);
  });

  it("remaps copied masks, prototype targets, instance links, and vector geometry", () => {
    const component = { ...shape("1", 0, 0), type: "frame", componentDefinition: true };
    const mask = { ...shape("2", 10, 10), parentId: component.id, isMask: true };
    const target = {
      ...shape("3", 20, 20),
      parentId: component.id,
      maskId: mask.id,
      instanceRootId: component.id,
      componentNodeId: mask.id,
      prototypeInteractions: [{ id: "go", trigger: "click" as const, action: "navigate" as const, destinationId: mask.id }],
      vectorPoints: [{ id: "point", x: 20, y: 20, handleOut: { x: 30, y: 20 } }],
    };
    const result = pasteShapes([component, mask, target], copyShapes([component, mask, target], [component.id]), 24);
    const pastedComponent = result.pasted.find((item) => item.type === "frame")!;
    const pastedMask = result.pasted.find((item) => item.isMask)!;
    const pastedTarget = result.pasted.find((item) => item.maskId)!;

    expect(pastedTarget).toMatchObject({
      parentId: pastedComponent.id,
      maskId: pastedMask.id,
      instanceRootId: pastedComponent.id,
      componentNodeId: pastedMask.id,
    });
    expect(pastedTarget.prototypeInteractions?.[0]?.destinationId).toBe(pastedMask.id);
    expect(pastedTarget.prototypeInteractions?.[0]?.id).not.toBe("go");
    expect(pastedTarget.vectorPoints?.[0]).toMatchObject({
      x: 44,
      y: 44,
      handleOut: { x: 54, y: 44 },
    });
    expect(pastedTarget.vectorPoints?.[0]?.id).not.toBe("point");
  });

  it("orders selected shapes without losing relative order", () => {
    const shapes = [shape("1", 0, 0), shape("2", 0, 0), shape("3", 0, 0)];
    expect(orderShapes(shapes, ["1", "2"], "front").sort((a, b) => a.zIndex - b.zIndex).map((item) => item.id))
      .toEqual(["3", "1", "2"]);
  });

  it.each([
    ["front", ["1", "4", "2", "3"]],
    ["forward", ["1", "4", "2", "3"]],
    ["backward", ["2", "3", "1", "4"]],
    ["back", ["2", "3", "1", "4"]],
  ] as const)("reorders grouped layers as an atomic block with %s", (mode, expected) => {
    const shapes = [
      { ...shape("1", 0, 0), zIndex: 1 },
      { ...shape("2", 0, 0), zIndex: 2, groupId: "group" },
      { ...shape("3", 0, 0), zIndex: 3, groupId: "group" },
      { ...shape("4", 0, 0), zIndex: 4 },
    ];
    const reordered = orderShapes(shapes, ["2"], mode);
    expect(reordered.map((item) => item.id)).toEqual(expected);
    expect(reordered.map((item) => item.zIndex)).toEqual([1, 2, 3, 4]);
  });

  it("drops a group directly in front of another logical layer", () => {
    const shapes = [
      { ...shape("1", 0, 0), zIndex: 1, groupId: "moving" },
      { ...shape("2", 0, 0), zIndex: 2, groupId: "moving" },
      { ...shape("3", 0, 0), zIndex: 3 },
      { ...shape("4", 0, 0), zIndex: 4, groupId: "target" },
      { ...shape("5", 0, 0), zIndex: 5, groupId: "target" },
    ];
    const reordered = moveShapesRelative(shapes, ["1"], "4", "front");
    expect(reordered.map((item) => item.id)).toEqual(["3", "4", "5", "1", "2"]);
    expect(reordered.map((item) => item.zIndex)).toEqual([1, 2, 3, 4, 5]);
  });

  it("steps one group past another group without interleaving their members", () => {
    const shapes = [
      { ...shape("1", 0, 0), zIndex: 1, groupId: "back" },
      { ...shape("2", 0, 0), zIndex: 2, groupId: "back" },
      { ...shape("3", 0, 0), zIndex: 3, groupId: "front" },
      { ...shape("4", 0, 0), zIndex: 4, groupId: "front" },
    ];
    const reordered = orderShapes(shapes, ["3"], "backward");
    expect(reordered.map((item) => item.id)).toEqual(["3", "4", "1", "2"]);
    expect(reordered.map((item) => item.groupId)).toEqual(["front", "front", "back", "back"]);
  });

  it("drops a layer directly behind a target group", () => {
    const shapes = [
      { ...shape("1", 0, 0), zIndex: 1 },
      { ...shape("2", 0, 0), zIndex: 2, groupId: "target" },
      { ...shape("3", 0, 0), zIndex: 3, groupId: "target" },
      { ...shape("4", 0, 0), zIndex: 4 },
    ];
    expect(moveShapesRelative(shapes, ["4"], "2", "back").map((item) => item.id))
      .toEqual(["1", "4", "2", "3"]);
  });

  it("does not reorder onto itself, an unknown target, or a locked group", () => {
    const grouped = [
      { ...shape("1", 0, 0), zIndex: 1, groupId: "group", locked: true },
      { ...shape("2", 0, 0), zIndex: 2, groupId: "group" },
      { ...shape("3", 0, 0), zIndex: 3 },
    ];
    expect(moveShapesRelative(grouped, ["1"], "3", "front")).toBe(grouped);
    expect(moveShapesRelative(grouped, ["3"], "missing", "front")).toBe(grouped);
    expect(moveShapesRelative(grouped, ["3"], "3", "back")).toBe(grouped);
  });

  it("does not rewrite z-index values when a reorder cannot move anything", () => {
    const shapes = [
      { ...shape("1", 0, 0), zIndex: 10 },
      { ...shape("2", 0, 0), zIndex: 20 },
    ];
    expect(orderShapes(shapes, [], "front")).toBe(shapes);
    expect(orderShapes(shapes, ["2"], "forward")).toBe(shapes);
  });

  it("aligns, distributes, groups, and ungroups selections", () => {
    const shapes = [shape("1", 0, 10, 20), shape("2", 60, 20, 20), shape("3", 140, 30, 20)];
    expect(alignShapes(shapes, ["1", "2"], "top")[1]!.y1).toBe(10);
    expect(distributeShapes(shapes, ["1", "2", "3"], "horizontal")[1]!.x1).toBe(70);
    const grouped = groupShapes(shapes, ["1", "2"], "group");
    expect(grouped[0]!.groupId).toBe("group");
    expect(grouped[0]!.groupName).toBe("Group");
    const ungrouped = ungroupShapes(grouped, ["1"]);
    expect(ungrouped[1]!.groupId).toBeNull();
    expect(ungrouped[1]!.groupName).toBeUndefined();
  });

  it("aligns and distributes groups as logical units", () => {
    const grouped = [
      { ...shape("1", 0, 0, 20), groupId: "group" },
      { ...shape("2", 40, 0, 20), groupId: "group" },
    ];
    const target = shape("3", 200, 0, 20);
    const aligned = alignShapes([...grouped, target], ["1", "3"], "right");
    expect(aligned[1]!.x1 - aligned[0]!.x1).toBe(40);
    expect(aligned[1]!.x2).toBe(aligned[2]!.x2);

    const middle = shape("4", 110, 0, 20);
    const end = shape("5", 300, 0, 20);
    const distributed = distributeShapes([...grouped, middle, end], ["1", "4", "5"], "horizontal");
    expect(distributed[1]!.x1 - distributed[0]!.x1).toBe(40);
  });

  it("makes newly grouped layers contiguous at the highest selected layer", () => {
    const shapes = [
      { ...shape("1", 0, 0), zIndex: 1 },
      { ...shape("2", 0, 0), zIndex: 2 },
      { ...shape("3", 0, 0), zIndex: 3 },
    ];
    const grouped = groupShapes(shapes, ["1", "3"], "group");
    expect(grouped.map((item) => item.id)).toEqual(["2", "1", "3"]);
    expect(grouped.map((item) => item.zIndex)).toEqual([1, 2, 3]);
  });

  it("does not create a new identity when an existing group is grouped again", () => {
    const shapes = [
      { ...shape("1", 0, 0), groupId: "existing" },
      { ...shape("2", 0, 0), groupId: "existing" },
    ];
    expect(groupShapes(shapes, ["1"], "replacement")).toBe(shapes);
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

  it("does not resurrect a remotely deleted baseline shape", () => {
    const baseline = [shape("1", 0, 0), shape("2", 100, 0)];
    const local = [shape("1", 25, 0), baseline[1]!, shape("3", 300, 0)];
    const merged = mergeShapeChanges(baseline, local, [baseline[0]!]);
    expect(merged.map((item) => item.id)).toEqual(["1", "3"]);
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
