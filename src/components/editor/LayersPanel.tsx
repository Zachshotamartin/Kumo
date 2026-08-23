import { useDispatch, useSelector } from "react-redux";
import {
  Circle,
  Eye,
  EyeSlash,
  Graph,
  ImageSquare,
  Lock,
  LockOpen,
  Plus,
  Rectangle,
  TextT,
  type Icon,
} from "@phosphor-icons/react";
import { useEditorActions, type EditorActions } from "../../editor/useEditorActions";
import { setSelectedShapes } from "../../features/selected/selectedSlice";
import { AppDispatch, RootState } from "../../store";
import styles from "./EditorWorkspace.module.css";

const layerIcon = (type: string): Icon => {
  if (type === "text") return TextT;
  if (type === "ellipse") return Circle;
  if (type === "image") return ImageSquare;
  if (type === "board") return Graph;
  return Rectangle;
};

export const LayersPanelView = ({ actions }: { actions: EditorActions }) => {
  const dispatch = useDispatch<AppDispatch>();
  const board = useSelector((state: RootState) => state.whiteBoard);
  const selectedIds = useSelector((state: RootState) => state.selected.selectedShapes);

  const toggleShape = (shapeId: string, field: "locked" | "hidden", value: boolean) => {
    const target = board.shapes.find((shape) => shape.id === shapeId);
    const affected = field === "locked" && target?.groupId
      ? new Set(
          board.shapes
            .filter((shape) => shape.groupId === target.groupId)
            .map((shape) => shape.id)
        )
      : new Set([shapeId]);
    actions.commitShapes(
      board.shapes.map((shape) =>
        affected.has(shape.id) ? { ...shape, [field]: value } : shape
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
            <span className={styles.emptyMark}><Plus aria-hidden="true" /></span>
            <p>Draw a shape to start this board.</p>
            <small>R rectangle / O ellipse / T text</small>
          </div>
        ) : (
          board.shapes
            .slice()
            .sort((left, right) => right.zIndex - left.zIndex)
            .map((shape) => {
              const LayerIcon = layerIcon(shape.type);
              return <div
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
                      const groupIds = shape.groupId
                        ? board.shapes.filter((item) => item.groupId === shape.groupId).map((item) => item.id)
                        : [shape.id];
                      const removing = groupIds.every((id) => next.has(id));
                      groupIds.forEach((id) => (removing ? next.delete(id) : next.add(id)));
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
                    <LayerIcon />
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
                  {shape.hidden ? <EyeSlash aria-hidden="true" /> : <Eye aria-hidden="true" />}
                </button>
                <button
                  type="button"
                  className={styles.layerAction}
                  aria-label={`${shape.locked ? "Unlock" : "Lock"} ${shape.name ?? shape.type}`}
                  title={shape.locked ? "Unlock" : "Lock"}
                  onClick={() => toggleShape(shape.id, "locked", !shape.locked)}
                >
                  {shape.locked ? <Lock aria-hidden="true" /> : <LockOpen aria-hidden="true" />}
                </button>
              </div>
            })
        )}
      </div>
    </aside>
  );
};

const LayersPanel = () => <LayersPanelView actions={useEditorActions()} />;

export default LayersPanel;
