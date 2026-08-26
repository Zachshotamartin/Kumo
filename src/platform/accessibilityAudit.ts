import type { Shape } from "../classes/shape.js";

export interface AccessibilityFinding {
  shapeId: string;
  severity: "error" | "warning";
  rule: "image-alt" | "link-name" | "contrast" | "focus-order" | "touch-target";
  message: string;
}

const parseHex = (value: string) => {
  const normalized = value.replace("#", "");
  if (!/^[0-9a-f]{6}$/i.test(normalized)) return null;
  return [0, 2, 4].map((index) => Number.parseInt(normalized.slice(index, index + 2), 16) / 255);
};

const luminance = (value: string) => {
  const rgb = parseHex(value);
  if (!rgb) return null;
  const channels = rgb.map((channel) => channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
  return channels[0]! * 0.2126 + channels[1]! * 0.7152 + channels[2]! * 0.0722;
};

export const contrastRatio = (foreground: string, background: string) => {
  const first = luminance(foreground);
  const second = luminance(background);
  if (first === null || second === null) return null;
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
};

export const auditAccessibility = (shapes: Shape[]): AccessibilityFinding[] => shapes.flatMap((shape) => {
  const findings: AccessibilityFinding[] = [];
  if ((shape.type === "image" || shape.semanticRole === "image") && !shape.altText?.trim()) {
    findings.push({ shapeId: shape.id, severity: "error", rule: "image-alt", message: "Images need alternative text." });
  }
  if ((shape.semanticRole === "button" || shape.semanticRole === "link") && !(shape.text ?? shape.name)?.trim()) {
    findings.push({ shapeId: shape.id, severity: "error", rule: "link-name", message: "Interactive layers need an accessible name." });
  }
  if (shape.type === "text" && shape.color && shape.backgroundColor) {
    const ratio = contrastRatio(shape.color, shape.backgroundColor);
    if (ratio !== null && ratio < ((shape.fontSize ?? 18) >= 24 ? 3 : 4.5)) findings.push({ shapeId: shape.id, severity: "error", rule: "contrast", message: `Text contrast is ${ratio.toFixed(2)}:1.` });
  }
  if (shape.focusOrder !== undefined && shape.focusOrder < 1) findings.push({ shapeId: shape.id, severity: "warning", rule: "focus-order", message: "Focus order must be a positive number." });
  if ((shape.semanticRole === "button" || shape.semanticRole === "link") && (shape.width < 44 || shape.height < 44)) findings.push({ shapeId: shape.id, severity: "warning", rule: "touch-target", message: "Interactive targets should be at least 44×44." });
  return findings;
});
