import type { Shape } from "../../classes/shape";
import { shapeBounds } from "../../editor/geometry";
import {
  shapePathData,
  vectorNetworkPathData,
  vectorPathData,
} from "../../editor/graphics";
import styles from "./ShapeGraphic.module.css";

export const ShapeVectorGraphic = ({ shape }: { shape: Shape }) => {
  const bounds = shapeBounds(shape);
  const viewBox = `0 0 ${Math.max(1, bounds.width)} ${Math.max(1, bounds.height)}`;
  if (shape.type === "boolean" && shape.booleanChildren?.length) {
    const id = `boolean-${shape.id.replace(/[^a-z0-9]/gi, "")}`;
    const paths = shape.booleanChildren.map((child) => shapePathData(child, bounds));
    if (shape.booleanOperation === "subtract") {
      return (
        <svg className={styles.vectorGraphic} viewBox={viewBox} preserveAspectRatio="none" aria-hidden="true">
          <defs>
            <mask id={`${id}-mask`}>
              <rect width="100%" height="100%" fill="black" />
              <path d={paths[0]} fill="white" />
              {paths.slice(1).map((path, index) => <path key={index} d={path} fill="black" />)}
            </mask>
          </defs>
          <rect width="100%" height="100%" fill={shape.backgroundColor ?? "#fff"} mask={`url(#${id}-mask)`} />
        </svg>
      );
    }
    if (shape.booleanOperation === "intersect") {
      return (
        <svg className={styles.vectorGraphic} viewBox={viewBox} preserveAspectRatio="none" aria-hidden="true">
          <defs><clipPath id={`${id}-clip`}><path d={paths[0]} /></clipPath></defs>
          {paths.slice(1).map((path, index) => (
            <path
              key={index}
              d={path}
              fill={shape.backgroundColor ?? "#fff"}
              clipPath={`url(#${id}-clip)`}
            />
          ))}
        </svg>
      );
    }
    return (
      <svg className={styles.vectorGraphic} viewBox={viewBox} preserveAspectRatio="none" aria-hidden="true">
        {shape.booleanOperation === "exclude"
          ? <path d={paths.join(" ")} fill={shape.backgroundColor ?? "#fff"} fillRule="evenodd" />
          : paths.map((path, index) => (
            <path key={index} d={path} fill={shape.backgroundColor ?? "#fff"} />
          ))}
      </svg>
    );
  }
  return (
    <svg className={styles.vectorGraphic} viewBox={viewBox} preserveAspectRatio="none" aria-hidden="true">
      <path
        d={shape.vectorPaths?.length ? vectorNetworkPathData(shape.vectorPoints ?? [], shape.vectorPaths, bounds) : vectorPathData(shape.vectorPoints ?? [], bounds, shape.vectorClosed)}
        fill={shape.vectorClosed ? shape.backgroundColor ?? "transparent" : "none"}
        stroke={shape.borderColor ?? "#fff"}
        strokeWidth={shape.borderWidth ?? 1}
        strokeLinecap={shape.strokeCap === "round" ? "round" : shape.strokeCap === "square" ? "square" : "butt"}
        strokeLinejoin={shape.strokeJoin ?? "miter"}
        strokeDasharray={shape.strokeDash?.join(" ")}
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
};
