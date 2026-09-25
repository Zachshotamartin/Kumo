import { createMarketingTextShapes, estimateLabelWidth, layoutMarketingShapes, MARKETING_STATUS_SHAPE_ID } from "./marketingCanvasModel";

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

  it("never lets one-line labels wrap, collide, or leave the canvas at the narrowest split layout", () => {
    // 511px is the intro column at a 901px viewport, the narrowest width that keeps the split layout.
    for (const width of [511, 680, 936]) {
      const shapes = layoutMarketingShapes("Checking your existing session", width, 900, false);
      const byId = (id: string) => shapes.find((shape) => shape.id === id)!;
      for (const id of ["marketing-descriptor", "marketing-explore", "marketing-shape", "marketing-build", MARKETING_STATUS_SHAPE_ID, "marketing-eyebrow"]) {
        const shape = byId(id);
        expect(shape.width).toBeGreaterThanOrEqual(estimateLabelWidth(shape.text!, shape.fontSize!, shape.letterSpacing!));
        expect(shape.x2).toBeLessThanOrEqual(width);
      }
      const [explore, shape, build] = ["marketing-explore", "marketing-shape", "marketing-build"].map(byId);
      expect(shape!.x1).toBeGreaterThanOrEqual(explore!.x2);
      expect(build!.x1).toBeGreaterThanOrEqual(shape!.x2);
    }
  });

  it("keeps the proportional composition wherever it already fits", () => {
    const shapes = layoutMarketingShapes("Ready", 1000, 900, false);
    expect(shapes.find((shape) => shape.id === "marketing-explore")?.x1).toBe(758);
    expect(shapes.find((shape) => shape.id === "marketing-build")?.x1).toBe(916);
  });

  it("stacks the mobile copy on the spacing scale beneath the mascot", () => {
    const shapes = layoutMarketingShapes("Ready", 375, 460, true);
    const byId = (id: string) => shapes.find((shape) => shape.id === id)!;
    const status = byId(MARKETING_STATUS_SHAPE_ID);
    const eyebrow = byId("marketing-eyebrow");
    const headline = byId("marketing-headline");
    const copy = byId("marketing-copy");
    expect(byId("marketing-brand").y1).toBe(24);
    expect(status).toMatchObject({ x2: 351, y1: 182, textAlign: "right" });
    expect(eyebrow.y1 - status.y2).toBe(32);
    expect(headline.y1 - eyebrow.y2).toBe(12);
    expect(copy.y1 - headline.y2).toBe(20);
    expect(headline.lineHeight).toBe(1.05);
    expect(headline.fontWeight).toBe("650");
  });
});
