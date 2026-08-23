import type { Shape } from "../classes/shape";
import { applyDocumentLayout, constrainFrameChildren, estimatedTextBounds } from "./layout";

const shape = (id: string, x: number, y: number, width: number, height: number, patch: Partial<Shape> = {}): Shape => ({
  id, type: "rectangle", name: id, x1: x, y1: y, x2: x + width, y2: y + height,
  width, height, level: 0, zIndex: 1, parentId: null, ...patch,
});

describe("responsive frame layout", () => {
  it("lays out children with padding, gaps, fill growth, and cross-axis alignment", () => {
    const frame = shape("frame", 100, 100, 300, 120, {
      type: "frame", layoutMode: "horizontal", paddingLeft: 20, paddingRight: 20,
      paddingTop: 10, paddingBottom: 10, layoutGap: 10, counterAlign: "center",
    });
    const first = shape("first", 0, 0, 40, 20, { parentId: frame.id, zIndex: 2 });
    const second = shape("second", 0, 0, 20, 40, { parentId: frame.id, zIndex: 3, layoutGrow: 1 });
    const result = applyDocumentLayout([frame, first, second]);
    expect(result.find((item) => item.id === "first")).toMatchObject({ x1: 120, y1: 150, width: 40, height: 20 });
    expect(result.find((item) => item.id === "second")).toMatchObject({ x1: 170, y1: 140, width: 210, height: 40 });
  });

  it("wraps content and hugs its contents", () => {
    const frame = shape("frame", 0, 0, 100, 200, {
      type: "frame", layoutMode: "horizontal", layoutWrap: true, layoutGap: 10,
      layoutCounterGap: 5, paddingLeft: 10, paddingRight: 10, paddingTop: 10, paddingBottom: 10,
      verticalSizing: "hug",
    });
    const children = [0, 1, 2].map((index) => shape(String(index), 0, 0, 35, 20, { parentId: frame.id, zIndex: index + 1 }));
    const result = applyDocumentLayout([frame, ...children]);
    expect(result.find((item) => item.id === "2")).toMatchObject({ x1: 10, y1: 35 });
    expect(result.find((item) => item.id === "frame")?.height).toBe(65);
  });

  it("keeps nested auto-layout stable by resolving the inner frame first", () => {
    const outer = shape("outer", 0, 0, 400, 200, { type: "frame", layoutMode: "horizontal", paddingLeft: 10, paddingTop: 10 });
    const inner = shape("inner", 0, 0, 100, 100, { type: "frame", parentId: outer.id, layoutMode: "vertical", verticalSizing: "hug", paddingTop: 5, paddingBottom: 5, zIndex: 2 });
    const child = shape("child", 0, 0, 20, 30, { parentId: inner.id, zIndex: 3 });
    const result = applyDocumentLayout([outer, inner, child]);
    expect(result.find((item) => item.id === inner.id)?.height).toBe(40);
    expect(result.find((item) => item.id === inner.id)).toMatchObject({ x1: 10, y1: 10 });
    expect(result.find((item) => item.id === child.id)).toMatchObject({ x1: 26, y1: 15 });
  });

  it("honors pin, stretch, center, and scale constraints on frame resize", () => {
    const frame = shape("frame", 0, 0, 100, 100, { type: "frame", layoutMode: "none" });
    const right = shape("right", 70, 10, 20, 20, { parentId: frame.id, constraintHorizontal: "right" });
    const stretch = shape("stretch", 10, 30, 80, 20, { parentId: frame.id, constraintHorizontal: "left-right" });
    const scale = shape("scale", 20, 60, 20, 20, { parentId: frame.id, constraintHorizontal: "scale", constraintVertical: "bottom" });
    const resizedFrame = shape("frame", 0, 0, 200, 150, { type: "frame", layoutMode: "none" });
    const result = constrainFrameChildren([frame, right, stretch, scale], [resizedFrame, right, stretch, scale], frame.id);
    expect(result.find((item) => item.id === "right")?.x1).toBe(170);
    expect(result.find((item) => item.id === "stretch")?.width).toBe(180);
    expect(result.find((item) => item.id === "scale")).toMatchObject({ x1: 40, width: 40, y1: 110 });
  });

  it("auto-sizes text with case, line, paragraph, indent, and tracking settings", () => {
    const text = shape("text", 0, 0, 10, 10, {
      type: "text", text: "one\ntwo", fontSize: 20, lineHeight: 1.5, letterSpacing: 1,
      paragraphSpacing: 8, textIndent: 12, textCase: "upper", textAutoResize: "auto-width",
    });
    expect(estimatedTextBounds(text)).toEqual({ width: 49, height: 68 });
    expect(applyDocumentLayout([text])[0]).toMatchObject({ width: 49, height: 68 });
  });
});
