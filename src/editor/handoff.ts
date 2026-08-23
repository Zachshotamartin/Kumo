import type { Shape } from "../classes/shape";
import { effectStyles, gradientCss } from "./graphics";
import { shapeBounds } from "./geometry";

const cssValue = (value: string) => value.includes(" ") ? `'${value.replaceAll("'", "\\'")}'` : value;

export const shapeCss = (shape: Shape): string => {
  const bounds = shapeBounds(shape);
  const effects = effectStyles(shape);
  const declarations: Array<[string, string | number | undefined]> = [
    ["position", "absolute"], ["left", `${bounds.x}px`], ["top", `${bounds.y}px`],
    ["width", `${bounds.width}px`], ["height", `${bounds.height}px`],
    ["background", gradientCss(shape) ?? shape.backgroundColor],
    ["color", shape.color], ["border", `${shape.borderWidth ?? 0}px ${shape.borderStyle ?? "solid"} ${shape.borderColor ?? "transparent"}`],
    ["border-radius", `${shape.borderRadius ?? 0}px`], ["opacity", shape.opacity],
    ["font-family", shape.fontFamily ? cssValue(shape.fontFamily) : undefined], ["font-size", shape.fontSize ? `${shape.fontSize}px` : undefined],
    ["font-weight", shape.fontWeight], ["line-height", shape.lineHeight], ["letter-spacing", shape.letterSpacing ? `${shape.letterSpacing}px` : undefined],
    ["text-align", shape.textAlign], ["transform", shape.rotation ? `rotate(${shape.rotation}deg)` : undefined],
    ["mix-blend-mode", shape.blendMode !== "normal" ? shape.blendMode : undefined],
    ["filter", effects.filter], ["box-shadow", effects.boxShadow], ["backdrop-filter", effects.backdropFilter],
  ];
  return `.kumo-${shape.type} {\n${declarations.filter(([, value]) => value !== undefined && value !== "").map(([property, value]) => `  ${property}: ${value};`).join("\n")}\n}`;
};

const escapeJsx = (value: string) => value
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll("{", "&#123;")
  .replaceAll("}", "&#125;");

export const shapeReact = (shape: Shape): string => {
  const candidate = (shape.name ?? shape.type).replace(/[^a-z0-9]/gi, " ").trim().split(/\s+/).map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`).join("") || "KumoLayer";
  const name = /^[A-Za-z_$]/.test(candidate) ? candidate : `Layer${candidate}`;
  const content = shape.type === "text" ? escapeJsx(shape.text ?? "") : shape.type === "board" ? escapeJsx(shape.title ?? "Open board") : "";
  return `export function ${name}() {\n  return <div className="kumo-${shape.type}">${content}</div>;\n}`;
};

export const inspectTokens = (shape: Shape) => ({
  colors: [...new Set([shape.backgroundColor, shape.color, shape.borderColor, ...(shape.gradientStops ?? []).map((stop) => stop.color)].filter(Boolean) as string[])],
  typography: shape.type === "text" ? `${shape.fontWeight ?? "normal"} ${shape.fontSize ?? 18}px/${shape.lineHeight ?? 1.2} ${shape.fontFamily ?? "Arial"}` : null,
  assets: [shape.assetId, shape.fillStyleId, shape.textStyleId, shape.effectStyleId].filter(Boolean) as string[],
  variables: Object.entries(shape.variableBindings ?? {}).map(([property, id]) => ({ property, id })),
});
