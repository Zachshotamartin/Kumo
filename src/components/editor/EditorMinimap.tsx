import { useMemo } from "react";
import { useDispatch, useSelector } from "react-redux";
import { selectionBounds, shapeBounds } from "../../editor/geometry";
import { setSelectedShapes } from "../../features/selected/selectedSlice";
import { setViewport } from "../../features/editor/editorSlice";
import type { AppDispatch, RootState } from "../../store";
import styles from "./EditorWorkspace.module.css";

const WIDTH = 176;
const HEIGHT = 116;
const PADDING = 8;

const EditorMinimap = () => {
  const dispatch = useDispatch<AppDispatch>();
  const shapes = useSelector((state: RootState) => state.whiteBoard.shapes);
  const viewport = useSelector((state: RootState) => state.editor.viewport);
  const documentBounds = useMemo(() => selectionBounds(shapes, shapes.map((shape) => shape.id)), [shapes]);
  if (!documentBounds || !shapes.length) return null;
  const scale = Math.min((WIDTH - PADDING * 2) / Math.max(1, documentBounds.width), (HEIGHT - PADDING * 2) / Math.max(1, documentBounds.height));
  const offsetX = (WIDTH - documentBounds.width * scale) / 2 - documentBounds.x * scale;
  const offsetY = (HEIGHT - documentBounds.height * scale) / 2 - documentBounds.y * scale;
  const focus = (x: number, y: number) => dispatch(setViewport({ ...viewport, x: x - 500 / viewport.zoom, y: y - 350 / viewport.zoom }));

  return <svg
    className={styles.minimap}
    viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
    role="img"
    aria-label="Board minimap"
    onPointerDown={(event) => {
      const rect = event.currentTarget.getBoundingClientRect();
      focus(((event.clientX - rect.left) / rect.width * WIDTH - offsetX) / scale, ((event.clientY - rect.top) / rect.height * HEIGHT - offsetY) / scale);
    }}
  >
    <rect className={styles.minimapBackground} x="0" y="0" width={WIDTH} height={HEIGHT} rx="7" />
    {shapes.filter((shape) => !shape.hidden).map((shape) => {
      const bounds = shapeBounds(shape);
      return <rect key={shape.id} className={styles.minimapShape} x={bounds.x * scale + offsetX} y={bounds.y * scale + offsetY} width={Math.max(1, bounds.width * scale)} height={Math.max(1, bounds.height * scale)} rx="1" onPointerDown={(event) => { event.stopPropagation(); dispatch(setSelectedShapes([shape.id])); focus(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2); }} />;
    })}
    <rect className={styles.minimapViewport} x={viewport.x * scale + offsetX} y={viewport.y * scale + offsetY} width={1000 / viewport.zoom * scale} height={700 / viewport.zoom * scale} />
  </svg>;
};

export default EditorMinimap;
