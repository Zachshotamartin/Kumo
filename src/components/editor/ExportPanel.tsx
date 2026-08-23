import { DownloadSimple, FileArrowUp, FilePdf, FilePng, FileSvg, X } from "@phosphor-icons/react";
import { useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import {
  downloadBlob,
  parseKumoDocument,
  serializeKumoDocument,
  serializePdf,
  serializeSvg,
  svgToPng,
} from "../../editor/export";
import { useEditorActions } from "../../editor/useEditorActions";
import { setRightPanel } from "../../features/editor/editorSlice";
import type { AppDispatch, RootState } from "../../store";
import styles from "./EditorWorkspace.module.css";

const safeName = (value: string) => value.trim().replace(/[^a-z0-9-_]+/gi, "-").replace(/^-|-$/g, "") || "kumo-board";

const ExportPanel = () => {
  const dispatch = useDispatch<AppDispatch>();
  const board = useSelector((state: RootState) => state.whiteBoard);
  const selectedIds = useSelector((state: RootState) => state.selected.selectedShapes);
  const actions = useEditorActions();
  const inputRef = useRef<HTMLInputElement>(null);
  const [scale, setScale] = useState(2);
  const [status, setStatus] = useState<string | null>(null);
  const name = safeName(board.title ?? "kumo-board");
  const svg = () => serializeSvg(board.shapes, selectedIds, selectedIds.length ? "transparent" : board.backGroundColor);

  const exportPng = async () => {
    try {
      setStatus("Rendering PNG…");
      downloadBlob(await svgToPng(svg(), scale), `${name}.png`);
      setStatus("PNG downloaded.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "PNG export failed.");
    }
  };

  return (
    <aside className={styles.inspectorPanel} aria-label="Export and import">
      <div className={styles.panelHeading}>
        <span>Export</span>
        <button type="button" aria-label="Close export" onClick={() => dispatch(setRightPanel("properties"))}><X aria-hidden="true" /></button>
      </div>
      <div className={styles.inspectorBody}>
        <section className={styles.inspectorSection}>
          <h2>{selectedIds.length ? `Selection · ${selectedIds.length}` : "Entire board"}</h2>
          <label className={styles.fullField}>
            <span>PNG scale</span>
            <select value={scale} onChange={(event) => setScale(Number(event.target.value))}>
              <option value={1}>1×</option><option value={2}>2×</option><option value={3}>3×</option><option value={4}>4×</option>
            </select>
          </label>
          <div className={styles.exportGrid}>
            <button type="button" onClick={() => downloadBlob(new Blob([svg()], { type: "image/svg+xml" }), `${name}.svg`)}><FileSvg aria-hidden="true" /><span>SVG</span></button>
            <button type="button" onClick={() => void exportPng()}><FilePng aria-hidden="true" /><span>PNG</span></button>
            <button type="button" onClick={() => downloadBlob(new Blob([serializePdf(board.shapes).buffer as ArrayBuffer], { type: "application/pdf" }), `${name}.pdf`)}><FilePdf aria-hidden="true" /><span>PDF</span></button>
            <button type="button" onClick={() => downloadBlob(new Blob([serializeKumoDocument(board.title ?? "Board", board.backGroundColor, board.shapes)], { type: "application/json" }), `${name}.kumo.json`)}><DownloadSimple aria-hidden="true" /><span>Kumo</span></button>
          </div>
          <p className={styles.fieldHint}>SVG and PNG use the current selection when one exists. PDF creates a page for each top-level frame.</p>
        </section>

        <section className={styles.inspectorSection}>
          <h2>Import</h2>
          <input
            ref={inputRef}
            className={styles.visuallyHidden}
            type="file"
            accept=".json,.kumo.json,application/json"
            aria-label="Import Kumo document"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (!file) return;
              void file.text().then((source) => {
                const document = parseKumoDocument(source, board.shapes.map((shape) => shape.id));
                actions.commitShapes([...board.shapes, ...document.shapes]);
                setStatus(`Imported ${document.shapes.length} objects from ${document.title}.`);
              }).catch((error) => setStatus(error instanceof Error ? error.message : "Import failed."));
              event.currentTarget.value = "";
            }}
          />
          <button type="button" onClick={() => inputRef.current?.click()}><FileArrowUp aria-hidden="true" /> Add Kumo document to board</button>
        </section>
        {status && <p className={styles.exportStatus} role="status">{status}</p>}
      </div>
    </aside>
  );
};

export default ExportPanel;
