import type { CSSProperties } from "react";
import type { Shape } from "../classes/shape";
import { effectStyles, gradientCss } from "./graphics";
import { mediaCropCss, mediaFilterCss } from "../platform/productCapabilities";
import { shapeUsesSvgSurface } from "./shapePaint";

/** The canonical visual style for a Kumo shape at a given canvas zoom. */
export const shapeAppearanceStyle = (shape: Shape, zoom: number): CSSProperties => {
  const stroke = shape.strokes?.filter((candidate) => candidate.visible && candidate.width > 0).at(-1);
  const usesSurface = shapeUsesSvgSurface(shape);
  const radii = shape.cornerRadii;
  const radius = shape.type === "ellipse"
    ? "50%"
    : radii
      ? `${radii.topLeft}px ${radii.topRight}px ${radii.bottomRight}px ${radii.bottomLeft}px`
      : `${shape.borderRadius ?? 0}px`;
  const image = shape.backgroundImage ? `url(${shape.backgroundImage})` : gradientCss(shape);
  const strokeColor = stroke && stroke.opacity < 1
    ? `color-mix(in srgb, ${stroke.color} ${Math.round(stroke.opacity * 100)}%, transparent)`
    : stroke?.color ?? shape.borderColor ?? "transparent";
  return {
    borderRadius: radius,
    border: usesSurface || ["vector", "boolean", "connector"].includes(shape.type)
      ? 0
      : `${Math.max(0, (stroke?.width ?? shape.borderWidth ?? 0) * zoom)}px ${stroke?.style === "dotted" ? "dotted" : stroke?.style === "dashed" ? "dashed" : shape.borderStyle ?? "solid"} ${strokeColor}`,
    backgroundColor: usesSurface ? "transparent" : shape.backgroundColor ?? "transparent",
    backgroundImage: usesSurface ? undefined : image,
    backgroundSize: mediaCropCss(shape)?.backgroundSize ?? (shape.imageFit === "fit" ? "contain" : shape.imageFit === "tile" ? "auto" : "cover"),
    backgroundRepeat: shape.imageFit === "tile" ? "repeat" : "no-repeat",
    backgroundPosition: mediaCropCss(shape)?.backgroundPosition ?? "center",
    filter: shape.backgroundImage ? mediaFilterCss(shape) : undefined,
    opacity: shape.opacity ?? 1,
    color: shape.color ?? "#f7f7f5",
    zIndex: shape.zIndex,
    mixBlendMode: shape.blendMode as CSSProperties["mixBlendMode"],
    ...effectStyles(shape),
  };
};
