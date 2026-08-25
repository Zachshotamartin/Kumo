import type { Shape } from "../../classes/shape";
import { connectorPath, connectorRenderBounds } from "../../editor/advancedFeatures";
import styles from "./EditorCanvas.module.css";

const markerShape = (kind: Shape["connectorEndCap"], end: boolean) => {
  if (kind === "arrow") return end
    ? <path d="M 0 0 L 10 5 L 0 10 z" fill="context-stroke" />
    : <path d="M 10 0 L 0 5 L 10 10 z" fill="context-stroke" />;
  if (kind === "circle") return <circle cx="5" cy="5" r="4" fill="context-stroke" />;
  if (kind === "diamond") return <path d="M 5 0 L 10 5 L 5 10 L 0 5 z" fill="context-stroke" />;
  return null;
};

export const AdvancedShapeContent = ({ shape, shapes }: { shape: Shape; shapes: Shape[]; zoom: number }) => {
  if (shape.type === "connector") {
    const bounds = connectorRenderBounds(shapes, shape);
    const markerId = shape.id.replace(/[^a-z0-9_-]/gi, "");
    const startMarker = shape.connectorStartCap && shape.connectorStartCap !== "none" ? `url(#start-${markerId})` : undefined;
    const endMarker = shape.connectorEndCap && shape.connectorEndCap !== "none" ? `url(#end-${markerId})` : undefined;
    return <svg
      className={styles.connectorGraphic}
      viewBox={`0 0 ${Math.max(1, bounds.width)} ${Math.max(1, bounds.height)}`}
      preserveAspectRatio="none"
      aria-label={shape.connectorLabel || "Connector"}
    >
      <defs>
        {startMarker && <marker id={`start-${markerId}`} markerWidth="10" markerHeight="10" refX="5" refY="5" orient="auto-start-reverse" markerUnits="strokeWidth">{markerShape(shape.connectorStartCap, false)}</marker>}
        {endMarker && <marker id={`end-${markerId}`} markerWidth="10" markerHeight="10" refX="5" refY="5" orient="auto" markerUnits="strokeWidth">{markerShape(shape.connectorEndCap, true)}</marker>}
      </defs>
      <path
        d={connectorPath(shapes, shape)}
        fill="none"
        stroke={shape.borderColor ?? "#d9d9d9"}
        strokeOpacity={shape.opacity ?? 1}
        strokeWidth={Math.max(1, shape.borderWidth ?? 2)}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray={shape.strokeDash?.join(" ")}
        markerStart={startMarker}
        markerEnd={endMarker}
        vectorEffect="non-scaling-stroke"
      />
      {shape.connectorLabel && <text x="50%" y="50%" dy="-6" textAnchor="middle" className={styles.connectorLabel}>{shape.connectorLabel}</text>}
    </svg>;
  }
  if (shape.type === "sticky") return <div className={styles.stickyContent}>{shape.text || "Write an idea"}</div>;
  if (shape.type === "table") {
    const cells = shape.tableCells ?? Array.from({ length: shape.rows ?? 3 }, () => Array.from({ length: shape.columns ?? 3 }, () => ""));
    return <div className={styles.tableContent} role="table" style={{ gridTemplateColumns: `repeat(${Math.max(1, shape.columns ?? cells[0]?.length ?? 1)}, minmax(0, 1fr))` }}>
      {cells.flatMap((row, rowIndex) => row.map((cell, columnIndex) => <span key={`${rowIndex}:${columnIndex}`} role="cell" data-header={rowIndex === 0 ? "true" : undefined}>{cell || "\u00a0"}</span>))}
    </div>;
  }
  if (shape.type === "code") return <div className={styles.codeContent}><small>{shape.codeLanguage ?? "plain text"}</small><pre>{shape.text ?? ""}</pre></div>;
  if (shape.type === "link") return <div className={styles.linkContent}>
    {shape.embedImageUrl && <img src={shape.embedImageUrl} alt="" />}
    <span><strong>{shape.embedTitle || "Link preview"}</strong><small>{shape.embedDescription || shape.embedUrl || "Paste a link"}</small></span>
  </div>;
  if (shape.mediaType === "video" && (shape.backgroundImage || shape.embedUrl)) return <video
    className={styles.videoContent}
    src={shape.backgroundImage || shape.embedUrl}
    autoPlay={shape.mediaAutoplay}
    loop={shape.mediaLoop}
    muted={shape.mediaMuted !== false}
    playsInline
  >
    <track kind="captions" src="/empty-captions.vtt" srcLang="en" label="No captions provided" default />
  </video>;
  return null;
};
