import React, { useEffect, useRef, useState } from "react";
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
import { createShapeId, Shape } from "../../classes/shape";
import { shapeBounds } from "../../editor/geometry";
import { useEditorActions, type EditorActions } from "../../editor/useEditorActions";
import { setGrid } from "../../features/actions/actionsSlice";
import { setGridSize, setShowRulers, setSnapToGrid } from "../../features/editor/editorSlice";
import { AppDispatch, RootState } from "../../store";
import styles from "./EditorWorkspace.module.css";
import { BoardSummary, listBoards } from "../../services/boardRepository";
import { applyTextRun, branchVectorPath, splitVectorPath, validateVectorNetwork } from "../../platform/productCapabilities";

interface NumberFieldProps {
  label: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onCommit: (value: number) => void;
}

const formatNumber = (number: number) => String(Math.round(number * 100) / 100);
const OPEN_TYPE_FEATURES = [["liga", "Ligatures"], ["kern", "Kerning"], ["calt", "Contextual alternates"]] as const;

const NumberField = ({ label, value, min, max, step = 1, onCommit }: NumberFieldProps) => {
  const clamp = (number: number) => Math.min(max ?? Infinity, Math.max(min ?? -Infinity, number));
  const [draft, setDraft] = useState(() => formatNumber(value));
  const focused = useRef(false);

  useEffect(() => {
    if (!focused.current) setDraft(formatNumber(value));
  }, [value]);

  const update = (nextDraft: string) => {
    setDraft(nextDraft);
    const number = Number(nextDraft);
    if (nextDraft.trim() && Number.isFinite(number)) onCommit(clamp(number));
  };

  const finishEditing = () => {
    focused.current = false;
    const number = Number(draft);
    setDraft(draft.trim() && Number.isFinite(number) ? formatNumber(clamp(number)) : formatNumber(value));
  };

  return (
    <label className={styles.field}>
      <span>{label}</span>
      <input
        type="number"
        value={draft}
        min={min}
        max={max}
        step={step}
        onFocus={() => { focused.current = true; }}
        onChange={(event) => update(event.currentTarget.value)}
        onBlur={finishEditing}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
        }}
      />
    </label>
  );
};

const ColorField = ({ label, value, onCommit }: { label: string; value: string; onCommit: (value: string) => void }) => {
  const [draft, setDraft] = useState(value);
  const focused = useRef(false);
  const pickerValue = /^#[0-9a-f]{6}$/i.test(draft) ? draft : "#000000";
  const isValid = (candidate: string) =>
    /^#[0-9a-f]{6}$/i.test(candidate) || candidate.toLowerCase() === "transparent";

  useEffect(() => {
    if (!focused.current) setDraft(value);
  }, [value]);

  const update = (nextDraft: string) => {
    setDraft(nextDraft);
    if (isValid(nextDraft)) onCommit(nextDraft.toLowerCase());
  };

  const finishEditing = () => {
    focused.current = false;
    setDraft(isValid(draft) ? draft.toLowerCase() : value);
  };

  return (
    <label className={styles.colorField}>
      <span>{label}</span>
      <span className={styles.colorControl}>
        <input
          type="color"
          value={pickerValue}
          onFocus={() => { focused.current = true; }}
          onChange={(event) => update(event.currentTarget.value)}
          onBlur={() => { focused.current = false; }}
        />
        <input
          type="text"
          value={draft}
          maxLength={11}
          aria-label={`${label} hex value`}
          onFocus={() => { focused.current = true; }}
          onChange={(event) => update(event.currentTarget.value)}
          onBlur={finishEditing}
          onKeyDown={(event) => event.key === "Enter" && event.currentTarget.blur()}
        />
      </span>
    </label>
  );
};

