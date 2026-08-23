import { useEffect, type CSSProperties } from "react";
import { useDispatch, useSelector } from "react-redux";
import { normalizeShape } from "../editor/geometry";
import { setSelectedShapes } from "../features/selected/selectedSlice";
import { setWhiteboardData } from "../features/whiteBoard/whiteBoardSlice";
import type { AppDispatch, RootState } from "../store";
import { EditorCanvasView } from "../components/editor/EditorCanvas";
import { EditorToolbarView } from "../components/editor/EditorToolbar";
import { InspectorPanelView } from "../components/editor/InspectorPanel";
import { LayersPanelView } from "../components/editor/LayersPanel";
import styles from "../components/editor/EditorWorkspace.module.css";
import { useLocalEditorActions } from "./useLocalEditorActions";

const seedShapes = [
  normalizeShape({
    id: "e2e-text",
    type: "text",
    name: "Product note",
    x1: 100,
    y1: 100,
    x2: 380,
    y2: 220,
    width: 280,
    height: 120,
    level: 0,
    zIndex: 1,
    color: "#f7f7f5",
    backgroundColor: "transparent",
    borderColor: "transparent",
    borderWidth: 0,
    text: "Select part of this text",
    fontSize: 24,
    fontFamily: "Arial",
    fontWeight: "normal",
    textAlign: "left",
    alignItems: "center",
    textDecoration: "none",
    lineHeight: 1.25,
    letterSpacing: 0,
  }),
  normalizeShape({
    id: "e2e-rectangle",
    type: "rectangle",
    name: "Ochre card",
    x1: 470,
    y1: 110,
    x2: 630,
    y2: 220,
    width: 160,
    height: 110,
    level: 0,
    zIndex: 2,
    backgroundColor: "#b87a2e",
    borderColor: "#17181a",
    borderWidth: 1,
  }),
];

const EditorHarness = () => {
  const dispatch = useDispatch<AppDispatch>();
  const actions = useLocalEditorActions();
  const boardId = useSelector((state: RootState) => state.whiteBoard.id);

  useEffect(() => {
    dispatch(setWhiteboardData({
      id: "e2e-board",
      roomId: "board:e2e-board",
      role: "owner",
      type: "private",
      title: "Editor regression lab",
      uid: "e2e-user",
      shapes: seedShapes,
      backGroundColor: "#252629",
      currentUsers: [],
    }));
    dispatch(setSelectedShapes([]));
  }, [dispatch]);

  if (boardId !== "e2e-board") return <div role="status">Preparing editor regression lab</div>;

  return (
    <main className={styles.workspace} data-testid="editor-regression-lab">
      <header className={styles.topbar}>
        <div className={styles.topbarStart}>
          <strong>Kumo</strong>
          <span className={styles.breadcrumb}>/</span>
          <span>Editor regression lab</span>
        </div>
        <span className={styles.saveStatus}>Local test document</span>
      </header>
      <div
        className={styles.editorGrid}
        style={{
          "--layers-panel-width": "220px",
          "--layers-resizer-width": "0px",
          "--properties-panel-width": "280px",
          "--properties-resizer-width": "0px",
        } as CSSProperties}
      >
        <div className={styles.panelSlot}><LayersPanelView actions={actions} /></div>
        <span />
        <section className={styles.canvasRegion} aria-label="Design editor">
          <EditorCanvasView actions={actions} updateMyPresence={() => undefined} />
          <EditorToolbarView actions={actions} />
        </section>
        <span />
        <div className={styles.panelSlot}><InspectorPanelView actions={actions} /></div>
      </div>
    </main>
  );
};

export default EditorHarness;
