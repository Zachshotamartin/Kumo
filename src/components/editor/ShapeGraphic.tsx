import type { Shape } from "../../classes/shape";
import { shapeBounds } from "../../editor/geometry";
import {
  shapePathData,
  vectorNetworkPathData,
  vectorPathData,
} from "../../editor/graphics";
import {
  roundedRectPath,
  shapeUsesSvgSurface,
  strokeDashArray,
  visibleShapeFills,
  visibleShapeStrokes,
  type ShapeFill,
  type ShapeStroke,
} from "../../editor/shapePaint";
import styles from "./ShapeGraphic.module.css";

const graphicId = (prefix: string, shape: Shape, suffix = "") =>
  `${prefix}-${shape.id}-${suffix}`.replace(/[^a-z0-9_-]/gi, "");

const fillId = (shape: Shape, fill: ShapeFill) => graphicId("paint", shape, fill.id);

const paintValue = (shape: Shape, fill: ShapeFill) => {
  if (fill.type === "solid") return fill.color ?? "transparent";
  if (fill.type === "image" ? !fill.imageUrl : !fill.gradientStops?.length) return "transparent";
  return `url(#${fillId(shape, fill)})`;
};

const PaintDefinitions = ({ shape, path, width, height }: { shape: Shape; path: string; width: number; height: number }) => {
  const padding = Math.max(1, ...visibleShapeStrokes(shape).map((stroke) => stroke.width * 2));
  const clipId = graphicId("paint-clip", shape);
  const outsideId = graphicId("paint-outside", shape);
  return <defs>
    {visibleShapeFills(shape).map((fill) => {
      if ((fill.type === "linear-gradient" || fill.type === "radial-gradient") && fill.gradientStops?.length) {
        const stops = [...fill.gradientStops].sort((left, right) => left.position - right.position).map((stop) => (
          <stop key={stop.id} offset={`${Math.max(0, Math.min(1, stop.position)) * 100}%`} stopColor={stop.color} stopOpacity={Math.max(0, Math.min(1, stop.opacity * fill.opacity))} />
        ));
        return fill.type === "radial-gradient"
          ? <radialGradient id={fillId(shape, fill)} key={fill.id}>{stops}</radialGradient>
          : <linearGradient id={fillId(shape, fill)} key={fill.id} gradientTransform={`rotate(${fill.gradientAngle ?? 90} .5 .5)`}>{stops}</linearGradient>;
      }
      if (fill.type === "image" && fill.imageUrl) {
        return <pattern id={fillId(shape, fill)} key={fill.id} width="1" height="1" patternContentUnits="objectBoundingBox">
          <image href={fill.imageUrl} width="1" height="1" preserveAspectRatio="xMidYMid slice" />
        </pattern>;
      }
      return null;
    })}
    <clipPath id={clipId}><path d={path} /></clipPath>
    <mask id={outsideId} maskUnits="userSpaceOnUse" x={-padding} y={-padding} width={width + padding * 2} height={height + padding * 2}>
      <rect x={-padding} y={-padding} width={width + padding * 2} height={height + padding * 2} fill="white" />
      <path d={path} fill="black" />
    </mask>
  </defs>;
};

const paintedPaths = (shape: Shape, path: string, closed: boolean, includeFallbackFill = true, fillRule?: "nonzero" | "evenodd") => {
  const fills = visibleShapeFills(shape);
  const strokes = visibleShapeStrokes(shape);
  const legacyWidth = shape.borderWidth ?? (shape.type === "vector" ? 1 : 0);
  const fallbackStroke: ShapeStroke | null = legacyWidth > 0 ? {
    id: "legacy",
    color: shape.borderColor ?? (shape.type === "vector" ? "#fff" : "transparent"),
    width: legacyWidth,
    opacity: 1,
    visible: true,
    style: shape.borderStyle === "dashed" ? "dashed" : shape.borderStyle === "dotted" ? "dotted" : "solid",
    align: "center",
  } : null;
  const activeStrokes = strokes.length ? strokes : fallbackStroke ? [fallbackStroke] : [];
  const clipId = graphicId("paint-clip", shape);
  const outsideId = graphicId("paint-outside", shape);
  return <>
    {closed && (fills.length
      ? fills.map((fill) => <path
          key={`fill:${fill.id}`}
          d={path}
          fill={paintValue(shape, fill)}
          fillOpacity={fill.type === "linear-gradient" || fill.type === "radial-gradient" ? 1 : fill.opacity}
          fillRule={fillRule}
          style={{ mixBlendMode: fill.blendMode ?? "normal" }}
        />)
      : includeFallbackFill ? <path d={path} fill={shape.backgroundColor ?? "transparent"} fillRule={fillRule} /> : null)}
    {activeStrokes.map((stroke) => {
      const aligned = closed ? stroke.align : "center";
      return <path
        key={`stroke:${stroke.id}`}
        d={path}
        fill="none"
        stroke={stroke.color}
        strokeOpacity={Math.max(0, Math.min(1, stroke.opacity))}
        strokeWidth={aligned === "center" ? stroke.width : stroke.width * 2}
        strokeDasharray={stroke.id === "legacy" && shape.strokeDash?.length ? shape.strokeDash.join(" ") : strokeDashArray(stroke)}
        strokeLinecap={stroke.style === "dotted" || shape.strokeCap === "round" ? "round" : shape.strokeCap === "square" ? "square" : "butt"}
        strokeLinejoin={shape.strokeJoin ?? "miter"}
        vectorEffect="non-scaling-stroke"
        clipPath={aligned === "inside" ? `url(#${clipId})` : undefined}
        mask={aligned === "outside" ? `url(#${outsideId})` : undefined}
      />;
    })}
  </>;
};

