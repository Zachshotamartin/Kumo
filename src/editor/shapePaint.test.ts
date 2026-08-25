import type { Shape } from "../classes/shape";
import {
  normalizedCornerRadii,
  paintBackgroundLayers,
  paintCss,
  roundedRectPath,
  shapeUsesSvgSurface,
  strokeDashArray,
  visibleShapeFills,
  visibleShapeStrokes,
} from "./shapePaint";

const shape = (patch: Partial<Shape> = {}): Shape => ({
  id: "shape",
  type: "rectangle",
  x1: 0, y1: 0, x2: 100, y2: 80,
  width: 100, height: 80, level: 0, zIndex: 1,
  ...patch,
});

describe("shape paint", () => {
  const solid = { id: "solid", type: "solid" as const, color: "#123456", opacity: 0.5, visible: true };
  const linear = { id: "linear", type: "linear-gradient" as const, opacity: 0.5, visible: true, gradientAngle: 45, gradientStops: [
    { id: "late", position: 1.5, color: "#fff", opacity: 1 },
    { id: "early", position: -1, color: "#000", opacity: 0.4 },
  ] };

  it("filters visible paints and strokes without losing their stack order", () => {
    const target = shape({
      fills: [{ ...solid, visible: false }, solid, { ...linear, opacity: 0 }],
      strokes: [
        { id: "hidden", color: "#000", width: 2, opacity: 1, visible: false, style: "solid", align: "center" },
        { id: "zero", color: "#000", width: 0, opacity: 1, visible: true, style: "solid", align: "center" },
        { id: "transparent", color: "#000", width: 2, opacity: 0, visible: true, style: "solid", align: "center" },
        { id: "shown", color: "#fff", width: 2, opacity: 1, visible: true, style: "solid", align: "outside" },
      ],
    });
    expect(visibleShapeFills(target)).toEqual([solid]);
    expect(visibleShapeStrokes(target).map((stroke) => stroke.id)).toEqual(["shown"]);
    expect(shapeUsesSvgSurface(target)).toBe(true);
  });

  it("converts every supported fill to CSS and composes top-first background layers", () => {
    expect(paintCss(solid)).toBe("color-mix(in srgb, #123456 50%, transparent)");
    expect(paintCss({ ...solid, opacity: 1 })).toBe("#123456");
    expect(paintCss({ id: "image", type: "image", imageUrl: "https://assets.test/a.png", opacity: 1, visible: true })).toBe("url(https://assets.test/a.png)");
    expect(paintCss(linear)).toBe("linear-gradient(45deg, color-mix(in srgb, #000 20%, transparent) 0%, color-mix(in srgb, #fff 50%, transparent) 100%)");
    expect(paintCss({ ...linear, id: "radial", type: "radial-gradient" })).toContain("radial-gradient(circle");
    expect(paintCss({ ...linear, gradientAngle: undefined })).toContain("linear-gradient(90deg");
    expect(paintCss({ ...solid, color: undefined })).toBeUndefined();
    expect(paintCss({ id: "image", type: "image", opacity: 1, visible: true })).toBeUndefined();
    expect(paintCss({ ...linear, gradientStops: [] })).toBeUndefined();
    expect(paintBackgroundLayers(shape({ fills: [solid, { ...solid, id: "top", color: "#fff", opacity: 1 }] })))
      .toEqual(["#fff", "color-mix(in srgb, #123456 50%, transparent)"]);
    expect(paintBackgroundLayers(shape({ fills: [{ id: "missing", type: "image", opacity: 1, visible: true }] }))).toEqual([]);
  });

  it("normalizes oversized and invalid corners and makes smoothing affect geometry", () => {
    expect(normalizedCornerRadii(shape(), 100, 80)).toEqual({ topLeft: 0, topRight: 0, bottomRight: 0, bottomLeft: 0 });
    const target = shape({ cornerRadii: { topLeft: 100, topRight: Number.NaN, bottomRight: 100, bottomLeft: 100 }, borderRadius: 8 });
    expect(normalizedCornerRadii(target, 100, 80)).toEqual({ topLeft: 40, topRight: 3.2, bottomRight: 40, bottomLeft: 40 });
    expect(normalizedCornerRadii(shape({ borderRadius: 5, cornerRadii: { topLeft: Number.NaN, topRight: 4, bottomRight: Number.NaN, bottomLeft: Number.NaN } }), 100, 80))
      .toEqual({ topLeft: 5, topRight: 4, bottomRight: 5, bottomLeft: 5 });
    const plain = roundedRectPath(shape({ borderRadius: 10 }), 100, 80);
    const smooth = roundedRectPath(shape({ borderRadius: 10, cornerSmoothing: 2 }), 100, 80);
    expect(plain).toContain("M 10 0");
    expect(smooth).toContain("M 16 0");
    expect(smooth).not.toBe(plain);
    expect(roundedRectPath(shape({ borderRadius: 0, cornerSmoothing: -1 }), 100, 80)).toContain("M 0 0");
  });

  it("selects SVG surfaces and dash patterns only when needed", () => {
    expect(shapeUsesSvgSurface(shape())).toBe(false);
    expect(shapeUsesSvgSurface(shape({ strokes: [{ id: "one", color: "#000", width: 1, opacity: 1, visible: true, style: "solid", align: "center" }] }))).toBe(false);
    expect(shapeUsesSvgSurface(shape({ strokes: [
      { id: "one", color: "#000", width: 1, opacity: 1, visible: true, style: "solid", align: "center" },
      { id: "two", color: "#fff", width: 2, opacity: 1, visible: true, style: "solid", align: "center" },
    ] }))).toBe(true);
    expect(strokeDashArray({ style: "solid", width: 2 })).toBeUndefined();
    expect(strokeDashArray({ style: "dashed", width: 2 })).toBe("8 4");
    expect(strokeDashArray({ style: "dotted", width: 2 })).toBe("2 4");
  });
});
