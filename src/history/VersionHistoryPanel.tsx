import { useEffect, useMemo, useState } from "react";
import { ClockCounterClockwise, Copy, FloppyDisk, GitDiff, PencilSimple, ShareNetwork, X } from "@phosphor-icons/react";
import { useDispatch, useSelector } from "react-redux";
import type { Shape } from "../classes/shape";
import { shapeBounds } from "../editor/geometry";
import { setRightPanel } from "../features/editor/editorSlice";
import { setWhiteboardData } from "../features/whiteBoard/whiteBoardSlice";
import {
  BoardVersion,
  BoardVersionDetail,
  createBoardCheckpoint,
  compareBoardVersion,
  duplicateBoardVersion,
  getBoardVersion,
  listBoardVersions,
  renameBoardVersion,
  restoreBoardVersion,
  restoreBoardVersionLayers,
  shareBoardVersion,
} from "../services/versionRepository";
import type { AppDispatch, RootState } from "../store";
import ui from "../components/ui/Ui.module.css";
import styles from "./VersionHistory.module.css";

const formatVersionTime = (value: string) => new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
}).format(new Date(value));

const kindLabel = (version: BoardVersion) => {
  if (version.kind === "checkpoint") return "Named checkpoint";
  if (version.kind === "before_restore") return "Recovery point";
  return "Autosave";
};

const errorMessage = (caught: unknown, fallback: string) => caught instanceof Error ? caught.message : fallback;

export const SnapshotPreview = ({ version }: { version: BoardVersionDetail | null }) => {
  const shapes = useMemo(() => Object.values(version?.document.nodes ?? {}) as unknown as Shape[], [version]);
  const scene = useMemo(() => {
    if (!shapes.length) return { x: 0, y: 0, width: 1, height: 1 };
    const bounds = shapes.map(shapeBounds);
    const left = Math.min(...bounds.map((item) => item.x));
    const top = Math.min(...bounds.map((item) => item.y));
    const right = Math.max(...bounds.map((item) => item.x + item.width));
    const bottom = Math.max(...bounds.map((item) => item.y + item.height));
    return { x: left, y: top, width: Math.max(1, right - left), height: Math.max(1, bottom - top) };
  }, [shapes]);

  return (
    <div className={styles.preview} style={{ backgroundColor: version?.document.backgroundColor ?? "#252629" }}>
      {version && shapes.map((shape) => {
        const bounds = shapeBounds(shape);
        const scale = Math.min(210 / scene.width, 112 / scene.height);
        return (
          <span
            key={shape.id}
            style={{
              left: (bounds.x - scene.x) * scale + 8,
              top: (bounds.y - scene.y) * scale + 8,
              width: Math.max(2, bounds.width * scale),
              height: Math.max(2, bounds.height * scale),
              borderRadius: shape.type === "ellipse" ? "50%" : Math.min(4, (shape.borderRadius ?? 0) * scale),
              background: shape.type === "text" ? "#c8c6c0" : shape.backgroundColor ?? "#72736f",
              border: shape.type === "frame" ? "1px solid #9a9b96" : undefined,
              transform: `rotate(${shape.rotation ?? 0}deg)`,
            }}
          />
        );
      })}
      {!version && <em>Select a version to preview it</em>}
      {version && shapes.length === 0 && <em>Empty board</em>}
    </div>
  );
};

