import { useDispatch, useSelector } from "react-redux";
import { useEditorActions } from "../../editor/useEditorActions";
import { setSelectedShapes } from "../../features/selected/selectedSlice";
import { AppDispatch, RootState } from "../../store";
import styles from "./EditorWorkspace.module.css";

const LayersPanel = () => {
  const dispatch = useDispatch<AppDispatch>();
  const board = useSelector((state: RootState) => state.whiteBoard);
  const selectedIds = useSelector((state: RootState) => state.selected.selectedShapes);
  const actions = useEditorActions();

  const toggleShape = (shapeId: string, field: "locked" | "hidden", value: boolean) => {
    actions.commitShapes(
      board.shapes.map((shape) =>
        shape.id === shapeId ? { ...shape, [field]: value } : shape
      )
    );
  };

  return (
    <aside className={styles.layersPanel} aria-label="Layers">
      <div className={styles.panelHeading}>
        <span>Layers</span>
        <span className={styles.count}>{board.shapes.length}</span>
      </div>
      <div className={styles.layerList}>
        {board.shapes.length === 0 ? (
          <div className={styles.emptyPanel}>
            <span className={styles.emptyMark}>＋</span>
            <p>Draw a shape to start this board.</p>
            <small>R rectangle · O ellipse · T text</small>
          </div>
        ) : (
          board.shapes
            .slice()
            .sort((left, right) => right.zIndex - left.zIndex)
            .map((shape) => (
              <div
                className={`${styles.layerRow} ${selectedIds.includes(shape.id) ? styles.selectedLayer : ""}`}
                key={shape.id}
              >
                <button
                  className={styles.layerMain}
                  type="button"
                  aria-pressed={selectedIds.includes(shape.id)}
                  onClick={(event) => {
                    if (event.shiftKey) {
                      const next = new Set(selectedIds);
                      if (next.has(shape.id)) next.delete(shape.id);
                      else next.add(shape.id);
                      dispatch(setSelectedShapes([...next]));
                    } else {
                      const groupIds = shape.groupId
                        ? board.shapes.filter((item) => item.groupId === shape.groupId).map((item) => item.id)
                        : [shape.id];
                      dispatch(setSelectedShapes(groupIds));
                    }
                  }}
                >
                  <span className={styles.layerType} aria-hidden="true">
                    {shape.type === "text" ? "T" : shape.type === "ellipse" ? "○" : shape.type === "image" ? "▧" : "□"}
                  </span>
                  <span className={styles.layerName}>{shape.name ?? shape.type}</span>
                </button>
                <button
                  type="button"
                  className={styles.layerAction}
                  aria-label={`${shape.hidden ? "Show" : "Hide"} ${shape.name ?? shape.type}`}
                  title={shape.hidden ? "Show" : "Hide"}
                  onClick={() => toggleShape(shape.id, "hidden", !shape.hidden)}
                >
                  {shape.hidden ? "—" : "◉"}
                </button>
                <button
                  type="button"
                  className={styles.layerAction}
                  aria-label={`${shape.locked ? "Unlock" : "Lock"} ${shape.name ?? shape.type}`}
                  title={shape.locked ? "Unlock" : "Lock"}
                  onClick={() => toggleShape(shape.id, "locked", !shape.locked)}
                >
                  {shape.locked ? "◆" : "◇"}
                </button>
              </div>
            ))
        )}
      </div>
    </aside>
  );
};

export default LayersPanel;
