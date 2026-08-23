import { createShapeId, ShapeFunctions } from "./shape";

describe("shape construction", () => {
  it("creates unique shapes above nested z-indexes with type defaults", () => {
    const existing = ShapeFunctions.createShape("rectangle", 0, 0, []);
    existing.zIndex = 3;
    existing.shapes = [{ ...existing, id: "nested", zIndex: 9, shapes: undefined }];
    const ellipse = ShapeFunctions.createShape("ellipse", 12, 14, [existing]);
    expect(ellipse).toMatchObject({ x1: 12, y1: 14, zIndex: 10, borderRadius: 1000 });
    expect(ShapeFunctions.createShape("text", 0, 0, []).backgroundColor).toBe("transparent");
    expect(ShapeFunctions.createShape("calendar", 0, 0, []).backgroundImage).toBeTruthy();
    expect(ShapeFunctions.createShape("image", 0, 0, []).backgroundImage).toBeTruthy();
  });

  it("creates non-empty identifiers", () => {
    expect(createShapeId()).toEqual(expect.any(String));
    expect(createShapeId()).not.toHaveLength(0);
  });
});
