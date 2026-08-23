import {
  MARKETING_CANVAS_HEIGHT,
  MARKETING_CANVAS_WIDTH,
  MARKETING_STATUS_SHAPE_ID,
  createMarketingTextShapes,
  moveMarketingShape,
} from "./marketingCanvasModel";

describe("marketing canvas document model", () => {
  it("describes every piece of marketing copy as an editable Kumo text shape", () => {
    const shapes = createMarketingTextShapes("Opening your workspace");

    expect(shapes).toHaveLength(9);
    expect(new Set(shapes.map((shape) => shape.id)).size).toBe(shapes.length);
    expect(shapes.every((shape) =>
      shape.type === "text" &&
      shape.locked === false &&
      shape.width === shape.x2 - shape.x1 &&
      shape.height === shape.y2 - shape.y1 &&
      shape.zIndex > 100
    )).toBe(true);
    expect(shapes.find((shape) => shape.id === MARKETING_STATUS_SHAPE_ID)?.text)
      .toBe("Opening your workspace");
    expect(shapes.map((shape) => shape.text)).toEqual(expect.arrayContaining([
      "Kumo",
      "Connected visual workspace",
      "Explore",
      "Shape",
      "Build",
      "Make space to think",
      "Every board can lead somewhere.",
      "Create together in real time, then link one board directly into the next.",
    ]));
  });

  it("moves modeled objects while keeping their bounds inside the miniature canvas", () => {
    const shape = createMarketingTextShapes("Ready")[0]!;
    const moved = moveMarketingShape(shape, 120, 80);
    const clamped = moveMarketingShape(shape, MARKETING_CANVAS_WIDTH, MARKETING_CANVAS_HEIGHT);
    const clampedAtOrigin = moveMarketingShape(shape, -MARKETING_CANVAS_WIDTH, -MARKETING_CANVAS_HEIGHT);

    expect(moved).toMatchObject({
      x1: shape.x1 + 120,
      y1: shape.y1 + 80,
      x2: shape.x2 + 120,
      y2: shape.y2 + 80,
    });
    expect(clamped.x2).toBe(MARKETING_CANVAS_WIDTH);
    expect(clamped.y2).toBe(MARKETING_CANVAS_HEIGHT);
    expect(clampedAtOrigin).toMatchObject({ x1: 0, y1: 0 });
  });
});
