import { Shape } from "../classes/shape.js";

export type EditorTool =
  | "pointer"
  | "hand"
  | "frame"
  | "rectangle"
  | "ellipse"
  | "text"
  | "image"
  | "board"
  | "comment"
  | "pen"
  | "connector"
  | "sticky"
  | "marker"
  | "highlighter"
  | "eraser"
  | "table"
  | "code"
  | "link";

export interface Point {
  x: number;
  y: number;
}

export interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Viewport {
  /** World coordinate shown at the canvas's top-left corner. */
  x: number;
  y: number;
  /** Screen pixels per world unit. */
  zoom: number;
}

export type ResizeHandle =
  | "n"
  | "ne"
  | "e"
  | "se"
  | "s"
  | "sw"
  | "w"
  | "nw";

export interface EditorDocumentSnapshot {
  boardId: string;
  shapes: Shape[];
  backgroundColor: string;
}

export interface EditorHistory {
  boardId: string;
  past: EditorDocumentSnapshot[];
  present: EditorDocumentSnapshot;
  future: EditorDocumentSnapshot[];
}

export interface ResizeOptions {
  fromCenter?: boolean;
  lockAspectRatio?: boolean;
  minimumSize?: number;
  gridSize?: number;
}

export interface ResizeTransform {
  bounds: Bounds;
  origin: Point;
  scaleX: number;
  scaleY: number;
}

export interface SelectionFrame {
  bounds: Bounds;
  rotation: number;
}

export interface PasteContext {
  /** World-space canvas viewport. */
  viewport?: Bounds;
  /** Explicit destination selected by the user. */
  targetFrameId?: string | null;
  /** Paste-here world coordinate; positions the copied bounds' top-left. */
  point?: Point;
}

export interface CommentAnchor {
  x: number;
  y: number;
  shapeId: string;
}

export type EditorRightPanel = "properties" | "comments" | "history" | "assets" | "prototype" | "export" | "inspect" | "branches" | "platform" | "studio";
