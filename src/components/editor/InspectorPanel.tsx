import React, { useEffect, useState } from "react";
import {
  AlignBottomSimple,
  AlignCenterHorizontal,
  AlignCenterVerticalSimple,
  AlignLeft,
  AlignRight,
  AlignTopSimple,
  TextStrikethrough,
  TextT,
  TextUnderline,
} from "@phosphor-icons/react";
import { useDispatch, useSelector } from "react-redux";
import { Shape } from "../../classes/shape";
import { shapeBounds } from "../../editor/geometry";
import { useEditorActions, type EditorActions } from "../../editor/useEditorActions";
import { setGrid } from "../../features/actions/actionsSlice";
import { setGridSize, setSnapToGrid } from "../../features/editor/editorSlice";
import { AppDispatch, RootState } from "../../store";
import styles from "./EditorWorkspace.module.css";
import { BoardSummary, listBoards } from "../../services/boardRepository";

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
  const pickerValue = /^#[0-9a-f]{6}$/i.test(draft) ? draft : "#000000";
  const isValid = (candidate: string) =>
    /^#[0-9a-f]{6}$/i.test(candidate) || candidate.toLowerCase() === "transparent";
  return (
    <label className={styles.colorField}>
      <span>{label}</span>
      <span className={styles.colorControl}>
        <input type="color" value={pickerValue} onChange={(event) => setDraft(event.target.value)} onBlur={() => onCommit(draft)} />
        <input
          type="text"
          value={draft}
          maxLength={11}
          aria-label={`${label} hex value`}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={() => isValid(draft) && onCommit(draft.toLowerCase())}
          onKeyDown={(event) => event.key === "Enter" && event.currentTarget.blur()}
        />
      </span>
    </label>
  );
};

