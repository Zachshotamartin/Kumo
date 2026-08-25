import type { Shape } from "../classes/shape";
import { boundsToEdges, normalizeShape, shapeBounds } from "./geometry";
import type { Bounds } from "./types";

const bounded = (value: number, minimum?: number, maximum?: number) =>
  Math.min(maximum ?? Infinity, Math.max(minimum ?? 1, value));

const withBounds = (shape: Shape, bounds: Bounds): Shape => normalizeShape({
  ...shape,
  ...boundsToEdges({
    x: bounds.x,
    y: bounds.y,
    width: bounded(bounds.width, shape.minWidth, shape.maxWidth),
    height: bounded(bounds.height, shape.minHeight, shape.maxHeight),
  }),
});

export const transformedText = (shape: Shape): string => {
  const text = shape.text ?? "";
  if (shape.textCase === "upper") return text.toUpperCase();
  if (shape.textCase === "lower") return text.toLowerCase();
  if (shape.textCase === "title") {
    return text.replace(/\b\p{L}/gu, (character) => character.toUpperCase());
  }
  return text;
};

export const displayTextLines = (shape: Shape): string[] => transformedText(shape)
  .split("\n")
  .map((line, index) => shape.listStyle === "bulleted"
    ? `• ${line}`
    : shape.listStyle === "numbered"
      ? `${index + 1}. ${line}`
      : line);

/** A stable browser-independent approximation used only for text auto-sizing. */
export const estimatedTextBounds = (
  shape: Shape,
  wrapWidth?: number
): Pick<Bounds, "width" | "height"> => {
  const fontSize = Math.max(1, shape.fontSize ?? 18);
  const lineHeight = Math.max(0.5, shape.lineHeight ?? 1.2);
  const letterSpacing = shape.letterSpacing ?? 0;
  const lines = transformedText(shape).split("\n");
  const longest = Math.max(1, ...lines.map((line) => line.length));
  const approximateCharacterWidth = Math.max(1, fontSize * 0.56 + letterSpacing);
  const indent = Math.max(0, shape.textIndent ?? 0);
  const width = Math.max(fontSize, longest * approximateCharacterWidth + indent);
  const charactersPerLine = wrapWidth === undefined
    ? Infinity
    : Math.max(1, Math.floor((Math.max(1, wrapWidth) - indent) / approximateCharacterWidth));
  const visualLineCount = lines.reduce(
    (count, line) => count + Math.max(1, Math.ceil(line.length / charactersPerLine)),
    0
  );
  const height = Math.max(
    fontSize * lineHeight,
    visualLineCount * fontSize * lineHeight
      + Math.max(0, lines.length - 1) * (shape.paragraphSpacing ?? 0)
  );
  return { width: Math.ceil(width), height: Math.ceil(height) };
};

export const fitTextShape = (shape: Shape): Shape => {
  if (shape.type !== "text" || (shape.textAutoResize ?? "fixed") === "fixed") return shape;
  const bounds = shapeBounds(shape);
  const estimate = estimatedTextBounds(
    shape,
    shape.textAutoResize === "auto-height" ? bounds.width : undefined
  );
  return withBounds(shape, {
    ...bounds,
    width: shape.textAutoResize === "auto-width" ? estimate.width : bounds.width,
    height: estimate.height,
  });
};

const primarySize = (bounds: Bounds, horizontal: boolean) => horizontal ? bounds.width : bounds.height;
const counterSize = (bounds: Bounds, horizontal: boolean) => horizontal ? bounds.height : bounds.width;