export const ShapeSurfaceGraphic = ({ shape }: { shape: Shape }) => {
  if (!shapeUsesSvgSurface(shape) || ["vector", "boolean", "connector"].includes(shape.type)) return null;
  const bounds = shapeBounds(shape);
  const width = Math.max(1, bounds.width);
  const height = Math.max(1, bounds.height);
  const path = shape.type === "ellipse"
    ? `M ${width / 2} 0 A ${width / 2} ${height / 2} 0 1 1 ${width / 2} ${height} A ${width / 2} ${height / 2} 0 1 1 ${width / 2} 0 Z`
    : roundedRectPath(shape, width, height);
  const hasFills = visibleShapeFills(shape).length > 0;
  const clipId = graphicId("paint-clip", shape);
  return <svg className={styles.surfaceGraphic} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-hidden="true">
    <PaintDefinitions shape={shape} path={path} width={width} height={height} />
    {!hasFills && <path d={path} fill={shape.backgroundColor ?? "transparent"} />}
    {!hasFills && shape.backgroundImage && <image href={shape.backgroundImage} width={width} height={height} preserveAspectRatio={shape.imageFit === "fit" ? "xMidYMid meet" : "xMidYMid slice"} clipPath={`url(#${clipId})`} />}
    {paintedPaths(shape, path, true, hasFills)}
  </svg>;
};

export const ShapeVectorGraphic = ({ shape }: { shape: Shape }) => {
  const bounds = shapeBounds(shape);
  const viewBox = `0 0 ${Math.max(1, bounds.width)} ${Math.max(1, bounds.height)}`;
  if (shape.type === "boolean" && shape.booleanChildren?.length) {
    const id = `boolean-${shape.id.replace(/[^a-z0-9]/gi, "")}`;
    const paths = shape.booleanChildren.map((child) => shapePathData(child, bounds));
    if (shape.booleanOperation === "intersect") {
      let content = paintedPaths(shape, paths[0] ?? "", true);
      paths.slice(1).forEach((_path, index) => {
        content = <g clipPath={`url(#${id}-clip-${index})`}>{content}</g>;
      });
      return (
        <svg className={styles.vectorGraphic} viewBox={viewBox} preserveAspectRatio="none" aria-hidden="true">
          <PaintDefinitions shape={shape} path={paths[0] ?? ""} width={Math.max(1, bounds.width)} height={Math.max(1, bounds.height)} />
          <defs>{paths.slice(1).map((path, index) => <clipPath id={`${id}-clip-${index}`} key={index}><path d={path} /></clipPath>)}</defs>
          {content}
        </svg>
      );
    }
    const fillRule = shape.booleanOperation === "union" ? "nonzero" : "evenodd";
    const path = paths.join(" ");
    return (
      <svg className={styles.vectorGraphic} viewBox={viewBox} preserveAspectRatio="none" aria-hidden="true">
        <PaintDefinitions shape={shape} path={path} width={Math.max(1, bounds.width)} height={Math.max(1, bounds.height)} />
        {paintedPaths(shape, path, true, true, fillRule)}
      </svg>
    );
  }
  return (
    <svg className={styles.vectorGraphic} viewBox={viewBox} preserveAspectRatio="none" aria-hidden="true">
      {(() => {
        const path = shape.vectorPaths?.length ? vectorNetworkPathData(shape.vectorPoints ?? [], shape.vectorPaths, bounds) : vectorPathData(shape.vectorPoints ?? [], bounds, shape.vectorClosed);
        return <>
          <PaintDefinitions shape={shape} path={path} width={Math.max(1, bounds.width)} height={Math.max(1, bounds.height)} />
          {paintedPaths(shape, path, Boolean(shape.vectorClosed))}
        </>;
      })()}
    </svg>
  );
};
