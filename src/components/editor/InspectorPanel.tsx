import React, { useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { Shape } from "../../classes/shape";
import { shapeBounds } from "../../editor/geometry";
import { useEditorActions } from "../../editor/useEditorActions";
import { setGrid } from "../../features/actions/actionsSlice";
import { setGridSize, setSnapToGrid } from "../../features/editor/editorSlice";
import { AppDispatch, RootState } from "../../store";
import styles from "./EditorWorkspace.module.css";

interface NumberFieldProps {
  label: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onCommit: (value: number) => void;
}

const NumberField = ({ label, value, min, max, step = 1, onCommit }: NumberFieldProps) => {
  const commit = (draft: string, input: HTMLInputElement) => {
    const number = Number(draft);
    if (!Number.isFinite(number)) {
      input.value = String(value);
      return;
    }
    onCommit(Math.min(max ?? Infinity, Math.max(min ?? -Infinity, number)));
  };
  return (
    <label className={styles.field}>
      <span>{label}</span>
      <input
        key={value}
        type="number"
        defaultValue={Math.round(value * 100) / 100}
        min={min}
        max={max}
        step={step}
        onBlur={(event) => commit(event.currentTarget.value, event.currentTarget)}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
        }}
      />
    </label>
  );
};

const ColorField = ({ label, value, onCommit }: { label: string; value: string; onCommit: (value: string) => void }) => {
  const [draft, setDraft] = useState(value);
  return (
    <label className={styles.colorField}>
      <span>{label}</span>
      <span className={styles.colorControl}>
        <input type="color" value={draft} onChange={(event) => setDraft(event.target.value)} onBlur={() => onCommit(draft)} />
        <input
          type="text"
          value={draft}
          maxLength={7}
          aria-label={`${label} hex value`}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={() => /^#[0-9a-f]{6}$/i.test(draft) && onCommit(draft)}
          onKeyDown={(event) => event.key === "Enter" && event.currentTarget.blur()}
        />
      </span>
    </label>
  );
};

const ShapeInspector = ({ shape }: { shape: Shape }) => {
  const actions = useEditorActions();
  const bounds = shapeBounds(shape);
  return (
    <>
      <section className={styles.inspectorSection}>
        <h2>Position</h2>
        <div className={styles.fieldGrid}>
          <NumberField label="X" value={bounds.x} onCommit={(x) => actions.setShapeGeometry(shape, { x })} />
          <NumberField label="Y" value={bounds.y} onCommit={(y) => actions.setShapeGeometry(shape, { y })} />
          <NumberField label="W" min={1} value={bounds.width} onCommit={(width) => actions.setShapeGeometry(shape, { width })} />
          <NumberField label="H" min={1} value={bounds.height} onCommit={(height) => actions.setShapeGeometry(shape, { height })} />
          <NumberField label="°" value={shape.rotation ?? 0} onCommit={(rotation) => actions.patchSelected({ rotation })} />
          <NumberField label="α" min={0} max={100} value={(shape.opacity ?? 1) * 100} onCommit={(opacity) => actions.patchSelected({ opacity: opacity / 100 })} />
        </div>
      </section>
      <section className={styles.inspectorSection}>
        <h2>Appearance</h2>
        <ColorField key={`fill-${shape.backgroundColor}`} label="Fill" value={shape.backgroundColor ?? "#f4f2ed"} onCommit={(backgroundColor) => actions.patchSelected({ backgroundColor })} />
        <ColorField key={`stroke-${shape.borderColor}`} label="Stroke" value={shape.borderColor ?? "#17181a"} onCommit={(borderColor) => actions.patchSelected({ borderColor })} />
        <div className={styles.fieldGrid}>
          <NumberField label="Stroke" min={0} value={shape.borderWidth ?? 0} onCommit={(borderWidth) => actions.patchSelected({ borderWidth })} />
          <NumberField label="Radius" min={0} value={shape.borderRadius ?? 0} onCommit={(borderRadius) => actions.patchSelected({ borderRadius })} />
        </div>
      </section>
      {shape.type === "text" && (
        <section className={styles.inspectorSection}>
          <h2>Typography</h2>
          <div className={styles.fieldGrid}>
            <NumberField label="Size" min={6} value={shape.fontSize ?? 18} onCommit={(fontSize) => actions.patchSelected({ fontSize })} />
            <NumberField label="Line" min={0.5} step={0.1} value={shape.lineHeight ?? 1.2} onCommit={(lineHeight) => actions.patchSelected({ lineHeight })} />
            <NumberField label="Track" value={shape.letterSpacing ?? 0} onCommit={(letterSpacing) => actions.patchSelected({ letterSpacing })} />
          </div>
          <label className={styles.fullField}>
            <span>Font family</span>
            <select value={shape.fontFamily ?? "Arial"} onChange={(event) => actions.patchSelected({ fontFamily: event.target.value })}>
              <option value="Arial">Arial</option>
              <option value="Georgia">Georgia</option>
              <option value="Courier New">Courier New</option>
            </select>
          </label>
          <div className={styles.segmented} role="group" aria-label="Text alignment">
            {["left", "center", "right"].map((textAlign) => (
              <button key={textAlign} type="button" aria-pressed={shape.textAlign === textAlign} onClick={() => actions.patchSelected({ textAlign })}>
                {textAlign === "left" ? "⇤" : textAlign === "center" ? "↔" : "⇥"}
              </button>
            ))}
          </div>
        </section>
      )}
      <section className={styles.inspectorSection}>
        <h2>Layer</h2>
        <div className={styles.buttonGrid}>
          <button type="button" onClick={() => actions.orderSelected("front")}>Front</button>
          <button type="button" onClick={() => actions.orderSelected("back")}>Back</button>
          <button type="button" onClick={() => actions.patchSelected({ locked: !shape.locked })}>{shape.locked ? "Unlock" : "Lock"}</button>
          <button type="button" onClick={actions.removeSelected} className={styles.dangerButton}>Delete</button>
        </div>
      </section>
    </>
  );
};

const InspectorPanel = () => {
  const dispatch = useDispatch<AppDispatch>();
  const board = useSelector((state: RootState) => state.whiteBoard);
  const selectedIds = useSelector((state: RootState) => state.selected.selectedShapes);
  const editor = useSelector((state: RootState) => state.editor);
  const showGrid = useSelector((state: RootState) => state.actions.grid);
  const actions = useEditorActions();
  const selected = board.shapes.filter((shape) => selectedIds.includes(shape.id));

  return (
    <aside className={styles.inspectorPanel} aria-label="Properties">
      <div className={styles.panelHeading}>
        <span>{selected.length === 0 ? "Board" : selected.length === 1 ? selected[0]?.type : `${selected.length} layers`}</span>
      </div>
      <div className={styles.inspectorBody}>
        {selected.length === 0 && (
          <>
            <section className={styles.inspectorSection}>
              <h2>Canvas</h2>
              <ColorField key={`board-${board.backGroundColor}`} label="Background" value={board.backGroundColor} onCommit={(backGroundColor) => actions.commitBoardPatch({ backGroundColor })} />
              <label className={styles.toggleRow}>
                <span>Show grid</span>
                <input type="checkbox" checked={showGrid} onChange={(event) => dispatch(setGrid(event.target.checked))} />
              </label>
              <label className={styles.toggleRow}>
                <span>Snap to grid</span>
                <input type="checkbox" checked={editor.snapToGrid} onChange={(event) => dispatch(setSnapToGrid(event.target.checked))} />
              </label>
              <NumberField label="Grid" min={2} max={128} value={editor.gridSize} onCommit={(gridSize) => dispatch(setGridSize(gridSize))} />
            </section>
            <div className={styles.tip}>
              <strong>Quick start</strong>
              <span>Drag to draw. Shift constrains proportions. Alt resizes from center. Space pans.</span>
            </div>
          </>
        )}
        {selected.length === 1 && selected[0] && <ShapeInspector key={selected[0].id} shape={selected[0]} />}
        {selected.length > 1 && (
          <>
            <section className={styles.inspectorSection}>
              <h2>Align</h2>
              <div className={styles.buttonGrid}>
                <button type="button" onClick={() => actions.alignSelected("left")}>Left</button>
                <button type="button" onClick={() => actions.alignSelected("horizontal-center")}>Center X</button>
                <button type="button" onClick={() => actions.alignSelected("right")}>Right</button>
                <button type="button" onClick={() => actions.alignSelected("top")}>Top</button>
                <button type="button" onClick={() => actions.alignSelected("vertical-center")}>Center Y</button>
                <button type="button" onClick={() => actions.alignSelected("bottom")}>Bottom</button>
              </div>
            </section>
            <section className={styles.inspectorSection}>
              <h2>Arrange</h2>
              <div className={styles.buttonGrid}>
                <button type="button" onClick={() => actions.distributeSelected("horizontal")}>Distribute X</button>
                <button type="button" onClick={() => actions.distributeSelected("vertical")}>Distribute Y</button>
                <button type="button" onClick={actions.groupSelected}>Group</button>
                <button type="button" onClick={actions.ungroupSelected}>Ungroup</button>
              </div>
            </section>
          </>
        )}
      </div>
    </aside>
  );
};

export default InspectorPanel;
