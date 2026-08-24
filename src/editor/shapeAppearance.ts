import type { CSSProperties } from "react";
import type { Shape } from "../classes/shape";
import { effectStyles, gradientCss } from "./graphics";
import { mediaCropCss, mediaFilterCss } from "../platform/productCapabilities";

/** The canonical visual style for a Kumo shape at a given canvas zoom. */
export const shapeAppearanceStyle = (shape: Shape, zoom: number): CSSProperties => ({
  borderRadius: shape.type === "ellipse" ? "50%" : `${shape.borderRadius ?? 0}px`,
  border: shape.type === "vector" || shape.type === "boolean"
    ? 0
    : `${Math.max(0, (shape.borderWidth ?? 0) * zoom)}px ${shape.borderStyle ?? "solid"} ${shape.borderColor ?? "transparent"}`,
  backgroundColor: shape.backgroundColor ?? "transparent",
  backgroundImage: shape.backgroundImage ? `url(${shape.backgroundImage})` : gradientCss(shape),
  backgroundSize: mediaCropCss(shape)?.backgroundSize ?? (shape.imageFit === "fit" ? "contain" : shape.imageFit === "tile" ? "auto" : "cover"),
  backgroundRepeat: shape.imageFit === "tile" ? "repeat" : "no-repeat",
  backgroundPosition: mediaCropCss(shape)?.backgroundPosition ?? "center",
  filter: shape.backgroundImage ? mediaFilterCss(shape) : undefined,
  opacity: shape.opacity ?? 1,
  color: shape.color ?? "#f7f7f5",
  zIndex: shape.zIndex,
  mixBlendMode: shape.blendMode as CSSProperties["mixBlendMode"],
  ...effectStyles(shape),
});