const layoutLine = (
  children: Shape[],
  horizontal: boolean,
  primaryStart: number,
  counterStart: number,
  primaryAvailable: number,
  counterAvailable: number,
  gap: number,
  primaryAlign: Shape["primaryAlign"],
  counterAlign: Shape["counterAlign"]
): Shape[] => {
  const childBounds = children.map(shapeBounds);
  const growing = children.filter((child) => (child.layoutGrow ?? 0) > 0);
  const totalGrow = growing.reduce((sum, child) => sum + child.layoutGrow!, 0);
  const fixedPrimary = children.reduce((sum, child, index) =>
    sum + ((child.layoutGrow ?? 0) > 0 ? 0 : primarySize(childBounds[index]!, horizontal)), 0);
  const availableForGrow = Math.max(0, primaryAvailable - fixedPrimary - gap * Math.max(0, children.length - 1));
  const sized = children.map((child, index) => {
    const bounds = childBounds[index]!;
    const grow = child.layoutGrow ?? 0;
    const nextPrimary = grow > 0 && totalGrow > 0
      ? availableForGrow * (grow / totalGrow)
      : primarySize(bounds, horizontal);
    const align = child.layoutAlign === "inherit" || !child.layoutAlign
      ? counterAlign
      : child.layoutAlign;
    const fillCounter = align === "stretch" || (horizontal
      ? child.verticalSizing === "fill"
      : child.horizontalSizing === "fill");
    return {
      child,
      primary: nextPrimary,
      counter: fillCounter ? counterAvailable : counterSize(bounds, horizontal),
      align,
    };
  });
  const contentPrimary = sized.reduce((sum, item) => sum + item.primary, 0);
  let resolvedGap = gap;
  let cursor = primaryStart;
  const free = Math.max(0, primaryAvailable - contentPrimary - gap * Math.max(0, sized.length - 1));
  if (primaryAlign === "center") cursor += free / 2;
  if (primaryAlign === "end") cursor += free;
  if (primaryAlign === "space-between" && sized.length > 1) {
    resolvedGap = Math.max(gap, (primaryAvailable - contentPrimary) / (sized.length - 1));
  }

  return sized.map((item) => {
    let cross = counterStart;
    if (item.align === "center") cross += (counterAvailable - item.counter) / 2;
    if (item.align === "end") cross += counterAvailable - item.counter;
    const bounds = horizontal
      ? { x: cursor, y: cross, width: item.primary, height: item.counter }
      : { x: cross, y: cursor, width: item.counter, height: item.primary };
    cursor += item.primary + resolvedGap;
    return withBounds(item.child, bounds);
  });
};

const layoutFrame = (shapes: Shape[], frame: Shape): Shape[] => {
  const mode = frame.layoutMode!;
  const direct = shapes
    .filter((shape) => shape.parentId === frame.id && shape.layoutPositioning !== "absolute" && shape.type !== "guide")
    .sort((left, right) => left.zIndex - right.zIndex || left.id.localeCompare(right.id));
  if (!direct.length) return shapes;

  const horizontal = mode === "horizontal" || mode === "grid";
  const gap = Math.max(0, frame.layoutGap ?? 12);
  const counterGap = Math.max(0, frame.layoutCounterGap ?? gap);
  const padding = {
    top: frame.paddingTop ?? 16,
    right: frame.paddingRight ?? 16,
    bottom: frame.paddingBottom ?? 16,
    left: frame.paddingLeft ?? 16,
  };
  const original = shapeBounds(frame);
  const inner = {
    x: original.x + padding.left,
    y: original.y + padding.top,
    width: Math.max(1, original.width - padding.left - padding.right),
    height: Math.max(1, original.height - padding.top - padding.bottom),
  };

  let lines: Shape[][] = [direct];
  if (mode === "grid") {
    const columns = Math.max(1, Math.ceil(Math.sqrt(direct.length)));
    lines = Array.from({ length: Math.ceil(direct.length / columns) }, (_, index) =>
      direct.slice(index * columns, (index + 1) * columns));
  } else if (frame.layoutWrap) {
    lines = [];
    let line: Shape[] = [];
    let used = 0;
    const available = horizontal ? inner.width : inner.height;
    direct.forEach((child) => {
      const size = primarySize(shapeBounds(child), horizontal);
      const next = line.length ? used + gap + size : size;
      if (line.length && next > available) {
        lines.push(line);
        line = [child];
        used = size;
      } else {
        line.push(child);
        used = next;
      }
    });
    lines.push(line);
  }

  const lineCounterSizes = lines.map((line) => Math.max(1, ...line.map((shape) => counterSize(shapeBounds(shape), horizontal))));
  let counterCursor = horizontal ? inner.y : inner.x;
  const laidOut: Shape[] = [];
  lines.forEach((line, index) => {
    const counter = lineCounterSizes[index]!;
    laidOut.push(...layoutLine(
      line,
      horizontal,
      horizontal ? inner.x : inner.y,
      counterCursor,
      horizontal ? inner.width : inner.height,
      mode === "grid" ? counter : (lines.length === 1 ? (horizontal ? inner.height : inner.width) : counter),
      gap,
      frame.primaryAlign,
      frame.counterAlign
    ));
    counterCursor += counter + counterGap;
  });

  const contentPrimary = lines.length === 1
    ? lines[0]!.reduce((sum, shape) => sum + primarySize(shapeBounds(laidOut.find((item) => item.id === shape.id)!), horizontal), 0) + gap * Math.max(0, lines[0]!.length - 1)
    : Math.max(...lines.map((line) => line.reduce((sum, shape) => sum + primarySize(shapeBounds(shape), horizontal), 0) + gap * Math.max(0, line.length - 1)));
  const contentCounter = lineCounterSizes.reduce((sum, size) => sum + size, 0) + counterGap * Math.max(0, lines.length - 1);
  const nextFrameBounds = {
    ...original,
    width: frame.horizontalSizing === "hug"
      ? (horizontal ? contentPrimary + padding.left + padding.right : contentCounter + padding.left + padding.right)
      : original.width,
    height: frame.verticalSizing === "hug"
      ? (horizontal ? contentCounter + padding.top + padding.bottom : contentPrimary + padding.top + padding.bottom)
      : original.height,
  };
  const replacements = new Map(laidOut.map((shape) => [shape.id, shape]));
  laidOut.forEach((shape) => {
    const source = direct.find((item) => item.id === shape.id)!;
    if (source.type !== "frame") return;
    const before = shapeBounds(source);
    const after = shapeBounds(shape);
    const offset = { x: after.x - before.x, y: after.y - before.y };
    if (!offset.x && !offset.y) return;
    const descendants = new Set<string>();
    let changed = true;
    while (changed) {
      const size = descendants.size;
      shapes.forEach((candidate) => {
        if (candidate.parentId === source.id || (candidate.parentId && descendants.has(candidate.parentId))) {
          descendants.add(candidate.id);
        }
      });
      changed = descendants.size !== size;
    }
    descendants.forEach((id) => {
      const descendant = (replacements.get(id) ?? shapes.find((item) => item.id === id))!;
      replacements.set(id, normalizeShape({
        ...descendant,
        x1: descendant.x1 + offset.x,
        x2: descendant.x2 + offset.x,
        y1: descendant.y1 + offset.y,
        y2: descendant.y2 + offset.y,
      }));
    });
  });
  replacements.set(frame.id, withBounds(frame, nextFrameBounds));
  return shapes.map((shape) => replacements.get(shape.id) ?? shape);
};

