import { ArrowLeft, ArrowsOutSimple, X } from "@phosphor-icons/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import type { Shape } from "../../classes/shape";
import { displayTextLines } from "../../editor/layout";
import { shapeBounds } from "../../editor/geometry";
import { effectStyles, gradientCss, shapePathData, vectorPathData } from "../../editor/graphics";
import { interactionForTrigger, shapesInPrototypeFrame, startPrototypeFrame, type PrototypeInteraction } from "../../editor/prototype";
import { swapInstanceVariant } from "../../editor/designSystem";
import { frameClipInsets } from "../../editor/snapping";
import { setPresentationFrameId, setPresentationMode } from "../../features/editor/editorSlice";
import { clearSelectedShapes } from "../../features/selected/selectedSlice";
import { setWhiteboardData } from "../../features/whiteBoard/whiteBoardSlice";
import { getBoard } from "../../services/boardRepository";
import type { AppDispatch, RootState } from "../../store";
import styles from "./EditorWorkspace.module.css";

const safeExternalUrl = (value?: string) => {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
};

const PrototypeVector = ({ shape }: { shape: Shape }) => {
  const bounds = shapeBounds(shape);
  const viewBox = `0 0 ${Math.max(1, bounds.width)} ${Math.max(1, bounds.height)}`;
  if (shape.type === "boolean" && shape.booleanChildren?.length) {
    const paths = shape.booleanChildren.map((child) => shapePathData(child, bounds));
    return <svg width="100%" height="100%" viewBox={viewBox} preserveAspectRatio="none" aria-hidden="true">
      <path d={paths.join(" ")} fill={shape.backgroundColor ?? "#fff"} fillRule={shape.booleanOperation === "union" ? "nonzero" : "evenodd"} />
    </svg>;
  }
  return <svg width="100%" height="100%" viewBox={viewBox} preserveAspectRatio="none" aria-hidden="true">
    <path d={vectorPathData(shape.vectorPoints ?? [], bounds, shape.vectorClosed)} fill={shape.vectorClosed ? shape.backgroundColor ?? "transparent" : "none"} stroke={shape.borderColor ?? "#fff"} strokeWidth={shape.borderWidth ?? 1} vectorEffect="non-scaling-stroke" />
  </svg>;
};

