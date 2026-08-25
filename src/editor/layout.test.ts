import type { Shape } from "../classes/shape";
import {
  applyDocumentLayout,
  constrainFrameChildren,
  displayTextLines,
  estimatedTextBounds,
  fitTextShape,
  transformedText,
} from "./layout";

const shape = (id: string, x: number, y: number, width: number, height: number, patch: Partial<Shape> = {}): Shape => ({
  id, type: "rectangle", name: id, x1: x, y1: y, x2: x + width, y2: y + height,
  width, height, level: 0, zIndex: 1, parentId: null, ...patch,
});

describe("responsive frame layout", () => {
  it("transforms text casing and formats every list style", () => {
    const text = shape("text", 0, 0, 20, 20, { type: "text", text: "héLLo\nWORLD" });
    expect(transformedText({ ...text, text: undefined })).toBe("");
    expect(transformedText({ ...text, textCase: "lower" })).toBe("héllo\nworld");
    expect(transformedText({ ...text, textCase: "title" })).toBe("HÉLLo\nWORLD");
    expect(transformedText(text)).toBe("héLLo\nWORLD");
    expect(displayTextLines({ ...text, listStyle: "bulleted" })).toEqual(["• héLLo", "• WORLD"]);
    expect(displayTextLines({ ...text, listStyle: "numbered" })).toEqual(["1. héLLo", "2. WORLD"]);
    expect(displayTextLines(text)).toEqual(["héLLo", "WORLD"]);
  });

  it("estimates text with safe defaults and minimum metrics", () => {
    const text = shape("text", 0, 0, 20, 20, {
      type: "text",
      text: "",
      fontSize: 0,
      lineHeight: 0,
      letterSpacing: -100,
      textIndent: -10,
      paragraphSpacing: undefined,
    });
    expect(estimatedTextBounds(text, 0)).toEqual({ width: 1, height: 1 });
    expect(estimatedTextBounds({ ...text, fontSize: undefined, lineHeight: undefined, letterSpacing: undefined })).toEqual({ width: 18, height: 22 });
  });

  it("only fits text configured for automatic sizing", () => {
    const rectangle = shape("rectangle", 0, 0, 20, 20);
    const fixed = shape("fixed", 0, 0, 20, 20, { type: "text", text: "long text", textAutoResize: "fixed" });
    expect(fitTextShape(rectangle)).toBe(rectangle);
    expect(fitTextShape(fixed)).toBe(fixed);
    expect(fitTextShape({ ...fixed, textAutoResize: undefined })).toEqual({ ...fixed, textAutoResize: undefined });
  });

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

  it("supports primary alignment and per-child counter alignment", () => {
    const create = (align: Shape["primaryAlign"]) => {
      const frame = shape(`frame-${align}`, 0, 0, 200, 100, {
        type: "frame", layoutMode: "horizontal", primaryAlign: align,
        paddingLeft: 0, paddingRight: 0, paddingTop: 0, paddingBottom: 0, layoutGap: 10,
      });
      const first = shape(`first-${align}`, 0, 0, 20, 20, { parentId: frame.id, zIndex: 1, layoutAlign: "end" });
      const second = shape(`second-${align}`, 0, 0, 20, 20, { parentId: frame.id, zIndex: 2, layoutAlign: "stretch" });
      return applyDocumentLayout([frame, first, second]);
    };
    expect(create("center").find((item) => item.id === "first-center")).toMatchObject({ x1: 75, y1: 80 });
    expect(create("end").find((item) => item.id === "first-end")?.x1).toBe(150);
    const spaced = create("space-between");
    expect(spaced.find((item) => item.id === "second-space-between")).toMatchObject({ x1: 180, height: 100 });
  });

  it("supports vertical fill sizing, growth, and center alignment", () => {
    const frame = shape("frame", 0, 0, 100, 200, {
      type: "frame", layoutMode: "vertical", counterAlign: "center",
      paddingLeft: 0, paddingRight: 0, paddingTop: 0, paddingBottom: 0, layoutGap: 0,
    });
    const fixed = shape("fixed", 0, 0, 20, 40, { parentId: frame.id, zIndex: 1, horizontalSizing: "fill" });
    const growA = shape("grow-a", 0, 0, 20, 20, { parentId: frame.id, zIndex: 2, layoutGrow: 1, layoutAlign: "inherit" });
    const growB = shape("grow-b", 0, 0, 20, 20, { parentId: frame.id, zIndex: 3, layoutGrow: 3, layoutAlign: "center" });
    const result = applyDocumentLayout([frame, fixed, growA, growB]);
    expect(result.find((item) => item.id === fixed.id)).toMatchObject({ x1: 0, width: 100, height: 40 });
    expect(result.find((item) => item.id === growA.id)).toMatchObject({ x1: 40, y1: 40, height: 40 });
    expect(result.find((item) => item.id === growB.id)).toMatchObject({ x1: 40, y1: 80, height: 120 });
  });

  it("lays out grids, uses deterministic tied ordering, and hugs both axes", () => {
    const frame = shape("frame", 0, 0, 200, 200, {
      type: "frame", layoutMode: "grid", horizontalSizing: "hug", verticalSizing: "hug",
      paddingLeft: 5, paddingRight: 5, paddingTop: 5, paddingBottom: 5, layoutGap: 5, layoutCounterGap: 6,
    });
    const children = ["c", "a", "b"].map((id, index) => shape(id, 0, 0, 20 + index * 5, 10 + index * 5, {
      parentId: frame.id,
      zIndex: 1,
    }));
    const result = applyDocumentLayout([frame, ...children]);
    expect(result.find((item) => item.id === "a")).toMatchObject({ x1: 5, y1: 5 });
    expect(result.find((item) => item.id === "b")?.y1).toBe(5);
    expect(result.find((item) => item.id === "c")?.y1).toBe(31);
    expect(result.find((item) => item.id === frame.id)).toMatchObject({ width: 70, height: 46 });
  });

  it("wraps vertically, uses default padding, and hugs the counter axis", () => {
    const frame = shape("frame", 0, 0, 100, 90, {
      type: "frame", layoutMode: "vertical", layoutWrap: true, horizontalSizing: "hug",
      paddingTop: undefined, paddingRight: undefined, paddingBottom: undefined, paddingLeft: undefined,
      layoutGap: 5, layoutCounterGap: 4,
    });
    const first = shape("first", 0, 0, 20, 40, { parentId: frame.id, zIndex: 1 });
    const second = shape("second", 0, 0, 30, 40, { parentId: frame.id, zIndex: 2 });
    const result = applyDocumentLayout([frame, first, second]);
    expect(result.find((item) => item.id === second.id)).toMatchObject({ x1: 40, y1: 16 });
    expect(result.find((item) => item.id === frame.id)?.width).toBe(86);
  });

  it("leaves active empty frames and excluded children untouched", () => {
    const frame = shape("frame", 0, 0, 100, 100, { type: "frame", layoutMode: "horizontal" });
    const absolute = shape("absolute", 50, 50, 10, 10, { parentId: frame.id, layoutPositioning: "absolute" });
    const guide = shape("guide", 40, 40, 0, 0, { type: "guide", parentId: frame.id });
    const result = applyDocumentLayout([frame, absolute, guide]);
    expect(result.map((item) => ({ id: item.id, x1: item.x1, y1: item.y1 }))).toEqual([
      { id: "frame", x1: 0, y1: 0 },
      { id: "absolute", x1: 50, y1: 50 },
      { id: "guide", x1: 40, y1: 40 },
    ]);
  });

  it("does not offset descendants when a nested frame is already in place", () => {
    const outer = shape("outer", 0, 0, 100, 100, {
      type: "frame", layoutMode: "horizontal", paddingLeft: 0, paddingTop: 0, paddingRight: 0, paddingBottom: 0,
    });
    const inner = shape("inner", 0, 0, 20, 20, { type: "frame", layoutMode: "none", parentId: outer.id });
    const child = shape("child", 2, 2, 5, 5, { parentId: inner.id });
    const result = applyDocumentLayout([outer, inner, child]);
    expect(result.find((item) => item.id === child.id)).toMatchObject({ x1: 2, y1: 2 });
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

  it("handles centered, two-sided, default, and zero-baseline constraints", () => {
    const frame = shape("frame", 10, 20, 0, 0, { type: "frame", layoutMode: "none" });
    const centered = shape("center", 15, 25, 10, 10, { parentId: frame.id, constraintHorizontal: "center", constraintVertical: "center" });
    const stretched = shape("stretch", 10, 20, 1, 1, { parentId: frame.id, constraintHorizontal: "left-right", constraintVertical: "top-bottom" });
    const pinned = shape("pinned", 12, 22, 4, 4, { parentId: frame.id });
    const scaled = shape("scaled", 12, 22, 4, 4, { parentId: frame.id, constraintHorizontal: "scale", constraintVertical: "scale" });
    const resizedFrame = shape("frame", 100, 200, 40, 60, { type: "frame", layoutMode: "none" });
    const result = constrainFrameChildren([frame, centered, stretched, pinned, scaled], [resizedFrame, centered, stretched, pinned, scaled], frame.id);
    expect(result.find((item) => item.id === centered.id)).toMatchObject({ x1: 125, y1: 235 });
    expect(result.find((item) => item.id === stretched.id)).toMatchObject({ width: 41, height: 61 });
    expect(result.find((item) => item.id === pinned.id)).toMatchObject({ x1: 102, y1: 202 });
    expect(result.find((item) => item.id === scaled.id)).toMatchObject({ x1: 102, y1: 202, width: 4, height: 4 });
  });

  it("rejects missing frames and auto-layout frames when applying constraints", () => {
    const frame = shape("frame", 0, 0, 100, 100, { type: "frame", layoutMode: "none" });
    const resizedFrame = shape("frame", 0, 0, 200, 200, { type: "frame", layoutMode: "none" });
    expect(constrainFrameChildren([], [resizedFrame], frame.id)).toEqual([resizedFrame]);
    expect(constrainFrameChildren([frame], [], frame.id)).toEqual([]);
    const auto = { ...frame, layoutMode: "horizontal" as const };
    expect(constrainFrameChildren([auto], [resizedFrame], frame.id)).toEqual([resizedFrame]);
  });

  it("auto-sizes text with case, line, paragraph, indent, and tracking settings", () => {
    const text = shape("text", 0, 0, 10, 10, {
      type: "text", text: "one\ntwo", fontSize: 20, lineHeight: 1.5, letterSpacing: 1,
      paragraphSpacing: 8, textIndent: 12, textCase: "upper", textAutoResize: "auto-width",
    });
    expect(estimatedTextBounds(text)).toEqual({ width: 49, height: 68 });
    expect(applyDocumentLayout([text])[0]).toMatchObject({ width: 49, height: 68 });
  });

  it("keeps auto-height text width fixed while growing for wrapped content", () => {
    const text = shape("text", 0, 0, 100, 20, {
      type: "text",
      text: "A sentence that wraps across several visual lines.",
      fontSize: 20,
      lineHeight: 1.2,
      textAutoResize: "auto-height",
    });

    const fitted = applyDocumentLayout([text])[0]!;
    expect(fitted.width).toBe(100);
    expect(fitted.height).toBeGreaterThan(20);
    expect(fitted.x2).toBe(100);
    expect(fitted.y2).toBe(fitted.height);
  });
});
