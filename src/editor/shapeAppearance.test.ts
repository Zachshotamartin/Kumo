import type { Shape } from "../classes/shape";
import { shapeAppearanceStyle } from "./shapeAppearance";

const base: Shape = { id: "shape", type: "rectangle", x1: 0, y1: 0, x2: 100, y2: 80, width: 100, height: 80, level: 0, zIndex: 7 };

describe("canonical shape appearance", () => {
  it("delegates paint stacks to the SVG surface while preserving independent corners", () => {
    expect(shapeAppearanceStyle({ ...base,
      cornerRadii: { topLeft: 2, topRight: 4, bottomRight: 8, bottomLeft: 16 },
      fills: [{ id: "hidden", type: "solid", color: "#000000", opacity: 1, visible: false }, { id: "fill", type: "solid", color: "#abcdef", opacity: 1, visible: true }],
      strokes: [{ id: "stroke", color: "#123456", width: 3, opacity: 0.5, visible: true, style: "dashed", align: "center" }],
    }, 2)).toEqual(expect.objectContaining({
      backgroundColor: "transparent", backgroundImage: undefined, border: 0, borderRadius: "2px 4px 8px 16px", zIndex: 7,
    }));
  });

  it("keeps legacy image rendering while delegating gradient fills to the surface", () => {
    const gradient = shapeAppearanceStyle({ ...base, fills: [{ id: "gradient", type: "linear-gradient", visible: true, opacity: 1, gradientAngle: 45, gradientStops: [{ id: "a", color: "#000000", opacity: 1, position: 0 }, { id: "b", color: "#ffffff", opacity: 1, position: 1 }] }] }, 1);
    expect(gradient).toEqual(expect.objectContaining({ backgroundColor: "transparent", backgroundImage: undefined, border: 0 }));
    const image = shapeAppearanceStyle({ ...base, backgroundImage: "https://assets.test/image.png", imageFit: "tile", opacity: 0.5 }, 1);
    expect(image).toEqual(expect.objectContaining({ backgroundImage: "url(https://assets.test/image.png)", backgroundRepeat: "repeat", backgroundSize: "auto", opacity: 0.5 }));
  });

  it("uses the SVG surface for smoothed legacy shapes", () => {
    expect(shapeAppearanceStyle({ ...base, backgroundColor: "#000", cornerSmoothing: 0.5 }, 1))
      .toEqual(expect.objectContaining({ backgroundColor: "transparent", backgroundImage: undefined, border: 0 }));
  });

  it("suppresses DOM borders for vectors, booleans, and connectors", () => {
    for (const type of ["vector", "boolean", "connector"] as const) expect(shapeAppearanceStyle({ ...base, type, borderWidth: 4 }, 1).border).toBe(0);
    expect(shapeAppearanceStyle({ ...base, type: "ellipse" }, 1).borderRadius).toBe("50%");
  });

  it("renders legacy DOM strokes and fitted media without optional appearance values", () => {
    expect(shapeAppearanceStyle({ ...base, strokes: [{ id: "stroke", color: "#123456", width: 2, opacity: 1, visible: true, style: "dotted", align: "center" }] }, 2).border)
      .toBe("4px dotted #123456");
    expect(shapeAppearanceStyle({ ...base, strokes: [{ id: "stroke", color: "#123456", width: 2, opacity: 1, visible: true, style: "dashed", align: "center" }] }, 2).border)
      .toBe("4px dashed #123456");
    expect(shapeAppearanceStyle({ ...base, borderWidth: 2, borderStyle: "dashed", borderColor: "#654321", imageFit: "fit" }, 1))
      .toEqual(expect.objectContaining({ border: "2px dashed #654321", backgroundSize: "contain" }));
    expect(shapeAppearanceStyle({ ...base, borderWidth: 1 }, 1))
      .toEqual(expect.objectContaining({ border: "1px solid transparent", backgroundColor: "transparent", color: "#f7f7f5", opacity: 1 }));
  });
});