const PresentationView = () => {
  const dispatch = useDispatch<AppDispatch>();
  const board = useSelector((state: RootState) => state.whiteBoard);
  const requestedFrameId = useSelector((state: RootState) => state.editor.presentationFrameId);
  const initial = board.shapes.find((shape) => shape.id === requestedFrameId && shape.type === "frame") ?? startPrototypeFrame(board.shapes);
  const [frameId, setFrameId] = useState(initial?.id ?? null);
  const [history, setHistory] = useState<string[]>([]);
  const [localShapes, setLocalShapes] = useState(board.shapes);
  const [error, setError] = useState<string | null>(null);
  const pointerStart = useRef<{ id: string; x: number; y: number } | null>(null);
  const draggedShape = useRef<string | null>(null);
  const frame = localShapes.find((shape) => shape.id === frameId);
  const frameBounds = frame ? shapeBounds(frame) : null;
  const visible = useMemo(() => frameId ? shapesInPrototypeFrame(localShapes, frameId) : [], [frameId, localShapes]);

  const close = useCallback(() => {
    dispatch(setPresentationMode(false));
    dispatch(setPresentationFrameId(null));
  }, [dispatch]);

  const goBack = useCallback(() => {
    setHistory((current) => {
      const previous = current.at(-1);
      if (previous) setFrameId(previous);
      return current.slice(0, -1);
    });
  }, []);

  const execute = useCallback(async (shape: Shape, interaction?: PrototypeInteraction) => {
    if (!interaction) return;
    if (interaction.action === "navigate" && interaction.destinationId) {
      setHistory((current) => frameId ? [...current, frameId] : current);
      setFrameId(interaction.destinationId);
      return;
    }
    if (interaction.action === "back") {
      goBack();
      return;
    }
    if (interaction.action === "change-to" && interaction.destinationId && shape.instanceRootId) {
      setLocalShapes((current) => swapInstanceVariant(current, shape.instanceRootId!, interaction.destinationId!));
      return;
    }
    if (interaction.action === "open-url") {
      const url = safeExternalUrl(interaction.url);
      if (url) window.open(url, "_blank", "noopener,noreferrer");
      return;
    }
    if (interaction.action === "open-board" && interaction.boardId) {
      try {
        setError(null);
        const next = await getBoard(interaction.boardId);
        dispatch(clearSelectedShapes());
        dispatch(setWhiteboardData(next));
        close();
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "We couldn't open the linked board.");
      }
    }
  }, [close, dispatch, frameId, goBack]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
      if (event.key === "ArrowLeft") goBack();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [close, goBack]);

  useEffect(() => {
    const timers = visible.flatMap((shape) => shape.prototypeInteractions
      ?.filter((interaction) => interaction.trigger === "after-delay")
      .map((interaction) => window.setTimeout(() => void execute(shape, interaction), Math.max(0, interaction.delay ?? 0.8) * 1000)) ?? []);
    return () => timers.forEach(window.clearTimeout);
  }, [execute, visible]);

  if (!frame || !frameBounds) {
    return <div className={styles.presentationEmpty} role="dialog" aria-modal="true"><p>Create a top-level frame to present this prototype.</p><button type="button" onClick={close}>Return to editor</button></div>;
  }

  return (
    <div className={styles.presentationOverlay} role="dialog" aria-modal="true" aria-label="Prototype presentation">
      <header>
        <button type="button" aria-label="Back" disabled={!history.length} onClick={goBack}><ArrowLeft aria-hidden="true" /></button>
        <span>{frame.name ?? "Prototype"}</span>
        <span><ArrowsOutSimple aria-hidden="true" /> Fit</span>
        <button type="button" aria-label="Close presentation" onClick={close}><X aria-hidden="true" /></button>
      </header>
      <div className={styles.presentationStage}>
        <div
          className={styles.presentationFrame}
          style={{
            aspectRatio: `${Math.max(1, frameBounds.width)} / ${Math.max(1, frameBounds.height)}`,
            background: frame.backgroundColor ?? board.backGroundColor,
          }}
        >
          {visible.filter((shape) => shape.id !== frame.id && !shape.isMask).sort((left, right) => left.zIndex - right.zIndex || left.id.localeCompare(right.id)).map((shape) => {
            const bounds = shapeBounds(shape);
            const left = (bounds.x - frameBounds.x) / frameBounds.width * 100;
            const top = (bounds.y - frameBounds.y) / frameBounds.height * 100;
            const click = interactionForTrigger(shape, "click");
            const hover = interactionForTrigger(shape, "hover");
            const drag = interactionForTrigger(shape, "drag");
            const clip = frameClipInsets(localShapes, shape);
            const mask = shape.maskId ? localShapes.find((candidate) => candidate.id === shape.maskId) : undefined;
            const maskBounds = mask ? shapeBounds(mask) : null;
            const clipPath = maskBounds
              ? mask?.type === "ellipse"
                ? `ellipse(${maskBounds.width / 2 / bounds.width * 100}% ${maskBounds.height / 2 / bounds.height * 100}% at ${(maskBounds.x + maskBounds.width / 2 - bounds.x) / bounds.width * 100}% ${(maskBounds.y + maskBounds.height / 2 - bounds.y) / bounds.height * 100}%)`
                : `inset(${Math.max(0, maskBounds.y - bounds.y) / bounds.height * 100}% ${Math.max(0, bounds.x + bounds.width - maskBounds.x - maskBounds.width) / bounds.width * 100}% ${Math.max(0, bounds.y + bounds.height - maskBounds.y - maskBounds.height) / bounds.height * 100}% ${Math.max(0, maskBounds.x - bounds.x) / bounds.width * 100}%)`
              : clip
                ? `inset(${clip.top / bounds.height * 100}% ${clip.right / bounds.width * 100}% ${clip.bottom / bounds.height * 100}% ${clip.left / bounds.width * 100}%)`
                : undefined;
            return (
              <button
                type="button"
                key={shape.id}
                className={styles.presentationShape}
                aria-label={shape.name ?? shape.type}
                style={{
                  left: `${left}%`, top: `${top}%`, width: `${bounds.width / frameBounds.width * 100}%`, height: `${bounds.height / frameBounds.height * 100}%`,
                  borderRadius: shape.type === "ellipse" ? "50%" : shape.borderRadius,
                  border: shape.type === "vector" || shape.type === "boolean" ? 0 : `${shape.borderWidth ?? 0}px ${shape.borderStyle ?? "solid"} ${shape.borderColor ?? "transparent"}`,
                  background: shape.type === "vector" || shape.type === "boolean" ? "transparent" : gradientCss(shape) ?? shape.backgroundColor,
                  backgroundImage: shape.backgroundImage ? `url(${shape.backgroundImage})` : gradientCss(shape),
                  color: shape.color,
                  opacity: shape.opacity,
                  fontFamily: shape.fontFamily,
                  fontSize: shape.fontSize,
                  fontWeight: shape.fontWeight,
                  transform: `rotate(${shape.rotation ?? 0}deg) scaleX(${shape.flipX ? -1 : 1}) scaleY(${shape.flipY ? -1 : 1})`,
                  cursor: click || hover || drag ? "pointer" : "default",
                  zIndex: shape.zIndex,
                  mixBlendMode: shape.blendMode,
                  lineHeight: shape.lineHeight,
                  letterSpacing: shape.letterSpacing,
                  textAlign: shape.textAlign as React.CSSProperties["textAlign"],
                  textDecoration: shape.textDecoration,
                  clipPath,
                  ...effectStyles(shape),
                }}
                onClick={() => {
                  if (draggedShape.current === shape.id) {
                    draggedShape.current = null;
                    return;
                  }
                  void execute(shape, click);
                }}
                onMouseEnter={() => void execute(shape, hover)}
                onPointerDown={(event) => { pointerStart.current = { id: shape.id, x: event.clientX, y: event.clientY }; }}
                onPointerUp={(event) => {
                  const start = pointerStart.current;
                  pointerStart.current = null;
                  if (!start || start.id !== shape.id || Math.hypot(event.clientX - start.x, event.clientY - start.y) < 4) return;
                  draggedShape.current = shape.id;
                  void execute(shape, drag);
                }}
              >
                {(shape.type === "vector" || shape.type === "boolean") && <PrototypeVector shape={shape} />}
                {shape.type === "text" ? displayTextLines(shape).join("\n") : shape.type === "board" ? shape.title : null}
              </button>
            );
          })}
        </div>
      </div>
      {error && <p className={styles.presentationError} role="alert">{error}</p>}
    </div>
  );
};

export default PresentationView;
