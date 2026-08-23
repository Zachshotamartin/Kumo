import { ArrowLeft, ArrowsOutSimple, X } from "@phosphor-icons/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import type { Shape } from "../../classes/shape";
import { displayTextLines } from "../../editor/layout";
import { shapeBounds } from "../../editor/geometry";
import { interactionForTrigger, shapesInPrototypeFrame, startPrototypeFrame, type PrototypeInteraction } from "../../editor/prototype";
import { swapInstanceVariant } from "../../editor/designSystem";
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

const PresentationView = () => {
  const dispatch = useDispatch<AppDispatch>();
  const board = useSelector((state: RootState) => state.whiteBoard);
  const requestedFrameId = useSelector((state: RootState) => state.editor.presentationFrameId);
  const initial = board.shapes.find((shape) => shape.id === requestedFrameId && shape.type === "frame") ?? startPrototypeFrame(board.shapes);
  const [frameId, setFrameId] = useState(initial?.id ?? null);
  const [history, setHistory] = useState<string[]>([]);
  const [localShapes, setLocalShapes] = useState(board.shapes);
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
      const next = await getBoard(interaction.boardId);
      dispatch(clearSelectedShapes());
      dispatch(setWhiteboardData(next));
      close();
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
          {visible.filter((shape) => shape.id !== frame.id).map((shape) => {
            const bounds = shapeBounds(shape);
            const left = (bounds.x - frameBounds.x) / frameBounds.width * 100;
            const top = (bounds.y - frameBounds.y) / frameBounds.height * 100;
            const click = interactionForTrigger(shape, "click");
            const hover = interactionForTrigger(shape, "hover");
            const drag = interactionForTrigger(shape, "drag");
            return (
              <button
                type="button"
                key={shape.id}
                className={styles.presentationShape}
                aria-label={shape.name ?? shape.type}
                style={{
                  left: `${left}%`, top: `${top}%`, width: `${bounds.width / frameBounds.width * 100}%`, height: `${bounds.height / frameBounds.height * 100}%`,
                  borderRadius: shape.type === "ellipse" ? "50%" : shape.borderRadius,
                  border: `${shape.borderWidth ?? 0}px ${shape.borderStyle ?? "solid"} ${shape.borderColor ?? "transparent"}`,
                  backgroundColor: shape.backgroundColor,
                  backgroundImage: shape.backgroundImage ? `url(${shape.backgroundImage})` : undefined,
                  color: shape.color,
                  opacity: shape.opacity,
                  fontFamily: shape.fontFamily,
                  fontSize: shape.fontSize,
                  fontWeight: shape.fontWeight,
                  transform: `rotate(${shape.rotation ?? 0}deg)`,
                  cursor: click || hover || drag ? "pointer" : "default",
                }}
                onClick={() => void execute(shape, click)}
                onMouseEnter={() => void execute(shape, hover)}
                onPointerUp={() => void execute(shape, drag)}
              >
                {shape.type === "text" ? displayTextLines(shape).join("\n") : shape.type === "board" ? shape.title : null}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default PresentationView;
