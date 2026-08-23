import {
  ChatCenteredText,
  Circle,
  CursorClick,
  FrameCorners,
  Hand,
  ImageSquare,
  LinkSimple,
  PenNib,
  Rectangle,
  TextT,
  type Icon,
} from "@phosphor-icons/react";
import type { EditorTool } from "./types";

export interface EditorToolDefinition {
  id: EditorTool;
  label: string;
  shortcut: string;
  Icon: Icon;
}

/** Shared by the full editor and every smaller Kumo canvas surface. */
export const EDITOR_TOOL_DEFINITIONS: EditorToolDefinition[] = [
  { id: "pointer", label: "Select", shortcut: "V", Icon: CursorClick },
  { id: "hand", label: "Hand", shortcut: "H", Icon: Hand },
  { id: "frame", label: "Frame", shortcut: "F", Icon: FrameCorners },
  { id: "rectangle", label: "Rectangle", shortcut: "R", Icon: Rectangle },
  { id: "ellipse", label: "Ellipse", shortcut: "O", Icon: Circle },
  { id: "pen", label: "Pen", shortcut: "P", Icon: PenNib },
  { id: "text", label: "Text", shortcut: "T", Icon: TextT },
  { id: "image", label: "Image", shortcut: "I", Icon: ImageSquare },
  { id: "board", label: "Linked board", shortcut: "B", Icon: LinkSimple },
  { id: "comment", label: "Comment", shortcut: "C", Icon: ChatCenteredText },
];