const ShapeInspector = ({ shape, actions }: { shape: Shape; actions: EditorActions }) => {
  const bounds = shapeBounds(shape);
  const currentBoardId = useSelector((state: RootState) => state.whiteBoard.id);
  const [boardChoices, setBoardChoices] = useState<BoardSummary[]>([]);
  const [boardLoadError, setBoardLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (shape.type !== "board") return;
    let active = true;
    void listBoards()
      .then((boards) => {
        if (active) setBoardChoices(boards.filter((board) => board.id !== currentBoardId));
      })
      .catch(() => active && setBoardLoadError("Board destinations could not be loaded."));
    return () => { active = false; };
  }, [currentBoardId, shape.type]);
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
        {shape.type === "text" && (
          <ColorField key={`text-${shape.color}`} label="Text" value={shape.color ?? "#f7f7f5"} onCommit={(color) => actions.patchSelected({ color })} />
        )}
        <ColorField key={`fill-${shape.backgroundColor}`} label={shape.type === "text" ? "Back" : "Fill"} value={shape.backgroundColor ?? "#f4f2ed"} onCommit={(backgroundColor) => actions.patchSelected({ backgroundColor })} />
        <ColorField key={`stroke-${shape.borderColor}`} label="Stroke" value={shape.borderColor ?? "#17181a"} onCommit={(borderColor) => actions.patchSelected({ borderColor })} />
        <div className={styles.fieldGrid}>
          <NumberField label="Stroke" min={0} value={shape.borderWidth ?? 0} onCommit={(borderWidth) => actions.patchSelected({ borderWidth })} />
          <NumberField label="Radius" min={0} value={shape.borderRadius ?? 0} onCommit={(borderRadius) => actions.patchSelected({ borderRadius })} />
        </div>
        <label className={styles.fullField}>
          <span>Stroke style</span>
          <select value={shape.borderStyle ?? "solid"} onChange={(event) => actions.patchSelected({ borderStyle: event.target.value })}>
            <option value="solid">Solid</option>
            <option value="dashed">Dashed</option>
            <option value="dotted">Dotted</option>
            <option value="double">Double</option>
          </select>
        </label>
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
              <option value="Helvetica Neue">Helvetica Neue</option>
              <option value="Inter">Inter</option>
              <option value="Georgia">Georgia</option>
              <option value="Times New Roman">Times New Roman</option>
              <option value="Courier New">Courier New</option>
            </select>
          </label>
          <label className={styles.fullField}>
            <span>Font weight</span>
            <select value={shape.fontWeight ?? "normal"} onChange={(event) => actions.patchSelected({ fontWeight: event.target.value })}>
              <option value="lighter">Light</option>
              <option value="normal">Regular</option>
              <option value="500">Medium</option>
              <option value="600">Semibold</option>
              <option value="bold">Bold</option>
            </select>
          </label>
          <span className={styles.controlLabel}>Horizontal alignment</span>
          <div className={styles.segmented} role="group" aria-label="Text alignment">
            {["left", "center", "right"].map((textAlign) => (
              <button key={textAlign} type="button" aria-pressed={shape.textAlign === textAlign} onClick={() => actions.patchSelected({ textAlign })}>
                {textAlign === "left"
                  ? <AlignLeft aria-hidden="true" />
                  : textAlign === "center"
                    ? <AlignCenterHorizontal aria-hidden="true" />
                    : <AlignRight aria-hidden="true" />}
              </button>
            ))}
          </div>
          <span className={styles.controlLabel}>Vertical alignment</span>
          <div className={styles.segmented} role="group" aria-label="Vertical text alignment">
            {[
              { value: "flex-start", label: "Align text to top", Icon: AlignTopSimple },
              { value: "center", label: "Align text to middle", Icon: AlignCenterVerticalSimple },
              { value: "flex-end", label: "Align text to bottom", Icon: AlignBottomSimple },
            ].map(({ value, label, Icon }) => (
              <button key={value} type="button" aria-label={label} aria-pressed={(shape.alignItems ?? "flex-start") === value} onClick={() => actions.patchSelected({ alignItems: value })}>
                <Icon aria-hidden="true" />
              </button>
            ))}
          </div>
          <span className={styles.controlLabel}>Decoration</span>
          <div className={`${styles.segmented} ${styles.segmentedFour}`} role="group" aria-label="Text decoration">
            {[
              { value: "none", label: "No text decoration", Icon: TextT },
              { value: "underline", label: "Underline text", Icon: TextUnderline },
              { value: "overline", label: "Overline text", Icon: TextT },
              { value: "line-through", label: "Strike through text", Icon: TextStrikethrough },
            ].map(({ value, label, Icon }) => (
              <button key={value} type="button" aria-label={label} aria-pressed={(shape.textDecoration ?? "none") === value} onClick={() => actions.patchSelected({ textDecoration: value })}>
                <Icon aria-hidden="true" className={value === "overline" ? styles.overlineIcon : undefined} />
              </button>
            ))}
          </div>
        </section>
      )}
      {shape.type === "board" && (
        <section className={styles.inspectorSection}>
          <h2>Board link</h2>
          <label className={styles.fullField}>
            <span>Destination</span>
            <select
              value={shape.boardId ?? ""}
              onChange={(event) => {
                const target = boardChoices.find((board) => board.id === event.target.value);
                actions.patchSelected(target
                  ? { boardId: target.id, title: target.title, uid: target.ownerId }
                  : { boardId: null, title: "Choose a destination", uid: null });
              }}
            >
              <option value="">No destination</option>
              {shape.boardId && !boardChoices.some((board) => board.id === shape.boardId) && (
                <option value={shape.boardId}>{shape.title ?? "Current destination"}</option>
              )}
              {boardChoices.map((board) => (
                <option key={board.id} value={board.id}>
                  {board.title} - {board.role === "owner" ? "yours" : "shared"}
                </option>
              ))}
            </select>
          </label>
          <p className={styles.fieldHint}>Double-click this shape to enter the linked board.</p>
          {boardLoadError && <p className={styles.fieldError} role="alert">{boardLoadError}</p>}
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

export const InspectorPanelView = ({ actions }: { actions: EditorActions }) => {
  const dispatch = useDispatch<AppDispatch>();
  const board = useSelector((state: RootState) => state.whiteBoard);
  const selectedIds = useSelector((state: RootState) => state.selected.selectedShapes);
  const editor = useSelector((state: RootState) => state.editor);
  const showGrid = useSelector((state: RootState) => state.actions.grid);
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
        {selected.length === 1 && selected[0] && <ShapeInspector key={selected[0].id} shape={selected[0]} actions={actions} />}
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

const InspectorPanel = () => <InspectorPanelView actions={useEditorActions()} />;

export default InspectorPanel;