const ShapeInspector = ({ shape, actions }: { shape: Shape; actions: EditorActions }) => {
  const bounds = shapeBounds(shape);
  const currentBoardId = useSelector((state: RootState) => state.whiteBoard.id);
  const boardShapes = useSelector((state: RootState) => state.whiteBoard.shapes);
  const textSelection = useSelector((state: RootState) => state.editor.textSelection);
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
  const patchTextSelection = (style: Parameters<typeof applyTextRun>[3]) => {
    if (!textSelection || textSelection.shapeId !== shape.id || textSelection.start === textSelection.end) return;
    actions.commitShapes(boardShapes.map((candidate) => candidate.id === shape.id
      ? applyTextRun(candidate, textSelection.start, textSelection.end, style)
      : candidate));
  };
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
        <div className={styles.inspectorStack}>
          {shape.type === "text" && (
            <ColorField label="Text" value={shape.color ?? "#f7f7f5"} onCommit={(color) => actions.patchSelected({ color })} />
          )}
          <ColorField label={shape.type === "text" ? "Back" : "Fill"} value={shape.backgroundColor ?? "#f4f2ed"} onCommit={(backgroundColor) => actions.patchSelected({ backgroundColor })} />
          <label className={styles.fullField}>
            <span>Fill type</span>
            <select
              value={shape.fillType ?? "solid"}
              onChange={(event) => {
                const fillType = event.target.value as Shape["fillType"];
                actions.patchSelected({
                  fillType,
                  ...((fillType !== "solid" && !shape.gradientStops?.length) ? {
                    gradientStops: [
                      { id: createShapeId(), position: 0, color: shape.backgroundColor ?? "#f4f2ed", opacity: 1 },
                      { id: createShapeId(), position: 1, color: "#ffffff", opacity: 1 },
                    ],
                  } : {}),
                });
              }}
            >
              <option value="solid">Solid</option>
              <option value="linear-gradient">Linear gradient</option>
              <option value="radial-gradient">Radial gradient</option>
            </select>
          </label>
          {shape.fillType && shape.fillType !== "solid" && (
            <>
              {shape.fillType === "linear-gradient" && <NumberField label="Gradient angle" value={shape.gradientAngle ?? 90} onCommit={(gradientAngle) => actions.patchSelected({ gradientAngle })} />}
              {(shape.gradientStops ?? []).map((stop, index) => (
                <div className={styles.gradientStop} key={stop.id}>
                  <ColorField label={`Stop ${index + 1}`} value={stop.color} onCommit={(color) => actions.patchSelected({ gradientStops: shape.gradientStops?.map((candidate) => candidate.id === stop.id ? { ...candidate, color } : candidate) })} />
                  <NumberField label="At %" min={0} max={100} value={stop.position * 100} onCommit={(position) => actions.patchSelected({ gradientStops: shape.gradientStops?.map((candidate) => candidate.id === stop.id ? { ...candidate, position: position / 100 } : candidate) })} />
                </div>
              ))}
            </>
          )}
          <ColorField label="Stroke" value={shape.borderColor ?? "#17181a"} onCommit={(borderColor) => actions.patchSelected({ borderColor })} />
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
          <label className={styles.fullField}>
            <span>Blend mode</span>
            <select value={shape.blendMode ?? "normal"} onChange={(event) => actions.patchSelected({ blendMode: event.target.value as Shape["blendMode"] })}>
              <option value="normal">Normal</option><option value="multiply">Multiply</option><option value="screen">Screen</option>
              <option value="overlay">Overlay</option><option value="darken">Darken</option><option value="lighten">Lighten</option><option value="difference">Difference</option>
            </select>
          </label>
        </div>
      </section>
      <section className={styles.inspectorSection}>
        <h2>Effects</h2>
        {(shape.effects ?? []).map((effect) => (
          <div className={styles.effectRow} key={effect.id}>
            <label className={styles.toggleRow}>
              <span>{effect.type.replaceAll("-", " ")}</span>
              <input type="checkbox" checked={effect.visible} onChange={(event) => actions.patchSelected({ effects: shape.effects?.map((candidate) => candidate.id === effect.id ? { ...candidate, visible: event.target.checked } : candidate) })} />
            </label>
            <div className={styles.fieldGrid}>
              <NumberField label="X" value={effect.x} onCommit={(x) => actions.patchSelected({ effects: shape.effects?.map((candidate) => candidate.id === effect.id ? { ...candidate, x } : candidate) })} />
              <NumberField label="Y" value={effect.y} onCommit={(y) => actions.patchSelected({ effects: shape.effects?.map((candidate) => candidate.id === effect.id ? { ...candidate, y } : candidate) })} />
              <NumberField label="Blur" min={0} value={effect.blur} onCommit={(blur) => actions.patchSelected({ effects: shape.effects?.map((candidate) => candidate.id === effect.id ? { ...candidate, blur } : candidate) })} />
              <NumberField label="Spread" value={effect.spread} onCommit={(spread) => actions.patchSelected({ effects: shape.effects?.map((candidate) => candidate.id === effect.id ? { ...candidate, spread } : candidate) })} />
            </div>
          </div>
        ))}
        <label className={styles.fullField}>
          <span>Add effect</span>
          <select
            value=""
            onChange={(event) => {
              if (!event.target.value) return;
              actions.patchSelected({ effects: [...(shape.effects ?? []), {
                id: createShapeId(), type: event.target.value as NonNullable<Shape["effects"]>[number]["type"], color: "#00000066", x: 0, y: 4, blur: 12, spread: 0, visible: true,
              }] });
            }}
          >
            <option value="">Choose…</option><option value="drop-shadow">Drop shadow</option><option value="inner-shadow">Inner shadow</option>
            <option value="layer-blur">Layer blur</option><option value="background-blur">Background blur</option>
          </select>
        </label>
      </section>
      {shape.type === "vector" && (
        <section className={styles.inspectorSection}>
          <h2>Vector path</h2>
          <label className={styles.toggleRow}><span>Closed path</span><input type="checkbox" checked={shape.vectorClosed ?? false} onChange={(event) => actions.patchSelected({ vectorClosed: event.target.checked })} /></label>
          <div className={styles.fieldGrid}>
            <label className={styles.field}><span>Cap</span><select value={shape.strokeCap ?? "none"} onChange={(event) => actions.patchSelected({ strokeCap: event.target.value as Shape["strokeCap"] })}><option value="none">Butt</option><option value="round">Round</option><option value="square">Square</option><option value="arrow">Arrow</option></select></label>
            <label className={styles.field}><span>Join</span><select value={shape.strokeJoin ?? "miter"} onChange={(event) => actions.patchSelected({ strokeJoin: event.target.value as Shape["strokeJoin"] })}><option value="miter">Miter</option><option value="round">Round</option><option value="bevel">Bevel</option></select></label>
            <label className={styles.field}><span>Align</span><select value={shape.strokeAlign ?? "center"} onChange={(event) => actions.patchSelected({ strokeAlign: event.target.value as Shape["strokeAlign"] })}><option value="inside">Inside</option><option value="center">Center</option><option value="outside">Outside</option></select></label>
          </div>
          <label className={styles.fullField}><span>Dash pattern</span><input aria-label="Stroke dash pattern" value={(shape.strokeDash ?? []).join(", ")} placeholder="8, 4" onChange={(event) => actions.patchSelected({ strokeDash: event.currentTarget.value.split(/[ ,]+/).map(Number).filter((value) => Number.isFinite(value) && value > 0) })} /></label>
          {!shape.vectorPaths?.length && Boolean(shape.vectorPoints?.length) && <button type="button" onClick={() => actions.patchSelected({ vectorPaths: [{ id: createShapeId(), pointIds: shape.vectorPoints!.map((point) => point.id), closed: Boolean(shape.vectorClosed) }] })}>Convert to vector network</button>}
          {shape.vectorPaths?.length ? <button type="button" disabled={shape.vectorPaths[0]!.pointIds.length < 3} onClick={() => {
            const path = shape.vectorPaths![0]!;
            actions.commitShapes(boardShapes.map((candidate) => candidate.id === shape.id ? splitVectorPath(candidate, path.id, path.pointIds[Math.floor(path.pointIds.length / 2)]!) : candidate));
          }}>Split path at midpoint</button> : null}
          {shape.vectorPaths?.[0]?.pointIds[0] && <button type="button" onClick={() => {
            const origin = shape.vectorPoints?.find((point) => point.id === shape.vectorPaths![0]!.pointIds[0]);
            if (!origin) return;
            actions.commitShapes(boardShapes.map((candidate) => candidate.id === shape.id ? branchVectorPath(candidate, origin.id, { x: origin.x + 60, y: origin.y + 40 }) : candidate));
          }}>Add vector branch</button>}
          {validateVectorNetwork(shape).map((issue) => <p className={styles.fieldError} key={`${issue.pathId}:${issue.type}`}>{issue.detail}</p>)}
          <p className={styles.fieldHint}>{shape.vectorPoints?.length ?? 0} editable nodes. Drag the canvas nodes with the pointer tool.</p>
        </section>
      )}
      {shape.type === "boolean" && (
        <section className={styles.inspectorSection}>
          <h2>Boolean group</h2>
          <label className={styles.fullField}><span>Operation</span><select value={shape.booleanOperation} onChange={(event) => actions.patchSelected({ booleanOperation: event.target.value as Shape["booleanOperation"] })}><option value="union">Union</option><option value="subtract">Subtract</option><option value="intersect">Intersect</option><option value="exclude">Exclude</option></select></label>
          <button type="button" onClick={actions.flattenSelectedBoolean}>Release boolean group</button>
        </section>
      )}
      {(shape.isMask || shape.maskId) && <section className={styles.inspectorSection}><h2>Mask</h2><button type="button" onClick={actions.releaseSelectedMask}>Release mask</button></section>}
      {shape.type === "image" && <section className={styles.inspectorSection}>
        <h2>Image</h2>
        <label className={styles.fullField}><span>Fit</span><select value={shape.imageFit ?? "fill"} onChange={(event) => actions.patchSelected({ imageFit: event.target.value as Shape["imageFit"] })}><option value="fill">Fill</option><option value="fit">Fit</option><option value="crop">Crop</option><option value="tile">Tile</option></select></label>
        <div className={styles.fieldGrid}>
          <NumberField label="Brightness" min={0} max={3} step={0.1} value={shape.imageFilters?.brightness ?? 1} onCommit={(brightness) => actions.patchSelected({ imageFilters: { brightness, contrast: shape.imageFilters?.contrast ?? 1, saturation: shape.imageFilters?.saturation ?? 1, blur: shape.imageFilters?.blur ?? 0 } })} />
          <NumberField label="Contrast" min={0} max={3} step={0.1} value={shape.imageFilters?.contrast ?? 1} onCommit={(contrast) => actions.patchSelected({ imageFilters: { brightness: shape.imageFilters?.brightness ?? 1, contrast, saturation: shape.imageFilters?.saturation ?? 1, blur: shape.imageFilters?.blur ?? 0 } })} />
          <NumberField label="Saturation" min={0} max={3} step={0.1} value={shape.imageFilters?.saturation ?? 1} onCommit={(saturation) => actions.patchSelected({ imageFilters: { brightness: shape.imageFilters?.brightness ?? 1, contrast: shape.imageFilters?.contrast ?? 1, saturation, blur: shape.imageFilters?.blur ?? 0 } })} />
          <NumberField label="Blur" min={0} max={40} value={shape.imageFilters?.blur ?? 0} onCommit={(blur) => actions.patchSelected({ imageFilters: { brightness: shape.imageFilters?.brightness ?? 1, contrast: shape.imageFilters?.contrast ?? 1, saturation: shape.imageFilters?.saturation ?? 1, blur } })} />
        </div>
        {shape.imageFit === "crop" && <div className={styles.fieldGrid}>
          <NumberField label="Crop X %" min={0} max={100} value={(shape.imageCrop?.x ?? 0) * 100} onCommit={(x) => actions.patchSelected({ imageCrop: { x: x / 100, y: shape.imageCrop?.y ?? 0, width: shape.imageCrop?.width ?? 1, height: shape.imageCrop?.height ?? 1 } })} />
          <NumberField label="Crop Y %" min={0} max={100} value={(shape.imageCrop?.y ?? 0) * 100} onCommit={(y) => actions.patchSelected({ imageCrop: { x: shape.imageCrop?.x ?? 0, y: y / 100, width: shape.imageCrop?.width ?? 1, height: shape.imageCrop?.height ?? 1 } })} />
          <NumberField label="Crop width %" min={5} max={100} value={(shape.imageCrop?.width ?? 1) * 100} onCommit={(width) => actions.patchSelected({ imageCrop: { x: shape.imageCrop?.x ?? 0, y: shape.imageCrop?.y ?? 0, width: width / 100, height: shape.imageCrop?.height ?? 1 } })} />
          <NumberField label="Crop height %" min={5} max={100} value={(shape.imageCrop?.height ?? 1) * 100} onCommit={(height) => actions.patchSelected({ imageCrop: { x: shape.imageCrop?.x ?? 0, y: shape.imageCrop?.y ?? 0, width: shape.imageCrop?.width ?? 1, height: height / 100 } })} />
        </div>}
      </section>}
      {shape.type === "text" && (
        <section className={styles.inspectorSection}>
          <h2>Typography</h2>
          {textSelection?.shapeId === shape.id && textSelection.start !== textSelection.end && <div className={styles.selectionTypography}>
            <span className={styles.controlLabel}>Selected characters</span>
            <div className={styles.buttonGrid}>
              <button type="button" onClick={() => patchTextSelection({ fontWeight: "bold" })}>Bold</button>
              <button type="button" onClick={() => patchTextSelection({ textDecoration: "underline" })}>Underline</button>
            </div>
            <ColorField label="Selection color" value={shape.color ?? "#ffffff"} onCommit={(color) => patchTextSelection({ color })} />
          </div>}
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
          <label className={styles.fullField}>
            <span>Text resizing</span>
            <select value={shape.textAutoResize ?? "fixed"} onChange={(event) => actions.patchSelected({ textAutoResize: event.target.value as Shape["textAutoResize"] })}>
              <option value="auto-width">Auto width</option>
              <option value="auto-height">Auto height</option>
              <option value="fixed">Fixed size</option>
            </select>
          </label>
          <div className={styles.fieldGrid}>
            <NumberField label="Variable weight" min={1} max={1000} value={shape.fontAxes?.wght ?? (Number(shape.fontWeight) || 400)} onCommit={(wght) => actions.patchSelected({ fontAxes: { ...(shape.fontAxes ?? {}), wght } })} />
            <NumberField label="Variable width" min={50} max={200} value={shape.fontAxes?.wdth ?? 100} onCommit={(wdth) => actions.patchSelected({ fontAxes: { ...(shape.fontAxes ?? {}), wdth } })} />
            <NumberField label="Optical size" min={6} max={144} value={shape.fontAxes?.opsz ?? shape.fontSize ?? 18} onCommit={(opsz) => actions.patchSelected({ fontAxes: { ...(shape.fontAxes ?? {}), opsz } })} />
            <NumberField label="Slant" min={-15} max={15} value={shape.fontAxes?.slnt ?? 0} onCommit={(slnt) => actions.patchSelected({ fontAxes: { ...(shape.fontAxes ?? {}), slnt } })} />
          </div>
          <div className={styles.buttonGrid} role="group" aria-label="OpenType features">{OPEN_TYPE_FEATURES.map(([tag, label]) => <button type="button" key={tag} aria-pressed={shape.openTypeFeatures?.[tag] !== false} onClick={() => actions.patchSelected({ openTypeFeatures: { ...(shape.openTypeFeatures ?? {}), [tag]: shape.openTypeFeatures?.[tag] === false } })}>{label}</button>)}</div>
          <div className={styles.fieldGrid}>
            <NumberField label="Paragraph" min={0} value={shape.paragraphSpacing ?? 0} onCommit={(paragraphSpacing) => actions.patchSelected({ paragraphSpacing })} />
            <NumberField label="Indent" min={0} value={shape.textIndent ?? 0} onCommit={(textIndent) => actions.patchSelected({ textIndent })} />
          </div>
          <label className={styles.fullField}>
            <span>Case</span>
            <select value={shape.textCase ?? "original"} onChange={(event) => actions.patchSelected({ textCase: event.target.value as Shape["textCase"] })}>
              <option value="original">Original</option>
              <option value="upper">Uppercase</option>
              <option value="lower">Lowercase</option>
              <option value="title">Title case</option>
            </select>
          </label>
          <label className={styles.fullField}>
            <span>List</span>
            <select value={shape.listStyle ?? "none"} onChange={(event) => actions.patchSelected({ listStyle: event.target.value as Shape["listStyle"] })}>
              <option value="none">None</option>
              <option value="bulleted">Bulleted</option>
              <option value="numbered">Numbered</option>
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
      {shape.type === "frame" && (
        <section className={styles.inspectorSection}>
          <h2>Frame</h2>
          <label className={styles.toggleRow}>
            <span>Clip content</span>
            <input
              type="checkbox"
              checked={shape.clipContent !== false}
              onChange={(event) => actions.patchSelected({ clipContent: event.target.checked })}
            />
          </label>
          <label className={styles.fullField}>
            <span>Auto layout</span>
            <select value={shape.layoutMode ?? "none"} onChange={(event) => actions.patchSelected({ layoutMode: event.target.value as Shape["layoutMode"] })}>
              <option value="none">None</option>
              <option value="horizontal">Horizontal</option>
              <option value="vertical">Vertical</option>
              <option value="grid">Grid</option>
            </select>
          </label>
          {shape.layoutMode && shape.layoutMode !== "none" && (
            <>
              <div className={styles.fieldGrid}>
                <NumberField label="Gap" min={0} value={shape.layoutGap ?? 12} onCommit={(layoutGap) => actions.patchSelected({ layoutGap })} />
                <NumberField label="Row gap" min={0} value={shape.layoutCounterGap ?? 12} onCommit={(layoutCounterGap) => actions.patchSelected({ layoutCounterGap })} />
                <NumberField label="Top" min={0} value={shape.paddingTop ?? 16} onCommit={(paddingTop) => actions.patchSelected({ paddingTop })} />
                <NumberField label="Right" min={0} value={shape.paddingRight ?? 16} onCommit={(paddingRight) => actions.patchSelected({ paddingRight })} />
                <NumberField label="Bottom" min={0} value={shape.paddingBottom ?? 16} onCommit={(paddingBottom) => actions.patchSelected({ paddingBottom })} />
                <NumberField label="Left" min={0} value={shape.paddingLeft ?? 16} onCommit={(paddingLeft) => actions.patchSelected({ paddingLeft })} />
              </div>
              <label className={styles.toggleRow}>
                <span>Wrap</span>
                <input type="checkbox" checked={shape.layoutWrap ?? false} onChange={(event) => actions.patchSelected({ layoutWrap: event.target.checked })} />
              </label>
              <label className={styles.fullField}>
                <span>Main-axis alignment</span>
                <select value={shape.primaryAlign ?? "start"} onChange={(event) => actions.patchSelected({ primaryAlign: event.target.value as Shape["primaryAlign"] })}>
                  <option value="start">Start</option>
                  <option value="center">Center</option>
                  <option value="end">End</option>
                  <option value="space-between">Space between</option>
                </select>
              </label>
              <label className={styles.fullField}>
                <span>Cross-axis alignment</span>
                <select value={shape.counterAlign ?? "start"} onChange={(event) => actions.patchSelected({ counterAlign: event.target.value as Shape["counterAlign"] })}>
                  <option value="start">Start</option>
                  <option value="center">Center</option>
                  <option value="end">End</option>
                  <option value="stretch">Stretch</option>
                </select>
              </label>
              <div className={styles.fieldGrid}>
                <label className={styles.fullField}>
                  <span>Width</span>
                  <select value={shape.horizontalSizing ?? "fixed"} onChange={(event) => actions.patchSelected({ horizontalSizing: event.target.value as Shape["horizontalSizing"] })}>
                    <option value="fixed">Fixed</option>
                    <option value="hug">Hug</option>
                  </select>
                </label>
                <label className={styles.fullField}>
                  <span>Height</span>
                  <select value={shape.verticalSizing ?? "fixed"} onChange={(event) => actions.patchSelected({ verticalSizing: event.target.value as Shape["verticalSizing"] })}>
                    <option value="fixed">Fixed</option>
                    <option value="hug">Hug</option>
                  </select>
                </label>
              </div>
            </>
          )}
          <button type="button" onClick={actions.unframeSelected}>Remove frame</button>
        </section>
      )}
      <section className={styles.inspectorSection}>
        <h2>Accessibility</h2>
        <label className={styles.fullField}><span>Semantic role</span><select value={shape.semanticRole ?? "none"} onChange={(event) => actions.patchSelected({ semanticRole: event.target.value as Shape["semanticRole"] })}><option value="none">None</option><option value="button">Button</option><option value="heading">Heading</option><option value="image">Image</option><option value="link">Link</option><option value="input">Input</option><option value="navigation">Navigation</option></select></label>
        {(shape.type === "image" || shape.semanticRole === "image") && <label className={styles.fullField}><span>Alternative text</span><textarea value={shape.altText ?? ""} onChange={(event) => actions.patchSelected({ altText: event.target.value })} /></label>}
        <NumberField label="Focus order" min={1} value={shape.focusOrder ?? 1} onCommit={(focusOrder) => actions.patchSelected({ focusOrder })} />
      </section>
      <section className={styles.inspectorSection}>
        <h2>Developer handoff</h2>
        <label className={styles.fullField}><span>Status</span><select value={shape.devStatus ?? "designing"} onChange={(event) => actions.patchSelected({ devStatus: event.target.value as Shape["devStatus"] })}><option value="designing">Designing</option><option value="ready">Ready for development</option><option value="completed">Completed</option></select></label>
        <label className={styles.fullField}><span>Annotation</span><textarea value={shape.devAnnotation ?? ""} onChange={(event) => actions.patchSelected({ devAnnotation: event.target.value })} /></label>
        <label className={styles.fullField}><span>Code component URL</span><input type="url" value={shape.codeComponentUrl ?? ""} onChange={(event) => actions.patchSelected({ codeComponentUrl: event.target.value })} /></label>
      </section>
      {shape.parentId && (
        <section className={styles.inspectorSection}>
          <h2>Layout in frame</h2>
          <label className={styles.fullField}>
            <span>Positioning</span>
            <select value={shape.layoutPositioning ?? "auto"} onChange={(event) => actions.patchSelected({ layoutPositioning: event.target.value as Shape["layoutPositioning"] })}>
              <option value="auto">Auto</option>
              <option value="absolute">Absolute</option>
            </select>
          </label>
          <div className={styles.fieldGrid}>
            <label className={styles.fullField}>
              <span>Horizontal</span>
              <select value={shape.constraintHorizontal ?? "left"} onChange={(event) => actions.patchSelected({ constraintHorizontal: event.target.value as Shape["constraintHorizontal"] })}>
                <option value="left">Left</option>
                <option value="right">Right</option>
                <option value="left-right">Left & right</option>
                <option value="center">Center</option>
                <option value="scale">Scale</option>
              </select>
            </label>
            <label className={styles.fullField}>
              <span>Vertical</span>
              <select value={shape.constraintVertical ?? "top"} onChange={(event) => actions.patchSelected({ constraintVertical: event.target.value as Shape["constraintVertical"] })}>
                <option value="top">Top</option>
                <option value="bottom">Bottom</option>
                <option value="top-bottom">Top & bottom</option>
                <option value="center">Center</option>
                <option value="scale">Scale</option>
              </select>
            </label>
            <NumberField label="Grow" min={0} step={0.25} value={shape.layoutGrow ?? 0} onCommit={(layoutGrow) => actions.patchSelected({ layoutGrow })} />
          </div>
          <h2>Align to frame</h2>
          <div className={styles.buttonGrid}>
            <button type="button" onClick={() => actions.alignSelected("left")}>Left</button>
            <button type="button" onClick={() => actions.alignSelected("horizontal-center")}>Center X</button>
            <button type="button" onClick={() => actions.alignSelected("right")}>Right</button>
            <button type="button" onClick={() => actions.alignSelected("top")}>Top</button>
            <button type="button" onClick={() => actions.alignSelected("vertical-center")}>Center Y</button>
            <button type="button" onClick={() => actions.alignSelected("bottom")}>Bottom</button>
          </div>
        </section>
      )}
      <section className={styles.inspectorSection}>
        <h2>Layer</h2>
        <div className={styles.buttonGrid}>
          <button type="button" onClick={() => actions.orderSelected("front")}>Front</button>
          <button type="button" onClick={() => actions.orderSelected("forward")}>Forward</button>
          <button type="button" onClick={() => actions.orderSelected("backward")}>Backward</button>
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
  const selectedGroupId = selected[0]?.groupId;
  const isExistingGroup = Boolean(
    selected.length > 1 &&
    selectedGroupId &&
    selected.every((shape) => shape.groupId === selectedGroupId)
  );
  const canUngroup = selected.some((shape) => Boolean(shape.groupId));

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
              <ColorField label="Background" value={board.backGroundColor} onCommit={(backGroundColor) => actions.commitBoardPatch({ backGroundColor })} />
              <label className={styles.toggleRow}>
                <span>Show grid</span>
                <input type="checkbox" checked={showGrid} onChange={(event) => dispatch(setGrid(event.target.checked))} />
              </label>
              <label className={styles.toggleRow}>
                <span>Snap to grid</span>
                <input type="checkbox" checked={editor.snapToGrid} onChange={(event) => dispatch(setSnapToGrid(event.target.checked))} />
              </label>
              <label className={styles.toggleRow}>
                <span>Rulers and guides</span>
                <input type="checkbox" checked={editor.showRulers} onChange={(event) => dispatch(setShowRulers(event.target.checked))} />
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
                <button type="button" onClick={() => actions.orderSelected("front")}>Front</button>
                <button type="button" onClick={() => actions.orderSelected("forward")}>Forward</button>
                <button type="button" onClick={() => actions.orderSelected("backward")}>Backward</button>
                <button type="button" onClick={() => actions.orderSelected("back")}>Back</button>
                <button type="button" onClick={() => actions.distributeSelected("horizontal")}>Distribute X</button>
                <button type="button" onClick={() => actions.distributeSelected("vertical")}>Distribute Y</button>
                {!isExistingGroup && <button type="button" onClick={actions.groupSelected}>Group</button>}
                {canUngroup && <button type="button" onClick={actions.ungroupSelected}>Ungroup</button>}
                <button type="button" onClick={actions.frameSelected}>Frame selection</button>
                <button type="button" onClick={actions.sectionSelected}>Create section</button>
                {selected.every((shape) => shape.type === "section") && <button type="button" onClick={actions.collectSelectedSections}>Collect sections</button>}
              </div>
            </section>
            <section className={styles.inspectorSection}>
              <h2>Combine</h2>
              <div className={styles.buttonGrid}>
                <button type="button" onClick={() => actions.booleanSelected("union")}>Union</button>
                <button type="button" onClick={() => actions.booleanSelected("subtract")}>Subtract</button>
                <button type="button" onClick={() => actions.booleanSelected("intersect")}>Intersect</button>
                <button type="button" onClick={() => actions.booleanSelected("exclude")}>Exclude</button>
                <button type="button" onClick={actions.maskSelected}>Use as mask</button>
              </div>
              <p className={styles.fieldHint}>Boolean groups remain editable. The back-most selected object becomes the mask.</p>
            </section>
          </>
        )}
      </div>
    </aside>
  );
};

const InspectorPanel = () => <InspectorPanelView actions={useEditorActions()} />;

export default InspectorPanel;
