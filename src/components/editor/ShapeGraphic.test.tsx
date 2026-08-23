import { render } from "@testing-library/react";
import type { Shape } from "../../classes/shape";
import { ShapeVectorGraphic } from "./ShapeGraphic";

const shape = (patch: Partial<Shape> = {}): Shape => ({
  id: "shape-1",
  type: "vector",
  x1: 10,
  y1: 20,
  x2: 110,
  y2: 120,
  width: 100,
  height: 100,
  level: 0,
  zIndex: 1,
  backgroundColor: "#f4f2ed",
  borderColor: "#ca842c",
  borderWidth: 3,
  vectorPoints: [
    { id: "a", x: 10, y: 20 },
    { id: "b", x: 110, y: 120 },
  ],
  ...patch,
});

const booleanShape = (operation: Shape["booleanOperation"]): Shape => shape({
  id: "boolean !@# id",
  type: "boolean",
  booleanOperation: operation,
  booleanChildren: [
    shape({ id: "left", type: "rectangle", x1: 10, y1: 20, x2: 90, y2: 100 }),
    shape({ id: "right", type: "ellipse", x1: 50, y1: 50, x2: 110, y2: 120 }),
  ],
});

describe("ShapeVectorGraphic", () => {
  it("renders open and closed vector geometry using the shared board path data", () => {
    const { container, rerender } = render(<ShapeVectorGraphic shape={shape()} />);
    expect(container.querySelector("svg")).toHaveAttribute("viewBox", "0 0 100 100");
    expect(container.querySelector("path")).toHaveAttribute("d", "M 0 0 L 100 100");
    expect(container.querySelector("path")).toHaveAttribute("fill", "none");
    expect(container.querySelector("path")).toHaveAttribute("stroke", "#ca842c");

    rerender(<ShapeVectorGraphic shape={shape({ vectorClosed: true })} />);
    expect(container.querySelector("path")).toHaveAttribute("d", "M 0 0 L 100 100 Z");
    expect(container.querySelector("path")).toHaveAttribute("fill", "#f4f2ed");
  });

  it.each([
    ["subtract", "mask"],
    ["intersect", "clipPath"],
    ["union", "path"],
    ["exclude", "path"],
  ] as const)("renders %s boolean composition", (operation, expectedElement) => {
    const { container } = render(<ShapeVectorGraphic shape={booleanShape(operation)} />);
    expect(container.querySelector(expectedElement)).toBeInTheDocument();
    if (operation === "exclude") {
      expect(container.querySelector("path[fill-rule='evenodd']")).toBeInTheDocument();
    }
    if (operation === "subtract") {
      expect(container.querySelector("mask")?.id).toBe("boolean-booleanid-mask");
      expect(container.querySelector("rect[mask]")).toHaveAttribute(
        "mask",
        "url(#boolean-booleanid-mask)"
      );
    }
  });

  it("falls back to a one-unit view box and default stroke for empty vectors", () => {
    const { container } = render(
      <ShapeVectorGraphic
        shape={shape({ x2: 10, y2: 20, width: 0, height: 0, vectorPoints: [], borderColor: undefined })}
      />
    );
    expect(container.querySelector("svg")).toHaveAttribute("viewBox", "0 0 1 1");
    expect(container.querySelector("path")).toHaveAttribute("stroke", "#fff");
  });
});
