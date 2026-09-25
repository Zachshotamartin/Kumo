import type { Shape } from "../../classes/shape";

export const MARKETING_CANVAS_WIDTH = 1000;
export const MARKETING_CANVAS_HEIGHT = 1000;
export const MARKETING_STATUS_SHAPE_ID = "marketing-status";

/** Viewport width at and below which the landing page stacks; matches the 900px breakpoint in CSS. */
export const MARKETING_MOBILE_MAX_WIDTH = 900;

/** Labels that must never wrap: brand, eyebrow, the step row, the status line. */
const SINGLE_LINE_IDS = new Set([
  "marketing-brand", "marketing-descriptor", "marketing-explore", "marketing-shape",
  "marketing-build", MARKETING_STATUS_SHAPE_ID, "marketing-eyebrow",
]);
const STEP_IDS = ["marketing-explore", "marketing-shape", "marketing-build"];

/**
 * Wide enough for the longest status message ("Checking your existing session") on one line, so
 * the box does not change size — and push the copy around — as sign-in progresses.
 */
const STATUS_MIN_WIDTH = 190;
const STEP_GAP = 12;
const RIGHT_INSET = 16;

/**
 * A deliberately generous estimate of a one-line Inter label's rendered width. A box that is too
 * wide costs nothing because text is left-aligned inside it; one that is too narrow breaks the
 * label mid-word, which is what happened to "EXPLORE" when label boxes scaled with the canvas
 * while their font sizes stayed fixed.
 */
export const estimateLabelWidth = (text: string, fontSize: number, letterSpacing = 0) =>
  Math.ceil(text.length * fontSize * (text === text.toUpperCase() ? 0.74 : 0.6)
    + Math.max(0, text.length - 1) * letterSpacing);

/*
 * Stacked (mobile) composition, top to bottom. The brand and the mascot share a top edge; the
 * status sits under the mascot and ends at its right edge; the invitation block follows on the
 * spacing scale. The mascot's position and size live in MarketingCanvas.module.css.
 */
const MOBILE_EDGE = 24;
const MOBILE_MASCOT_BOTTOM = MOBILE_EDGE + 146;
const MOBILE_STATUS_Y = MOBILE_MASCOT_BOTTOM + 12;
const MOBILE_EYEBROW_Y = MOBILE_STATUS_Y + 16 + 32;
const MOBILE_HEADLINE_Y = MOBILE_EYEBROW_Y + 12 + 12;
const HEADLINE_LEADING = 1.05;

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
    fontWeight: "650",
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
    fontWeight: "650",
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
    fontWeight: "650",
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
    fontWeight: "650",
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
    fontWeight: "650",
    color: "#e7e4dd",
    lineHeight: HEADLINE_LEADING,
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

/**
 * At narrow desktop widths the proportional positions put one-line labels on top of each other or
 * past the right edge. The step row keeps its proportional spacing where there is room, closes up
 * to a fixed gap where there is not, and slides left as a unit if it would still overflow; every
 * other one-line label is pulled back inside the right inset.
 */
const fitDesktopLabels = (shapes: Shape[], width: number): Shape[] => {
  const limit = width - RIGHT_INSET;
  const steps = STEP_IDS.map((id) => shapes.find((shape) => shape.id === id)!);
  const packed = steps.reduce<number[]>((xs, step, index) => [
    ...xs,
    index === 0 ? step.x1 : Math.max(step.x1, xs[index - 1]! + steps[index - 1]!.width + STEP_GAP),
  ], []);
  const last = steps.length - 1;
  const overflow = Math.max(0, packed[last]! + steps[last]!.width - limit);
  const stepX = new Map(steps.map((step, index) => [step.id, packed[index]! - overflow]));
  return shapes.map((shape) => {
    const x = stepX.get(shape.id)
      ?? (SINGLE_LINE_IDS.has(shape.id) ? Math.max(0, Math.min(shape.x1, limit - shape.width)) : shape.x1);
    return x === shape.x1 ? shape : { ...shape, x1: x, x2: x + shape.width };
  });
};

/** Seed a responsive document in real editor pixels; edits never use CSS-only bounds. */
export const layoutMarketingShapes = (status: string, width: number, height: number, mobile: boolean): Shape[] => {
  const fonts: Record<string, number> = {
    "marketing-brand": 20, "marketing-descriptor": 9, "marketing-explore": 9,
    "marketing-shape": 9, "marketing-build": 9, "marketing-status": 11,
    "marketing-eyebrow": 11, "marketing-headline": Math.min(78, Math.max(42, width * 0.058)), "marketing-copy": 16,
  };
  const mobileHeadlineSize = Math.min(52, width * 0.11);
  // The headline sets on two lines at every stacked width from 320px to 900px, so the supporting
  // copy can follow it at a fixed step instead of guessing at a wrapped height.
  const mobileHeadlineHeight = Math.ceil(2 * mobileHeadlineSize * HEADLINE_LEADING);
  const mobileCopyY = MOBILE_HEADLINE_Y + mobileHeadlineHeight + 20;
  const mobileContent = width - 2 * MOBILE_EDGE;
  const mobilePositions: Record<string, [number, number, number, number]> = {
    "marketing-brand": [MOBILE_EDGE, MOBILE_EDGE, 112, 30],
    [MARKETING_STATUS_SHAPE_ID]: [width - MOBILE_EDGE - STATUS_MIN_WIDTH, MOBILE_STATUS_Y, STATUS_MIN_WIDTH, 16],
    "marketing-eyebrow": [MOBILE_EDGE, MOBILE_EYEBROW_Y, mobileContent, 12],
    "marketing-headline": [MOBILE_EDGE, MOBILE_HEADLINE_Y, mobileContent, mobileHeadlineHeight],
    "marketing-copy": [MOBILE_EDGE, mobileCopyY, mobileContent, 72],
  };
  const placed = createMarketingTextShapes(status).map((shape) => {
    const mobilePosition = mobilePositions[shape.id];
    const headline = shape.id === "marketing-headline";
    const text = shape.textCase === "upper" ? shape.text!.toUpperCase() : shape.text!;
    const fontSize = mobile && headline ? mobileHeadlineSize : fonts[shape.id]!;
    const [x, y, proportionalWidth, h] = (mobile && mobilePosition ? mobilePosition : [
      shape.x1 / MARKETING_CANVAS_WIDTH * width,
      shape.y1 / MARKETING_CANVAS_HEIGHT * height,
      (headline ? Math.max(540, 660 - width / 10) : shape.width) / MARKETING_CANVAS_WIDTH * width,
      shape.height / MARKETING_CANVAS_HEIGHT * height,
    ]) as [number, number, number, number];
    const w = !mobile && SINGLE_LINE_IDS.has(shape.id)
      ? Math.max(
        proportionalWidth,
        estimateLabelWidth(text, fontSize, shape.letterSpacing as number),
        shape.id === MARKETING_STATUS_SHAPE_ID ? STATUS_MIN_WIDTH : 0,
      )
      : proportionalWidth;
    return {
      ...shape, x1: x, y1: y, x2: x + w, y2: y + h, width: w, height: h, fontSize, text,
      letterSpacing: headline ? -0.055 * fontSize : shape.letterSpacing,
      // Stacked, the status hangs under the mascot, so it ends where the mascot ends.
      textAlign: mobile && shape.id === MARKETING_STATUS_SHAPE_ID ? "right" : shape.textAlign,
      hidden: mobile && !mobilePosition,
    };
  });
  return mobile ? placed : fitDesktopLabels(placed, width);
};
