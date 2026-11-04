import { useState } from "react";
import type { KeyboardEvent, PointerEvent } from "react";
import type { Shape } from "../../classes/shape";
import { RULER_SIZE } from "../../editor/rulers";
import type { Point, Viewport } from "../../editor/types";
import styles from "./EditorCanvas.module.css";

type ClientPoint = Pick<PointerEvent<HTMLElement>, "clientX" | "clientY">;

interface CanvasGuidesProps {
  guides: Shape[];
  viewport: Viewport;
  canEdit: boolean;
  rulers: boolean;
  /** The canvas surface, in client coordinates. */
  bounds: () => DOMRect | undefined;
  toWorld: (point: ClientPoint) => Point;
  onMove: (id: string, value: number) => void;
  onRemove: (id: string) => void;
}

interface GuideDrag {
  id: string;
  pointerId: number;
  /** The guide's coordinate when it was picked up. */
  start: number;
  /** The world coordinate under the pointer when it was picked up, so the guide doesn't jump to the pointer. */
  origin: number;
  value: number;
  removing: boolean;
}

const coordinate = (guide: Shape, point: Point) => guide.guideAxis === "vertical" ? point.x : point.y;

/** A guide released over a ruler, or dragged off the canvas, is put away instead of moved. */
const releasesToRemove = ({ clientX, clientY }: ClientPoint, bounds: DOMRect | undefined, rulers: boolean) => {
  if (!bounds) return false;
  const outside = clientX < bounds.left || clientX > bounds.right || clientY < bounds.top || clientY > bounds.bottom;
  return outside || (rulers && (clientX - bounds.left < RULER_SIZE || clientY - bounds.top < RULER_SIZE));
};

const capturePointer = (element: HTMLElement, pointerId: number) => {
  try { element.setPointerCapture(pointerId); } catch { /* Synthetic and cancelled pointers cannot be captured. */ }
};

const CanvasGuides = ({ guides, viewport, canEdit, rulers, bounds, toWorld, onMove, onRemove }: CanvasGuidesProps) => {
  const [drag, setDrag] = useState<GuideDrag | null>(null);

  const pickUp = (guide: Shape, event: PointerEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    if (!canEdit || event.button !== 0) return;
    event.preventDefault();
    // preventDefault skips the browser's focus-on-press; focus it so Delete removes this guide.
    event.currentTarget.focus({ preventScroll: true });
    capturePointer(event.currentTarget, event.pointerId);
    const start = coordinate(guide, { x: guide.x1, y: guide.y1 });
    setDrag({ id: guide.id, pointerId: event.pointerId, start, origin: coordinate(guide, toWorld(event)), value: start, removing: false });
  };

  const follow = (guide: Shape, event: PointerEvent<HTMLButtonElement>) => {
    if (drag?.id !== guide.id || drag.pointerId !== event.pointerId) return;
    setDrag({ ...drag, value: drag.start + coordinate(guide, toWorld(event)) - drag.origin, removing: releasesToRemove(event, bounds(), rulers) });
  };

  const release = (guide: Shape, event: PointerEvent<HTMLButtonElement>) => {
    if (drag?.id !== guide.id || drag.pointerId !== event.pointerId) return;
    setDrag(null);
    if (releasesToRemove(event, bounds(), rulers)) onRemove(guide.id);
    else {
      const value = drag.start + coordinate(guide, toWorld(event)) - drag.origin;
      if (value !== drag.start) onMove(guide.id, value);
    }
  };

  const removeWithKey = (guide: Shape, event: KeyboardEvent<HTMLButtonElement>) => {
    if (!canEdit || (event.key !== "Delete" && event.key !== "Backspace")) return;
    // The canvas also deletes the selection on Delete; this key belongs to the guide.
    event.preventDefault();
    event.stopPropagation();
    onRemove(guide.id);
  };

  return guides.map((guide) => {
    const vertical = guide.guideAxis === "vertical";
    const dragging = drag?.id === guide.id ? drag : null;
    const value = dragging?.value ?? coordinate(guide, { x: guide.x1, y: guide.y1 });
    const position = (value - (vertical ? viewport.x : viewport.y)) * viewport.zoom;
    const label = `${vertical ? "Vertical" : "Horizontal"} guide at ${Math.round(value)}`;
    return (
      <button
        type="button"
        key={guide.id}
        className={`${styles.persistentGuide} ${vertical ? styles.verticalGuide : styles.horizontalGuide}`}
        style={vertical ? { left: position } : { top: position }}
        aria-label={`${label}. Drag to move. Drag onto a ruler, double-click, or press Delete to remove.`}
        title={canEdit ? "Drag to move. Drag onto a ruler, double-click, or press Delete to remove." : undefined}
        data-dragging={dragging ? "true" : undefined}
        data-removing={dragging?.removing ? "true" : undefined}
        onPointerDown={(event) => pickUp(guide, event)}
        onPointerMove={(event) => follow(guide, event)}
        onPointerUp={(event) => release(guide, event)}
        onPointerCancel={() => setDrag(null)}
        onDoubleClick={(event) => {
          // The canvas double-click edits or opens whatever lies under the guide.
          event.stopPropagation();
          if (canEdit) onRemove(guide.id);
        }}
        onKeyDown={(event) => removeWithKey(guide, event)}
      />
    );
  });
};

export default CanvasGuides;
