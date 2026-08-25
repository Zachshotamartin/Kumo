import { Check, Code, Copy, X } from "@phosphor-icons/react";
import { useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { shapeBounds } from "../../editor/geometry";
import { designTokenExport, inspectTokens, shapeCss, shapeJson, shapeReact, shapeStory, shapeSwiftUI } from "../../editor/handoff";
import { measureShapes } from "../../editor/measurement";
import { setRightPanel } from "../../features/editor/editorSlice";
import type { AppDispatch, RootState } from "../../store";
import styles from "./EditorWorkspace.module.css";

const CopyBlock = ({ label, value }: { label: string; value: string }) => {
  const [copied, setCopied] = useState(false);
  return (
    <div className={styles.codeBlock}>
      <header><span>{label}</span><button type="button" aria-label={`Copy ${label}`} onClick={() => void navigator.clipboard.writeText(value).then(() => { setCopied(true); window.setTimeout(() => setCopied(false), 1200); })}>{copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}</button></header>
      <pre><code>{value}</code></pre>
    </div>
  );
};

const InspectPanel = () => {
  const dispatch = useDispatch<AppDispatch>();
  const board = useSelector((state: RootState) => state.whiteBoard);
  const selectedIds = useSelector((state: RootState) => state.selected.selectedShapes);
  const [codeFormat, setCodeFormat] = useState<"css" | "react" | "swift" | "json" | "story" | "tokens">("css");
  const shape = board.shapes.find((candidate) => selectedIds.includes(candidate.id));
  const secondShape = board.shapes.find((candidate) => candidate.id !== shape?.id && selectedIds.includes(candidate.id));
  const bounds = shape ? shapeBounds(shape) : null;
  const tokens = shape ? inspectTokens(shape) : null;
  const measurements = shape && secondShape ? measureShapes(shape, secondShape) : [];
  const code = shape ? codeFormat === "css" ? shapeCss(shape) : codeFormat === "react" ? shapeReact(shape) : codeFormat === "swift" ? shapeSwiftUI(shape) : codeFormat === "story" ? shapeStory(shape) : codeFormat === "tokens" ? designTokenExport(shape) : shapeJson(shape) : "";
  const selectionUrl = shape ? (() => { const url = new URL(window.location.href); url.searchParams.set("selection", shape.id); if (shape.pageId) url.searchParams.set("page", shape.pageId); return url.toString(); })() : "";
  return (
    <aside className={styles.inspectorPanel} aria-label="Developer inspect">
      <div className={styles.panelHeading}><span>Inspect</span><button type="button" aria-label="Close inspect" onClick={() => dispatch(setRightPanel("properties"))}><X aria-hidden="true" /></button></div>
      <div className={styles.inspectorBody}>
        {!shape || !bounds || !tokens ? <div className={styles.emptyPanel}><Code aria-hidden="true" /><p>Select a layer to inspect its implementation.</p></div> : (
          <>
            <section className={styles.inspectorSection}>
              <h2>{shape.name ?? shape.type}</h2>
              <dl className={styles.inspectGrid}><div><dt>X</dt><dd>{Math.round(bounds.x)}</dd></div><div><dt>Y</dt><dd>{Math.round(bounds.y)}</dd></div><div><dt>W</dt><dd>{Math.round(bounds.width)}</dd></div><div><dt>H</dt><dd>{Math.round(bounds.height)}</dd></div></dl>
            </section>
            <section className={styles.inspectorSection}><h2>Tokens</h2>{tokens.colors.map((color) => <button className={styles.tokenRow} type="button" key={color} onClick={() => void navigator.clipboard.writeText(color)}><i style={{ background: color }} /><span>{color}</span><Copy aria-hidden="true" /></button>)}{tokens.typography && <p className={styles.typeToken}>{tokens.typography}</p>}{tokens.variables.map((variable) => <p className={styles.typeToken} key={variable.property}>{variable.property} → {variable.id}</p>)}</section>
            <section className={styles.inspectorSection}><h2>Handoff</h2><p className={styles.typeToken}>Status: {shape.devStatus ?? "designing"}</p>{shape.devAnnotation && <p>{shape.devAnnotation}</p>}{shape.codeComponentUrl && <a href={shape.codeComponentUrl} target="_blank" rel="noreferrer">Open code component</a>}{measurements.map((measurement) => <p className={styles.typeToken} key={measurement.axis}>{measurement.axis} gap: {Math.round(measurement.value)}px</p>)}<button type="button" onClick={() => void navigator.clipboard.writeText(selectionUrl)}>Copy link to selection</button><label className={styles.fullField}><span>Code format</span><select value={codeFormat} onChange={(event) => setCodeFormat(event.target.value as typeof codeFormat)}><option value="css">CSS</option><option value="react">React</option><option value="swift">SwiftUI</option><option value="json">JSON</option><option value="story">Storybook story</option><option value="tokens">Design tokens</option></select></label></section>
            <CopyBlock label={codeFormat === "swift" ? "SwiftUI" : codeFormat.toUpperCase()} value={code} />
          </>
        )}
      </div>
    </aside>
  );
};

export default InspectPanel;
