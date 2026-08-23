import { Check, Code, Copy, X } from "@phosphor-icons/react";
import { useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { shapeBounds } from "../../editor/geometry";
import { inspectTokens, shapeCss, shapeReact } from "../../editor/handoff";
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
  const shape = board.shapes.find((candidate) => selectedIds.includes(candidate.id));
  const bounds = shape ? shapeBounds(shape) : null;
  const tokens = shape ? inspectTokens(shape) : null;
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
            <CopyBlock label="CSS" value={shapeCss(shape)} />
            <CopyBlock label="React" value={shapeReact(shape)} />
          </>
        )}
      </div>
    </aside>
  );
};

export default InspectPanel;
