import { createMarketingTextShapes, layoutMarketingShapes, MARKETING_STATUS_SHAPE_ID } from "./marketingCanvasModel";

describe("marketing canvas document", () => {
  it("keeps all copy as editable, uniquely identified shapes", () => {
    const shapes = createMarketingTextShapes("Opening your workspace");
    expect(shapes).toHaveLength(9);
    expect(new Set(shapes.map((shape) => shape.id)).size).toBe(9);
    expect(shapes.every((shape) => shape.type === "text" && !shape.locked && shape.width === shape.x2 - shape.x1)).toBe(true);
    expect(shapes.find((shape) => shape.id === MARKETING_STATUS_SHAPE_ID)?.text).toBe("Opening your workspace");
    expect(shapes.find((shape) => shape.id === "marketing-headline")?.text).toBe("Every board can lead somewhere.");
  });
  it("seeds real pixel bounds at desktop, short, and mobile sizes", () => {
    for (const [width, height, mobile] of [[1000, 900, false], [680, 680, false], [390, 620, true], [800, 620, true]] as const) {
      const shapes = layoutMarketingShapes("Ready", width, height, mobile);
      for (const shape of shapes.filter((shape) => !shape.hidden)) {
        expect(shape.x1).toBeGreaterThanOrEqual(0);
        expect(shape.x2).toBeLessThanOrEqual(width);
        expect(shape.y2).toBeLessThanOrEqual(height);
        expect(shape.fontSize).toBeGreaterThanOrEqual(9);
      }
      expect(shapes.filter((shape) => !shape.hidden)).toHaveLength(mobile ? 5 : 9);
      expect(shapes.find((shape) => shape.id === "marketing-eyebrow")?.text).toBe("MAKE SPACE TO THINK");
    }
  });
});
