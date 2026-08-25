import { ShapeFunctions, type Shape } from "../classes/shape";
import { normalizeShape } from "./geometry";
import { createVectorShape, updateVectorPoint } from "./graphics";
import { createAdvancedPrimitive } from "./advancedFeatures";
import type { EditorTool, Point } from "./types";

export type DrawableEditorTool = Exclude<EditorTool, "pointer" | "hand" | "comment" | "eraser">;

export const createDraftShape = (
  tool: DrawableEditorTool,
  point: Point,
  shapes: Shape[]
): Shape => {
  if (["connector", "sticky", "marker", "highlighter", "table", "code", "link"].includes(tool)) {
    return createAdvancedPrimitive(tool as "connector" | "sticky" | "marker" | "highlighter" | "table" | "code" | "link", point, shapes);
  }
  if (tool === "pen") {
    return createVectorShape(
      point,
      point,
      Math.max(0, ...shapes.map((shape) => shape.zIndex)) + 1
    );
  }
  const shape = ShapeFunctions.createShape(tool, point.x, point.y, shapes);
  return normalizeShape({
    ...shape,
    text: tool === "text" ? "Type something" : shape.text,
    fontSize: tool === "text" ? 18 : shape.fontSize,
    name: tool === "board"
      ? "Linked board"
      : tool === "text"
        ? "Text"
        : tool === "image"
          ? "Image"
          : tool === "ellipse"
            ? "Ellipse"
            : tool === "frame"
              ? "Frame"
              : "Rectangle",
    title: tool === "board" ? "Choose a destination" : shape.title,
    backgroundColor: tool === "text" || tool === "image"
      ? "transparent"
      : tool === "board"
        ? "#303640"
        : tool === "frame"
          ? "#ffffff"
          : "#f4f2ed",
    color: "#f7f7f5",
    borderColor: tool === "frame" ? "#8b8d92" : "#17181a",
    borderWidth: tool === "text" ? 0 : 1,
  });
};

export const draftAtPoint = (
  draft: Shape,
  start: Point,
  end: Point,
  square: boolean
): Shape => {
  let dx = end.x - start.x;
  let dy = end.y - start.y;
  if (square) {
    const size = Math.max(Math.abs(dx), Math.abs(dy));
    dx = Math.sign(dx || 1) * size;
    dy = Math.sign(dy || 1) * size;
  }
  if (draft.type === "connector") {
    return normalizeShape({
      ...draft,
      x1: start.x,
      y1: start.y,
      x2: start.x + dx,
      y2: start.y + dy,
      connectorStart: { anchor: "auto", x: start.x, y: start.y },
      connectorEnd: { anchor: "auto", x: start.x + dx, y: start.y + dy },
    });
  }
  if (draft.type === "vector" && draft.vectorPoints?.length) {
    const last = draft.vectorPoints.at(-1)!;
    return updateVectorPoint(
      [draft],
      draft.id,
      last.id,
      { x: start.x + dx, y: start.y + dy }
    )[0]!;
  }
  return normalizeShape({
    ...draft,
    x1: start.x,
    y1: start.y,
    x2: start.x + dx,
    y2: start.y + dy,
  });
};
