import calendarImage from "../res/calendar.png";
import imagePlaceholder from "../res/image.png";

export interface Shape {
  id: string;
  type: string;
  name?: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  width: number;
  height: number;
  level: number;
  zIndex: number;
  rotation?: number;
  flipX?: boolean;
  flipY?: boolean;
  shapes?: Shape[];
  groupId?: string | null;
  locked?: boolean;
  hidden?: boolean;
  borderRadius?: number;
  borderWidth?: number;
  borderStyle?: string;
  borderColor?: string;
  backgroundColor?: string;
  backgroundImage?: string;
  assetId?: string;
  color?: string;
  opacity?: number;
  text?: string;
  fontSize?: number;
  fontFamily?: string;
  fontWeight?: string;
  textAlign?: string;
  alignItems?: string;
  textDecoration?: string;
  lineHeight?: number;
  letterSpacing?: number;
  rows?: number;
  boardId?: string | null;
  title?: string | null;
  uid?: string | null;
}

export const createShapeId = (): string => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
};

const largestZIndex = (shapes: Shape[]): number =>
  shapes.reduce(
    (largest, shape) => Math.max(largest, shape.zIndex, largestZIndex(shape.shapes ?? [])),
    0
  );

export const ShapeFunctions = {
  createShape(type: string, x: number, y: number, shapes: Shape[]): Shape {
    const isMedia = type === "calendar" || type === "image";
    return {
      id: createShapeId(),
      type,
      name: type.charAt(0).toUpperCase() + type.slice(1),
      x1: x,
      y1: y,
      x2: x,
      y2: y,
      width: 0,
      height: 0,
      level: 0,
      zIndex: largestZIndex(shapes) + 1,
      rotation: 0,
      flipX: false,
      flipY: false,
      groupId: null,
      locked: false,
      hidden: false,
      borderRadius: type === "ellipse" ? 1000 : 0,
      borderWidth: 0,
      borderStyle: "solid",
      borderColor: "#000000",
      backgroundColor: type === "text" || isMedia ? "transparent" : "#ffffff",
      backgroundImage:
        type === "calendar" ? calendarImage : type === "image" ? imagePlaceholder : "",
      color: "#ffffff",
      opacity: 1,
      text: "",
      fontSize: 12,
      fontFamily: "Arial",
      fontWeight: "normal",
      textAlign: "left",
      alignItems: "flex-start",
      textDecoration: "none",
      lineHeight: 1.2,
      letterSpacing: 0,
      rows: 1,
    };
  },
};
