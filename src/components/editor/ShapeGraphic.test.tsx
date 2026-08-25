import { render } from "@testing-library/react";
import type { Shape } from "../../classes/shape";
import { ShapeSurfaceGraphic, ShapeVectorGraphic } from "./ShapeGraphic";

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
    expect(container.querySelector("path[stroke]")).toHaveAttribute("d", "M 0 0 L 100 100");
    expect(container.querySelector("path[stroke]")).toHaveAttribute("fill", "none");
    expect(container.querySelector("path[stroke]")).toHaveAttribute("stroke", "#ca842c");

    rerender(<ShapeVectorGraphic shape={shape({ vectorClosed: true })} />);
    expect(container.querySelector("path[fill='#f4f2ed']")).toHaveAttribute("d", "M 0 0 L 100 100 Z");
  });

  it.each([
    ["subtract", "path"],
    ["intersect", "clipPath"],
    ["union", "path"],
    ["exclude", "path"],
  ] as const)("renders %s boolean composition", (operation, expectedElement) => {
    const { container } = render(<ShapeVectorGraphic shape={booleanShape(operation)} />);
    expect(container.querySelector(expectedElement)).toBeInTheDocument();
    if (operation === "exclude" || operation === "subtract") {
      expect(container.querySelector("path[fill-rule='evenodd']")).toBeInTheDocument();
    }
    if (operation === "union") {
      expect(container.querySelector("path[fill-rule='nonzero']")).toBeInTheDocument();
    }
    if (operation === "intersect") {
      expect(container.querySelector("g[clip-path]")).toHaveAttribute("clip-path", "url(#boolean-booleanid-clip-0)");
    }
  });

  it("falls back to a one-unit view box and default stroke for empty vectors", () => {
    const { container } = render(
      <ShapeVectorGraphic
        shape={shape({ x2: 10, y2: 20, width: 0, height: 0, vectorPoints: [], borderColor: undefined })}
      />
    );
    expect(container.querySelector("svg")).toHaveAttribute("viewBox", "0 0 1 1");
    expect(container.querySelector("path[stroke]")).toHaveAttribute("stroke", "#fff");
  });

  it("renders complete fill and aligned stroke stacks on smoothed surfaces", () => {
    const layered = shape({
      type: "rectangle",
      cornerRadii: { topLeft: 2, topRight: 4, bottomRight: 6, bottomLeft: 8 },
      cornerSmoothing: 0.5,
      fills: [
        { id: "base", type: "solid", color: "#111111", opacity: 1, visible: true },
        { id: "gradient", type: "linear-gradient", opacity: 0.5, visible: true, blendMode: "screen", gradientStops: [{ id: "a", position: 0, color: "#fff", opacity: 1 }] },
        { id: "image", type: "image", imageUrl: "https://assets.test/texture.png", opacity: 0.25, visible: true },
      ],
      strokes: [
        { id: "inside", color: "#f00", width: 2, opacity: 0.5, visible: true, style: "dashed", align: "inside" },
        { id: "outside", color: "#0f0", width: 3, opacity: 1, visible: true, style: "dotted", align: "outside" },
      ],
    });
    const { container } = render(<ShapeSurfaceGraphic shape={layered} />);
    expect(container.querySelectorAll("svg > path[fill]:not([fill='none'])")).toHaveLength(3);
    expect(container.querySelector("linearGradient")).toBeInTheDocument();
    expect(container.querySelector("pattern image")).toHaveAttribute("href", "https://assets.test/texture.png");
    expect(container.querySelector("path[stroke='#f00']")).toHaveAttribute("clip-path", expect.stringContaining("paint-clip"));
    expect(container.querySelector("path[stroke='#0f0']")).toHaveAttribute("mask", expect.stringContaining("paint-outside"));
    expect(container.querySelector("path[stroke='#0f0']")).toHaveAttribute("stroke-linecap", "round");
  });

  it("does not add a surface to legacy shapes and clips legacy images when smoothing is enabled", () => {
    const { container, rerender } = render(<ShapeSurfaceGraphic shape={shape({ type: "rectangle" })} />);
    expect(container.querySelector("svg")).not.toBeInTheDocument();
    rerender(<ShapeSurfaceGraphic shape={shape({ type: "rectangle", cornerSmoothing: 0.5, backgroundImage: "https://assets.test/photo.png", imageFit: "fit" })} />);
    expect(container.querySelector("image[href='https://assets.test/photo.png']")).toHaveAttribute("preserveAspectRatio", "xMidYMid meet");
    rerender(<ShapeSurfaceGraphic shape={shape({ type: "ellipse", x2: 10, y2: 20, width: 0, height: 0, cornerSmoothing: 0.5, backgroundColor: undefined, backgroundImage: "https://assets.test/crop.png", imageFit: "crop" })} />);
    expect(container.querySelector("svg")).toHaveAttribute("viewBox", "0 0 1 1");
    expect(container.querySelector("image")).toHaveAttribute("preserveAspectRatio", "xMidYMid slice");
    rerender(<ShapeSurfaceGraphic shape={shape({ type: "connector", fills: [{ id: "fill", type: "solid", color: "#fff", opacity: 1, visible: true }] })} />);
    expect(container.querySelector("svg")).not.toBeInTheDocument();
  });

  it("renders radial, missing, and default-angle paint definitions without crashing", () => {
    const { container } = render(<ShapeSurfaceGraphic shape={shape({
      type: "ellipse",
      fills: [
        { id: "missing-color", type: "solid", opacity: 1, visible: true },
        { id: "missing-image", type: "image", opacity: 0.5, visible: true },
        { id: "missing-gradient", type: "linear-gradient", opacity: 0.5, visible: true, gradientStops: [] },
        { id: "radial", type: "radial-gradient", opacity: 0.5, visible: true, gradientStops: [
          { id: "late", position: 2, color: "#fff", opacity: 2 },
          { id: "early", position: -1, color: "#000", opacity: -1 },
        ] },
        { id: "linear", type: "linear-gradient", opacity: 1, visible: true, gradientStops: [{ id: "one", position: 0.5, color: "#aaa", opacity: 1 }] },
      ],
    })} />);
    expect(container.querySelector("radialGradient")).toBeInTheDocument();
    expect(container.querySelector("linearGradient")).toHaveAttribute("gradientTransform", "rotate(90 .5 .5)");
    expect(container.querySelector("path[fill='transparent']")).toBeInTheDocument();
    expect(container.querySelectorAll("stop")[0]).toHaveAttribute("offset", "0%");
    expect(container.querySelectorAll("stop")[1]).toHaveAttribute("offset", "100%");
  });

  it("covers legacy vector dash, cap, join, network, and no-stroke variants", () => {
    const { container, rerender } = render(<ShapeVectorGraphic shape={shape({
      borderStyle: "dashed", strokeDash: [3, 2], strokeCap: "square", strokeJoin: "bevel",
    })} />);
    expect(container.querySelector("path[stroke]")).toHaveAttribute("stroke-dasharray", "3 2");
    expect(container.querySelector("path[stroke]")).toHaveAttribute("stroke-linecap", "square");
    expect(container.querySelector("path[stroke]")).toHaveAttribute("stroke-linejoin", "bevel");
    rerender(<ShapeVectorGraphic shape={shape({ borderStyle: "dotted", strokeCap: "round", borderColor: undefined })} />);
    expect(container.querySelector("path[stroke]")).toHaveAttribute("stroke-linecap", "round");
    rerender(<ShapeVectorGraphic shape={shape({ borderWidth: 0, borderColor: undefined, vectorPaths: [{ id: "path", pointIds: [], closed: false }], vectorPoints: undefined })} />);
    expect(container.querySelector("path[stroke]")).not.toBeInTheDocument();
    rerender(<ShapeVectorGraphic shape={shape({ type: "boolean", booleanChildren: undefined })} />);
    expect(container.querySelector("svg")).toBeInTheDocument();
    rerender(<ShapeVectorGraphic shape={shape({ borderWidth: undefined, borderColor: undefined, vectorPoints: undefined, vectorPaths: undefined, vectorClosed: true, backgroundColor: undefined })} />);
    expect(container.querySelector("path[fill='transparent']")).toBeInTheDocument();
    expect(container.querySelector("path[stroke='#fff']")).toBeInTheDocument();
    rerender(<ShapeSurfaceGraphic shape={shape({ type: "rectangle", borderWidth: undefined, borderColor: undefined, cornerSmoothing: 0.5 })} />);
    expect(container.querySelector("path[stroke]")).not.toBeInTheDocument();
    rerender(<ShapeSurfaceGraphic shape={shape({ type: "rectangle", borderWidth: 1, borderColor: undefined, cornerSmoothing: 0.5 })} />);
    expect(container.querySelector("path[stroke='transparent']")).toBeInTheDocument();
    const sparseChildren = new Array<Shape>(1);
    rerender(<ShapeVectorGraphic shape={shape({ type: "boolean", booleanOperation: "intersect", booleanChildren: sparseChildren })} />);
    expect(container.querySelector("svg")).toBeInTheDocument();
  });
});
