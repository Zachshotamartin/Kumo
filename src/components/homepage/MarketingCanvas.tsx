import { ArrowClockwise, ArrowCounterClockwise, Trash } from "@phosphor-icons/react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Provider, useDispatch, useSelector, useStore } from "react-redux";
import { useLocalEditorActions } from "../../editor/useLocalEditorActions";
import { createLocalAssets } from "../../editor/localAssets";
import { EDITOR_TOOL_DEFINITIONS } from "../../editor/toolDefinitions";
import { setGrid } from "../../features/actions/actionsSlice";
import { initializeEditor, setClipboard, setViewport, setShowRulers } from "../../features/editor/editorSlice";
import { setSelectedShapes, setSelectedTool } from "../../features/selected/selectedSlice";
import { setWhiteboardData } from "../../features/whiteBoard/whiteBoardSlice";
import { createAppStore, type AppDispatch, type RootState } from "../../store";
import { EditorCanvasView } from "../editor/EditorCanvas";
import KumoLogo from "../brand/KumoLogo";
import type { KumoLogoContext } from "../brand/KumoLogoConfig";
import { layoutMarketingShapes, MARKETING_STATUS_SHAPE_ID } from "./marketingCanvasModel";
import styles from "./MarketingCanvas.module.css";

interface MarketingCanvasProps { logoContext: KumoLogoContext; logoStatus: string }
const tools = EDITOR_TOOL_DEFINITIONS.filter((tool) =>
  ["pointer", "hand", "rectangle", "ellipse", "pen", "text"].includes(tool.id)
);
const noPresence = () => undefined;

const LandingEditor = ({ logoContext, logoStatus }: MarketingCanvasProps) => {
  const localStore = useStore<RootState>();
  const dispatch = useDispatch<AppDispatch>();
  const actions = useLocalEditorActions();
  const selectedTool = useSelector((state: RootState) => state.selected.selectedTool);
  const selectedCount = useSelector((state: RootState) => state.selected.selectedShapes.length);
  const rootRef = useRef<HTMLDivElement>(null);
  const edited = useRef(false);
  const statusRef = useRef(logoStatus);
  const sizeRef = useRef({ width: 1000, height: 1000, mobile: false });
  const [ready, setReady] = useState(false);
  const [media] = useState(createLocalAssets);
  useLayoutEffect(() => { statusRef.current = logoStatus; }, [logoStatus]);

  const reset = useCallback(() => {
    const { width, height, mobile } = sizeRef.current;
    const shapes = layoutMarketingShapes(statusRef.current, width, height, mobile);
    dispatch(setWhiteboardData({
      id: "landing-demo", roomId: null, role: "owner", type: "private", title: "Landing canvas",
      shapes, backGroundColor: "transparent", currentUsers: [],
    }));
    dispatch(initializeEditor({ boardId: "landing-demo", shapes: localStore.getState().whiteBoard.shapes, backgroundColor: "transparent" }));
    dispatch(setSelectedShapes([]));
    dispatch(setClipboard({ shapes: [], boardId: null }));
    dispatch(setSelectedTool("pointer"));
    dispatch(setShowRulers(false));
    dispatch(setGrid(false));
    dispatch(setViewport({ x: 0, y: 0, zoom: 1 }));
    edited.current = false;
    media.dispose();
  }, [dispatch, localStore, media]);

  useLayoutEffect(() => {
    const root = rootRef.current!;
    const resize = () => {
      const rect = root.getBoundingClientRect();
      sizeRef.current = {
        width: rect.width || 1000, height: rect.height || 1000,
        mobile: window.innerWidth <= 820,
      };
      if (!edited.current) reset();
      setReady(true);
    };
    resize();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(resize);
    observer.observe(root);
    return () => observer.disconnect();
  }, [reset]);
  useEffect(() => () => media.dispose(), [media]);
  useEffect(() => {
    // A sign-in status update must not recreate the demo or discard user edits.
    const shapes = localStore.getState().whiteBoard.shapes.map((shape) =>
      shape.id === MARKETING_STATUS_SHAPE_ID ? { ...shape, text: logoStatus } : shape
    );
    dispatch(setWhiteboardData({ shapes }));
  }, [dispatch, localStore, logoStatus]);

  return (
    <div ref={rootRef} className={styles.marketingCanvas} data-context={logoContext}>
      <div className={styles.editorSurface} onPointerDownCapture={() => { edited.current = true; }} onKeyDownCapture={() => { edited.current = true; }}>
        {ready && <EditorCanvasView
          actions={actions} updateMyPresence={noPresence} showCommentPins={false} embedded
          headingShapeId="marketing-headline" mediaRepository={media}
        />}
      </div>
      <div className={styles.heroVisual}>
        <KumoLogo className={styles.brandLogo} context={logoContext} label="Animated Kumo mascot" startupAnimation="startup" animationScope="app-startup" />
      </div>
      <div className={styles.sketchToolbar} role="toolbar" aria-label="Landing canvas tools">
        <span className={styles.toolbarLabel}>Try it</span>
        <div className={styles.toolGroup}>
          {tools.map(({ id, label, shortcut, Icon }) => <button key={id} type="button" aria-label={`${label} (${shortcut})`}
            aria-pressed={selectedTool === id} title={`${label} — ${shortcut}`} onClick={() => dispatch(setSelectedTool(id))}>
            <Icon aria-hidden="true" weight={selectedTool === id ? "fill" : "regular"} />
          </button>)}
        </div>
        <span className={styles.toolbarDivider} aria-hidden="true" />
        <button type="button" aria-label="Undo" disabled={!actions.canUndo} onClick={actions.undo}><ArrowCounterClockwise aria-hidden="true" /></button>
        <button type="button" aria-label="Redo" disabled={!actions.canRedo} onClick={actions.redo}><ArrowClockwise aria-hidden="true" /></button>
        <button type="button" aria-label="Delete selection" disabled={!selectedCount} onClick={actions.removeSelected}><Trash aria-hidden="true" /></button>
        <button type="button" aria-label="Reset canvas" onClick={reset}><ArrowClockwise aria-hidden="true" /></button>
      </div>
    </div>
  );
};

const MarketingCanvas = (props: MarketingCanvasProps) => {
  const [localStore] = useState(createAppStore);
  return <Provider store={localStore}><LandingEditor {...props} /></Provider>;
};
export default MarketingCanvas;
