import type { Shape } from "../classes/shape";
import {
  appendVectorPoint,
  createBooleanOperation,
  createMask,
  createVectorShape,
  effectStyles,
  flattenBooleanOperation,
  gradientCss,
  releaseMask,
  shapePathData,
  updateVectorPoint,
  vectorPathData,
  vectorNetworkPathData,
} from "./graphics";

const shape = (id: string, x: number, patch: Partial<Shape> = {}): Shape => ({
  id, type: "rectangle", x1: x, y1: 0, x2: x + 20, y2: 20, width: 20, height: 20,
  level: 0, zIndex: x + 1, parentId: null, backgroundColor: "#fff", ...patch,
});

describe("vector and compositing graphics", () => {
  it("writes straight and bezier vector paths and moves editable nodes", () => {
    const points = [{ id: "a", x: 0, y: 0, handleOut: { x: 10, y: 0 } }, { id: "b", x: 20, y: 20, handleIn: { x: 10, y: 20 } }];
    expect(vectorPathData(points, { x: 0, y: 0 }, true)).toBe("M 0 0 C 10 0 10 20 20 20 Z");
    const vector = shape("vector", 0, { type: "vector", vectorPoints: points });
    const moved = updateVectorPoint([vector], vector.id, "b", { x: 30, y: 40 })[0]!;
    expect(moved).toMatchObject({ width: 30, height: 40 });
    expect(moved.vectorPoints?.[1]).toMatchObject({
      x: 30,
      y: 40,
      handleIn: { x: 20, y: 40 },
    });
    expect(moved.vectorPoints?.[0]?.handleOut).toEqual({ x: 10, y: 0 });
    expect(vectorPathData([], { x: 0, y: 0 })).toBe("");
    expect(vectorPathData([{ id: "a", x: 1, y: 2 }, { id: "b", x: 3, y: 4 }])).toBe("M 1 2 L 3 4");
    expect(shapePathData(shape("ellipse", 0, { type: "ellipse" }))).toContain(" A ");
    expect(shapePathData(vector)).toContain(" C ");
    const created = createVectorShape({ x: 30, y: 20 }, { x: 10, y: 40 }, 9);
    expect(created).toMatchObject({ type: "vector", x1: 10, y1: 20, width: 20, height: 20, zIndex: 9 });
    const appended = appendVectorPoint([created, shape("other", 0)], created.id, { x: 50, y: 60 });
    expect(appended[0]?.vectorPoints).toHaveLength(3);
    expect(appended[0]).toMatchObject({ x2: 50, y2: 60 });
  });

  it("renders branching vector networks and appends to the active path", () => {
    const points = [{ id: "a", x: 0, y: 0 }, { id: "b", x: 20, y: 20 }, { id: "c", x: 40, y: 0 }];
    const paths = [{ id: "main", pointIds: ["a", "b"], closed: false }, { id: "branch", pointIds: ["b", "c"], closed: false }];
    expect(vectorNetworkPathData(points, paths)).toBe("M 0 0 L 20 20 M 20 20 L 40 0");
    expect(vectorNetworkPathData(points, [{ id: "missing", pointIds: ["missing"], closed: false }])).toBe("");
    const vector = shape("network", 0, { type: "vector", vectorPoints: points, vectorPaths: paths });
    expect(shapePathData(vector)).toContain("M 20 20 L 40 0");
    const appended = appendVectorPoint([vector], vector.id, { x: 60, y: 20 })[0]!;
    expect(appended.vectorPaths?.[1]?.pointIds).toHaveLength(3);
  });

  it("creates nondestructive boolean geometry and can flatten it", () => {
    const result = createBooleanOperation([shape("a", 0), shape("b", 10)], ["a", "b"], "subtract");
    const composite = result.shapes.find((item) => item.id === result.booleanId)!;
    expect(composite).toMatchObject({ type: "boolean", booleanOperation: "subtract" });
    expect(composite.booleanChildren).toHaveLength(2);
    expect(flattenBooleanOperation(result.shapes, composite.id).filter((item) => item.type === "rectangle")).toHaveLength(2);
    expect(createBooleanOperation([shape("a", 0)], ["a"], "union").booleanId).toBeNull();
    const frame = shape("frame", 0, { type: "frame" });
    const child = shape("child", 2, { parentId: frame.id });
    const text = shape("text", 30, { type: "text" });
    const invalid = createBooleanOperation([frame, child, text], [frame.id, text.id], "union");
    expect(invalid).toEqual({ shapes: [frame, child, text], booleanId: null });
    expect(flattenBooleanOperation([shape("a", 0)], "missing")).toEqual([shape("a", 0)]);
  });

  it("uses the back object as a reversible mask", () => {
    const masked = createMask([shape("mask", 0), shape("content", 10)], ["mask", "content"]);
    expect(masked[0]?.isMask).toBe(true);
    expect(masked[1]?.maskId).toBe("mask");
    expect(releaseMask(masked, "mask").every((item) => !item.maskId && !item.isMask)).toBe(true);
    expect(createMask([shape("single", 0)], ["single"])).toEqual([shape("single", 0)]);
  });

  it("builds gradients and layered visual effects", () => {
    const styled = shape("styled", 0, {
      fillType: "linear-gradient", gradientAngle: 45,
      gradientStops: [{ id: "a", position: 0, color: "#fff", opacity: 1 }, { id: "b", position: 1, color: "#000", opacity: 0.5 }],
      effects: [
        { id: "shadow", type: "drop-shadow", color: "#0008", x: 2, y: 3, blur: 4, spread: 0, visible: true },
        { id: "blur", type: "background-blur", color: "#0000", x: 0, y: 0, blur: 8, spread: 0, visible: true },
        { id: "inner", type: "inner-shadow", color: "#0008", x: 1, y: 1, blur: 2, spread: 1, visible: true },
        { id: "layer", type: "layer-blur", color: "#0000", x: 0, y: 0, blur: -2, spread: 0, visible: true },
      ],
    });
    expect(gradientCss(styled)).toContain("linear-gradient(45deg");
    expect(effectStyles(styled)).toMatchObject({ filter: expect.stringContaining("blur(0px)"), boxShadow: expect.stringContaining("inset"), backdropFilter: "blur(8px)" });
    expect(gradientCss({ ...styled, fillType: "radial-gradient" })).toContain("radial-gradient(circle");
    expect(gradientCss({ ...styled, fillType: "solid" })).toBeUndefined();
  });
});
