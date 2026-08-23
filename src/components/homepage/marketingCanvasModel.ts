import type { Shape } from "../../classes/shape";

export const MARKETING_CANVAS_WIDTH = 1000;
export const MARKETING_CANVAS_HEIGHT = 1000;
export const MARKETING_STATUS_SHAPE_ID = "marketing-status";

type MarketingTextShapeInput = {
  id: string;
  name: string;
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex: number;
  fontSize: number;
  fontWeight: string;
  color: string;
  lineHeight?: number;
  letterSpacing?: number;
  textCase?: Shape["textCase"];
};

const marketingTextShape = ({
  id,
  name,
  text,
  x,
  y,
  width,
  height,
  zIndex,
  fontSize,
  fontWeight,
  color,
  lineHeight = 1.2,
  letterSpacing = 0,
  textCase = "original",
}: MarketingTextShapeInput): Shape => ({
  id,
  type: "text",
  name,
  text,
  x1: x,
  y1: y,
  x2: x + width,
  y2: y + height,
  width,
  height,
  level: 0,
  zIndex,
  rotation: 0,
  locked: false,
  hidden: false,
  opacity: 1,
  color,
  backgroundColor: "transparent",
  fontSize,
  fontFamily: "var(--kumo-font)",
  fontWeight,
  textAlign: "left",
  lineHeight,
  letterSpacing,
  textAutoResize: "auto-height",
  textCase,
});

/**
 * The sign-in composition is a small Kumo document, not a collection of
 * independently positioned DOM copy. Coordinates use the same bounds fields as
 * regular board shapes in a stable 1000 x 1000 marketing-canvas world.
 */
export const createMarketingTextShapes = (status: string): Shape[] => [
  marketingTextShape({
    id: "marketing-brand",
    name: "Brand",
    text: "Kumo",
    x: 60,
    y: 58,
    width: 110,
    height: 34,
    zIndex: 110,
    fontSize: 15,
    fontWeight: "800",
    color: "#e7e4dd",
    lineHeight: 1,
    letterSpacing: -0.75,
  }),
  marketingTextShape({
    id: "marketing-descriptor",
    name: "Workspace descriptor",
    text: "Connected visual workspace",
    x: 745,
    y: 60,
    width: 220,
    height: 24,
    zIndex: 111,
    fontSize: 7.5,
    fontWeight: "700",
    color: "#8f8e89",
    lineHeight: 1,
    letterSpacing: 0.8,
    textCase: "upper",
  }),
  marketingTextShape({
    id: "marketing-explore",
    name: "Explore step",
    text: "Explore",
    x: 758,
    y: 458,
    width: 62,
    height: 24,
    zIndex: 112,
    fontSize: 7.2,
    fontWeight: "700",
    color: "#8e8d88",
    lineHeight: 1,
    letterSpacing: 0.65,
    textCase: "upper",
  }),
  marketingTextShape({
    id: "marketing-shape",
    name: "Shape step",
    text: "Shape",
    x: 842,
    y: 458,
    width: 58,
    height: 24,
    zIndex: 113,
    fontSize: 7.2,
    fontWeight: "700",
    color: "#8e8d88",
    lineHeight: 1,
    letterSpacing: 0.65,
    textCase: "upper",
  }),
  marketingTextShape({
    id: "marketing-build",
    name: "Build step",
    text: "Build",
    x: 916,
    y: 458,
    width: 50,
    height: 24,
    zIndex: 114,
    fontSize: 7.2,
    fontWeight: "700",
    color: "#8e8d88",
    lineHeight: 1,
    letterSpacing: 0.65,
    textCase: "upper",
  }),
  marketingTextShape({
    id: MARKETING_STATUS_SHAPE_ID,
    name: "Workspace status",
    text: status,
    x: 758,
    y: 494,
    width: 215,
    height: 28,
    zIndex: 115,
    fontSize: 8,
    fontWeight: "650",
    color: "#9b9a94",
    lineHeight: 1.2,
  }),
  marketingTextShape({
    id: "marketing-eyebrow",
    name: "Invitation",
    text: "Make space to think",
    x: 60,
    y: 696,
    width: 195,
    height: 28,
    zIndex: 116,
    fontSize: 8,
    fontWeight: "800",
    color: "#cf8e3e",
    lineHeight: 1,
    letterSpacing: 0.95,
    textCase: "upper",
  }),
  marketingTextShape({
    id: "marketing-headline",
    name: "Headline",
    text: "Every board can lead somewhere.",
    x: 60,
    y: 744,
    width: 540,
    height: 140,
    zIndex: 117,
    fontSize: 58,
    fontWeight: "620",
    color: "#e7e4dd",
    lineHeight: 0.98,
    letterSpacing: -3.55,
  }),
  marketingTextShape({
    id: "marketing-copy",
    name: "Supporting copy",
    text: "Create together in real time, then link one board directly into the next.",
    x: 60,
    y: 900,
    width: 500,
    height: 62,
    zIndex: 118,
    fontSize: 13.5,
    fontWeight: "400",
    color: "#a9a8a2",
    lineHeight: 1.55,
  }),
];

export const moveMarketingShape = (
  shape: Shape,
  deltaX: number,
  deltaY: number
): Shape => {
  const nextX = Math.min(
    MARKETING_CANVAS_WIDTH - shape.width,
    Math.max(0, shape.x1 + deltaX)
  );
  const nextY = Math.min(
    MARKETING_CANVAS_HEIGHT - shape.height,
    Math.max(0, shape.y1 + deltaY)
  );

  return {
    ...shape,
    x1: nextX,
    y1: nextY,
    x2: nextX + shape.width,
    y2: nextY + shape.height,
  };
};
