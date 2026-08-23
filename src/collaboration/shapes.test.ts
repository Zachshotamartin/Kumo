import { Shape } from "../classes/shape";
import { shapePatch, storedShape } from "./shapes";

const shape = (overrides: Partial<Shape> = {}): Shape => ({
  id: "shape-1",
  type: "rectangle",
  x1: 0,
  y1: 0,
  x2: 100,
  y2: 80,
  width: 100,
  height: 80,
  level: 0,
  zIndex: 1,
  backgroundColor: "#ffffff",
  ...overrides,
});

describe("collaborative shape persistence", () => {
  it("emits only changed properties so concurrent unrelated edits survive", () => {
    const result = shapePatch(shape(), shape({ x1: 24, x2: 124 }));
    expect(result.update).toEqual({ x1: 24, x2: 124 });
    expect(result.remove).toEqual([]);
  });

  it("tracks properties removed from the next shape", () => {
    const before = shape({ title: "Linked board" });
    const after = { ...before };
    delete after.title;
    expect(shapePatch(before, after).remove).toContain("title");
  });

  it("normalizes geometry before storage", () => {
    expect(storedShape(shape({ x2: -20 })).width).toBe(20);
  });

  it("persists a board destination as a first-class shape property", () => {
    const before = shape({ type: "board", title: "Choose a destination", boardId: null });
    const after = { ...before, title: "Product map", boardId: "board-product-map" };
    expect(shapePatch(before, after).update).toMatchObject({
      title: "Product map",
      boardId: "board-product-map",
    });
  });

  it("persists and removes user-visible group names with the group identity", () => {
    const before = shape({ groupId: "group", groupName: "Navigation" });
    expect(storedShape(before).groupName).toBe("Navigation");
    const after = shape({ groupId: null, groupName: undefined });
    expect(shapePatch(before, after).remove).toContain("groupName");
  });
});
