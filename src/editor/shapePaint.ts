import type { Shape } from "../classes/shape.js";

export type ShapeFill = NonNullable<Shape["fills"]>[number];
export type ShapeStroke = NonNullable<Shape["strokes"]>[number];

export const visibleShapeFills = (shape: Shape): ShapeFill[] =>
  shape.fills?.filter((fill) => fill.visible && fill.opacity > 0) ?? [];

export const visibleShapeStrokes = (shape: Shape): ShapeStroke[] =>
  shape.strokes?.filter((stroke) => stroke.visible && stroke.width > 0 && stroke.opacity > 0) ?? [];

const mixedColor = (color: string, opacity: number) => opacity < 1
  ? `color-mix(in srgb, ${color} ${Math.round(Math.max(0, Math.min(1, opacity)) * 100)}%, transparent)`
  : color;

export const paintCss = (fill: ShapeFill): string | undefined => {
  if (fill.type === "solid" && fill.color) return mixedColor(fill.color, fill.opacity);
  if (fill.type === "image" && fill.imageUrl) return `url(${fill.imageUrl})`;
  if ((fill.type === "linear-gradient" || fill.type === "radial-gradient") && fill.gradientStops?.length) {
    const stops = [...fill.gradientStops]
      .sort((left, right) => left.position - right.position)
      .map((stop) => `${mixedColor(stop.color, stop.opacity * fill.opacity)} ${Math.round(Math.max(0, Math.min(1, stop.position)) * 100)}%`)
      .join(", ");
    return fill.type === "radial-gradient"
      ? `radial-gradient(circle, ${stops})`
      : `linear-gradient(${fill.gradientAngle ?? 90}deg, ${stops})`;
  }
  return undefined;
};

/** CSS background layers are painted first-to-last from top to bottom. */
export const paintBackgroundLayers = (shape: Shape): string[] =>
  visibleShapeFills(shape).flatMap((fill) => {
    const paint = paintCss(fill);
    return paint ? [paint] : [];
  }).reverse();

export const shapeUsesSvgSurface = (shape: Shape): boolean =>
  visibleShapeFills(shape).length > 0
  || visibleShapeStrokes(shape).length > 1
  || visibleShapeStrokes(shape).some((stroke) => stroke.align !== "center")
  || (shape.cornerSmoothing ?? 0) > 0;

export interface CornerRadii {
  topLeft: number;
  topRight: number;
  bottomRight: number;
  bottomLeft: number;
}

export const normalizedCornerRadii = (shape: Shape, width: number, height: number): CornerRadii => {
  const fallback = Math.max(0, shape.borderRadius ?? 0);
  const source = shape.cornerRadii ?? {
    topLeft: fallback,
    topRight: fallback,
    bottomRight: fallback,
    bottomLeft: fallback,
  };
  const radii = {
    topLeft: Math.max(0, Number.isFinite(source.topLeft) ? source.topLeft : fallback),
    topRight: Math.max(0, Number.isFinite(source.topRight) ? source.topRight : fallback),
    bottomRight: Math.max(0, Number.isFinite(source.bottomRight) ? source.bottomRight : fallback),
    bottomLeft: Math.max(0, Number.isFinite(source.bottomLeft) ? source.bottomLeft : fallback),
  };
  const ratios = [
    radii.topLeft + radii.topRight ? width / (radii.topLeft + radii.topRight) : 1,
    radii.bottomLeft + radii.bottomRight ? width / (radii.bottomLeft + radii.bottomRight) : 1,
    radii.topLeft + radii.bottomLeft ? height / (radii.topLeft + radii.bottomLeft) : 1,
    radii.topRight + radii.bottomRight ? height / (radii.topRight + radii.bottomRight) : 1,
  ];
  const scale = Math.max(0, Math.min(1, ...ratios.filter(Number.isFinite)));
  return {
    topLeft: radii.topLeft * scale,
    topRight: radii.topRight * scale,
    bottomRight: radii.bottomRight * scale,
    bottomLeft: radii.bottomLeft * scale,
  };
};

/**
 * Produces a rounded/smoothed rectangle in local coordinates. Smoothing lengthens
 * each corner's transition while keeping the declared radii within CSS limits.
 */
export const roundedRectPath = (shape: Shape, width: number, height: number): string => {
  const radii = normalizedCornerRadii(shape, width, height);
  const smoothing = Math.max(0, Math.min(1, shape.cornerSmoothing ?? 0));
  const transition = (radius: number) => Math.min(radius * (1 + smoothing * 0.6), width / 2, height / 2);
  const tl = transition(radii.topLeft);
  const tr = transition(radii.topRight);
  const br = transition(radii.bottomRight);
  const bl = transition(radii.bottomLeft);
  const control = 0.5522847498 + smoothing * 0.12;
  const corner = (radius: number) => Math.max(0, radius * control);
  return [
    `M ${tl} 0`,
    `H ${width - tr}`,
    `C ${width - tr + corner(tr)} 0 ${width} ${tr - corner(tr)} ${width} ${tr}`,
    `V ${height - br}`,
    `C ${width} ${height - br + corner(br)} ${width - br + corner(br)} ${height} ${width - br} ${height}`,
    `H ${bl}`,
    `C ${bl - corner(bl)} ${height} 0 ${height - bl + corner(bl)} 0 ${height - bl}`,
    `V ${tl}`,
    `C 0 ${tl - corner(tl)} ${tl - corner(tl)} 0 ${tl} 0`,
    "Z",
  ].join(" ");
};

export const strokeDashArray = (stroke: Pick<ShapeStroke, "style" | "width">): string | undefined =>
  stroke.style === "dashed" ? `${stroke.width * 4} ${stroke.width * 2}`
    : stroke.style === "dotted" ? `${stroke.width} ${stroke.width * 2}`
      : undefined;
