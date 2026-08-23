import { Shape } from "../classes/shape";

export type EditorTool =
  | "pointer"
  | "hand"
  | "rectangle"
  | "ellipse"
  | "text"
  | "image"
  | "board";

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
}