export const VersionHistoryPanel = () => {
  const dispatch = useDispatch<AppDispatch>();
  const board = useSelector((state: RootState) => state.whiteBoard);
  const [versions, setVersions] = useState<BoardVersion[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detailState, setDetailState] = useState<{ id: string | null; version: BoardVersionDetail | null }>({ id: null, version: null });
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [metadataName, setMetadataName] = useState("");
  const [metadataDescription, setMetadataDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [confirmRestore, setConfirmRestore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [comparison, setComparison] = useState<Array<{ shapeId: string; status: string; name: string }>>([]);
  const [selectedComparisonIds, setSelectedComparisonIds] = useState<string[]>([]);
  const [editingMetadata, setEditingMetadata] = useState(false);
  const canEdit = board.role === "owner" || board.role === "editor";
  const detail = detailState.id === selectedId ? detailState.version : null;

  const refresh = async () => {
    const next = await listBoardVersions(board.id!, board.activeBranchId);
    setVersions(next);
    setSelectedId((current) => current ?? next[0]?.id ?? null);
  };

  useEffect(() => {
    if (!board.id) return;
    let active = true;
    void listBoardVersions(board.id, board.activeBranchId)
      .then((next) => {
        if (!active) return;
        setVersions(next);
        setSelectedId(next[0]?.id ?? null);
      })
      .catch((caught) => {
        if (active) setError(errorMessage(caught, "Version history could not be loaded."));
      });
    return () => { active = false; };
  }, [board.activeBranchId, board.id]);

  useEffect(() => {
    if (!board.id || !selectedId) return;
    let active = true;
    void getBoardVersion(board.id, selectedId, board.activeBranchId)
      .then((version) => active && setDetailState({ id: selectedId, version }))
      .catch((caught) => active && setError(errorMessage(caught, "Version preview could not be loaded.")));
    return () => { active = false; };
  }, [board.activeBranchId, board.id, selectedId]);

  const createCheckpoint = async () => {
    setSaving(true);
    setError(null);
    try {
      const created = await createBoardCheckpoint(board.id!, name, description, board.activeBranchId);
      setName("");
      setDescription("");
      await refresh();
      setSelectedId(created.id);
    } catch (caught) {
      setError(errorMessage(caught, "The checkpoint could not be created."));
    } finally {
      setSaving(false);
    }
  };

  const restore = async () => {
    setRestoring(true);
    setError(null);
    try {
      const result = await restoreBoardVersion(board.id!, selectedId!, board.activeBranchId);
      dispatch(setWhiteboardData({ revision: result.revision }));
      setConfirmRestore(false);
      await refresh();
    } catch (caught) {
      setError(errorMessage(caught, "The version could not be restored."));
    } finally {
      setRestoring(false);
    }
  };

  const selected = versions.find((version) => version.id === selectedId) ?? null;

  const runSelectedAction = async (operation: "rename" | "compare" | "duplicate" | "share") => {
    setError(null); setMessage(null);
    try {
      if (operation === "rename") {
        await renameBoardVersion(board.id!, selectedId!, metadataName || selected?.name || "Named version", metadataDescription, board.activeBranchId);
        setEditingMetadata(false); setMetadataName(""); setMetadataDescription(""); await refresh(); setMessage("Version details updated.");
      } else if (operation === "compare") {
        const result = await compareBoardVersion(board.id!, selectedId!, board.activeBranchId); setComparison(result.diff); setSelectedComparisonIds(result.diff.map((item) => item.shapeId)); setMessage(`${result.diff.length} changes from this version to the current board.`);
      } else if (operation === "duplicate") {
        const result = await duplicateBoardVersion(board.id!, selectedId!, `${selected?.name ?? board.title ?? "Board"} copy`, board.activeBranchId); setMessage(`Created a new board from this version (${result.boardId}).`);
      } else {
        const result = await shareBoardVersion(board.id!, selectedId!, undefined, board.activeBranchId); await navigator.clipboard.writeText(result.url); setMessage("Version link copied.");
      }
    } catch (caught) { setError(errorMessage(caught, "The version action failed.")); }
  };

  return (
    <aside className={`${ui.panel} ${styles.panel}`} aria-label="Version history">
      <header className={`${ui.panelHeader} ${styles.header}`}>
        <span className={ui.panelTitle}><ClockCounterClockwise aria-hidden="true" /> Version history</span>
        <button type="button" className={`${ui.button} ${ui.buttonGhost} ${ui.buttonCompact} ${ui.iconButton}`} aria-label="Close version history" onClick={() => dispatch(setRightPanel("properties"))}><X aria-hidden="true" /></button>
      </header>
      <SnapshotPreview version={selectedId ? detail : null} />
      {selectedId && <div className={styles.versionActions} aria-label="Selected version actions">
        <button type="button" className={`${ui.button} ${ui.buttonGhost} ${ui.iconButton}`} aria-label="Compare selected version" onClick={() => void runSelectedAction("compare")}><GitDiff aria-hidden="true" /></button>
        <button type="button" className={`${ui.button} ${ui.buttonGhost} ${ui.iconButton}`} aria-label="Copy selected version link" onClick={() => void runSelectedAction("share")}><ShareNetwork aria-hidden="true" /></button>
        <button type="button" className={`${ui.button} ${ui.buttonGhost} ${ui.iconButton}`} aria-label="Duplicate selected version" onClick={() => void runSelectedAction("duplicate")}><Copy aria-hidden="true" /></button>
        {canEdit && <button type="button" className={`${ui.button} ${ui.buttonGhost} ${ui.iconButton}`} aria-label="Rename selected version" onClick={() => { setEditingMetadata(true); setMetadataName(selected?.name ?? ""); setMetadataDescription(selected?.description ?? ""); }}><PencilSimple aria-hidden="true" /></button>}
      </div>}
      {editingMetadata && <section className={styles.checkpointForm}><label className={ui.field}><span className={ui.fieldLabel}>Version name</span><input className={ui.control} value={metadataName} onChange={(event) => setMetadataName(event.target.value)} /></label><label className={ui.field}><span className={ui.fieldLabel}>Description</span><textarea className={ui.control} value={metadataDescription} onChange={(event) => setMetadataDescription(event.target.value)} /></label><button type="button" className={`${ui.button} ${ui.buttonPrimary}`} onClick={() => void runSelectedAction("rename")}>Save details</button></section>}
      {canEdit && !editingMetadata && (
        <section className={styles.checkpointForm}>
          <label className={ui.field}><span className={ui.fieldLabel}>Name</span><input className={ui.control} value={name} maxLength={120} placeholder="Ready for review" onChange={(event) => setName(event.target.value)} /></label>
          <label className={ui.field}><span className={ui.fieldLabel}>Description</span><textarea className={ui.control} value={description} maxLength={500} placeholder="What changed?" onChange={(event) => setDescription(event.target.value)} /></label>
          <button type="button" className={`${ui.button} ${ui.buttonPrimary} ${ui.buttonCompact}`} disabled={!board.id || !name.trim() || saving} onClick={createCheckpoint}><FloppyDisk aria-hidden="true" /> {saving ? "Saving" : "Save checkpoint"}</button>
        </section>
      )}
      {error && <p className={`${ui.notice} ${ui.noticeError} ${styles.error}`} role="alert">{error}</p>}
      {message && <p className={`${ui.notice} ${styles.message}`} role="status">{message}</p>}
      {comparison.length > 0 && <div className={styles.comparison} aria-label="Version comparison">{comparison.map((item) => <label key={item.shapeId}><input type="checkbox" checked={selectedComparisonIds.includes(item.shapeId)} onChange={(event) => setSelectedComparisonIds((current) => event.target.checked ? [...current, item.shapeId] : current.filter((id) => id !== item.shapeId))} /><span><b>{item.status}</b> {item.name}</span></label>)}{canEdit && <button type="button" className={`${ui.button} ${ui.buttonGhost} ${ui.buttonCompact}`} disabled={!selectedComparisonIds.length || restoring} onClick={() => { setRestoring(true); void restoreBoardVersionLayers(board.id!, selectedId!, selectedComparisonIds, board.activeBranchId).then((result) => { dispatch(setWhiteboardData({ revision: result.revision })); setMessage(`Restored ${result.restoredShapeIds.length} selected layers.`); setComparison([]); }).catch((caught) => setError(errorMessage(caught, "Selected layers could not be restored."))).finally(() => setRestoring(false)); }}>Restore selected layers</button>}</div>}
      <div className={styles.list}>
        {versions.map((version) => (
          <button type="button" key={version.id} aria-pressed={selectedId === version.id} onClick={() => setSelectedId(version.id)}>
            <strong>{version.name ?? kindLabel(version)}</strong>
            <span>{formatVersionTime(version.created_at)}</span>
            <small>{version.creatorName ?? (version.created_by ? "Collaborator" : "Automatic")}</small>
          </button>
        ))}
        {versions.length === 0 && <p>No saved versions yet.</p>}
      </div>
      {selectedId && canEdit && (
        <div className={styles.restoreBar}>
          {confirmRestore ? (
            <>
              <span>The current board is saved first.</span>
              <button type="button" className={`${ui.button} ${ui.buttonCompact}`} onClick={() => setConfirmRestore(false)}>Cancel</button>
              <button type="button" className={`${ui.button} ${ui.buttonPrimary} ${ui.buttonCompact} ${styles.restoreConfirm}`} disabled={restoring} onClick={restore}>{restoring ? "Restoring" : "Confirm"}</button>
            </>
          ) : <button type="button" className={`${ui.button} ${ui.buttonCompact}`} onClick={() => setConfirmRestore(true)}>Restore this version</button>}
        </div>
      )}
    </aside>
  );
};