const frameDepth = (shapes: Shape[], frame: Shape): number => {
  let depth = 0;
  let parentId = frame.parentId;
  const visited = new Set<string>();
  while (parentId && !visited.has(parentId)) {
    visited.add(parentId);
    depth += 1;
    parentId = shapes.find((shape) => shape.id === parentId)?.parentId;
  }
  return depth;
};

/** Reflows nested frames from the inside out, then fits auto-sized text. */
export const applyDocumentLayout = (input: Shape[]): Shape[] => {
  let shapes = input.map(fitTextShape);
  const frames = shapes
    .filter((shape) => shape.type === "frame" && shape.layoutMode && shape.layoutMode !== "none")
    .sort((left, right) => frameDepth(shapes, right) - frameDepth(shapes, left));
  frames.forEach((source) => {
    const current = shapes.find((shape) => shape.id === source.id)!;
    shapes = layoutFrame(shapes, current);
  });
  return shapes.map(normalizeShape);
};

const resolveAxisConstraint = (
  mode: Shape["constraintHorizontal"] | Shape["constraintVertical"],
  start: number,
  size: number,
  previousStart: number,
  previousSize: number,
  nextStart: number,
  nextSize: number
): { start: number; size: number } => {
  const leading = start - previousStart;
  const trailing = previousStart + previousSize - (start + size);
  if (mode === "right" || mode === "bottom") return { start: nextStart + nextSize - trailing - size, size };
  if (mode === "left-right" || mode === "top-bottom") {
    return { start: nextStart + leading, size: Math.max(1, nextSize - leading - trailing) };
  }
  if (mode === "center") {
    const offset = start + size / 2 - (previousStart + previousSize / 2);
    return { start: nextStart + nextSize / 2 + offset - size / 2, size };
  }
  if (mode === "scale") {
    const ratio = previousSize > 0 ? nextSize / previousSize : 1;
    return { start: nextStart + leading * ratio, size: Math.max(1, size * ratio) };
  }
  return { start: nextStart + leading, size };
};

/** Applies Figma-style constraints to every direct, non-auto-layout child after a frame resize. */
export const constrainFrameChildren = (
  baseline: Shape[],
  resized: Shape[],
  frameId: string
): Shape[] => {
  const beforeFrame = baseline.find((shape) => shape.id === frameId);
  const afterFrame = resized.find((shape) => shape.id === frameId);
  if (!beforeFrame || !afterFrame || beforeFrame.layoutMode !== "none" && beforeFrame.layoutMode !== undefined) return resized;
  const before = shapeBounds(beforeFrame);
  const after = shapeBounds(afterFrame);
  const next = new Map<string, Shape>();
  baseline.filter((shape) => shape.parentId === frameId).forEach((child) => {
    const bounds = shapeBounds(child);
    const horizontal = resolveAxisConstraint(child.constraintHorizontal, bounds.x, bounds.width, before.x, before.width, after.x, after.width);
    const vertical = resolveAxisConstraint(child.constraintVertical, bounds.y, bounds.height, before.y, before.height, after.y, after.height);
    next.set(child.id, withBounds(child, {
      x: horizontal.start,
      y: vertical.start,
      width: horizontal.size,
      height: vertical.size,
    }));
  });
  return resized.map((shape) => next.get(shape.id) ?? shape);
};
