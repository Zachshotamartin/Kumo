import { Archive, ArrowsClockwise, Copy, GitBranch, GitMerge, PencilSimple, Plus, SignOut, X } from "@phosphor-icons/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { setRightPanel } from "../../features/editor/editorSlice";
import { clearSelectedShapes } from "../../features/selected/selectedSlice";
import { setWhiteboardData } from "../../features/whiteBoard/whiteBoardSlice";
import {
  archiveDesignBranch, createDesignBranch, diffDesignBranch, listDesignBranches, mergeDesignBranch,
  renameDesignBranch, requestBranchReview, restoreDesignBranch, reviewDesignBranch, updateBranchFromMain,
  type BranchConflict, type BranchDiffItem, type DesignBranch,
} from "../../services/branchRepository";
import { ApiError } from "../../services/apiClient";
import type { AppDispatch, RootState } from "../../store";
import styles from "./EditorWorkspace.module.css";

const numeric = (value: unknown, fallback = 0) => typeof value === "number" && Number.isFinite(value) ? value : fallback;

const BranchDiffPreview = ({ diff, mode }: { diff: BranchDiffItem[]; mode: "overlay" | "side-by-side" }) => {
  const records = diff.flatMap((item) => [item.before, item.after]).filter((value): value is Record<string, unknown> => Boolean(value));
  const maxX = Math.max(100, ...records.map((shape) => numeric(shape.x1) + numeric(shape.width, 100)));
  const maxY = Math.max(100, ...records.map((shape) => numeric(shape.y1) + numeric(shape.height, 60)));
  const renderLayer = (kind: "before" | "after", offset = 0) => diff.map((item) => {
    const shape = item[kind];
    if (!shape) return null;
    return <rect key={`${kind}:${item.shapeId}`} x={offset + numeric(shape.x1)} y={numeric(shape.y1)} width={Math.max(2, numeric(shape.width, 100))} height={Math.max(2, numeric(shape.height, 60))} data-version={kind} data-status={item.status} />;
  });
  return <svg className={styles.branchDiffPreview} viewBox={`0 0 ${mode === "side-by-side" ? maxX * 2 + 20 : maxX} ${maxY}`} role="img" aria-label={`${mode} branch comparison`}>
    {renderLayer("before")}{renderLayer("after", mode === "side-by-side" ? maxX + 20 : 0)}
  </svg>;
};

const branchUrl = (boardId: string, branchId: string) => {
  const url = new URL(window.location.href);
  url.searchParams.set("board", boardId);
  url.searchParams.set("branch", branchId);
  return url.toString();
};

const BranchesPanel = () => {
  const dispatch = useDispatch<AppDispatch>();
  const board = useSelector((state: RootState) => state.whiteBoard);
  const [branches, setBranches] = useState<DesignBranch[]>([]);
  const [name, setName] = useState("Exploration");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [confirmMerge, setConfirmMerge] = useState<string | null>(null);
  const [reviewing, setReviewing] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [diff, setDiff] = useState<BranchDiffItem[]>([]);
  const [diffMode, setDiffMode] = useState<"overlay" | "side-by-side">("overlay");
  const [reviewNote, setReviewNote] = useState("");
  const [reviewers, setReviewers] = useState("");
  const [mergeDescription, setMergeDescription] = useState("");
  const [conflicts, setConflicts] = useState<BranchConflict[]>([]);
  const [conflictBranchId, setConflictBranchId] = useState<string | null>(null);
  const [resolutions, setResolutions] = useState<Record<string, "main" | "branch">>({});

  const load = useCallback(async () => {
    if (!board.id) return;
    setLoading(true);
    try { setBranches(await listDesignBranches(board.id)); setError(null); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Branches could not be loaded."); }
    finally { setLoading(false); }
  }, [board.id]);

  useEffect(() => {
    if (!board.id) return;
    let active = true;
    void listDesignBranches(board.id).then((result) => {
      if (!active) return;
      setBranches(result);
      setError(null);
      setLoading(false);
    }).catch((caught) => {
      if (!active) return;
      setError(caught instanceof Error ? caught.message : "Branches could not be loaded.");
      setLoading(false);
    });
    return () => { active = false; };
  }, [board.id]);

  const enter = (branch: DesignBranch) => {
    dispatch(clearSelectedShapes());
    dispatch(setWhiteboardData({ roomId: branch.room_id, baseRoomId: board.baseRoomId ?? (board.id ? `board:${board.id}` : null), activeBranchId: branch.id, activeBranchName: branch.name, revision: board.revision + 1, shapes: [] }));
  };
  const leave = (revision = board.revision + 1) => {
    dispatch(clearSelectedShapes());
    dispatch(setWhiteboardData({ roomId: board.baseRoomId ?? (board.id ? `board:${board.id}` : null), activeBranchId: null, activeBranchName: null, revision, shapes: [] }));
  };

  const openReview = async (branchId: string) => {
    if (!board.id) return;
    setReviewing(branchId);
    try { setDiff((await diffDesignBranch(board.id, branchId)).diff); setError(null); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Diff failed."); }
  };

  const updateFromMain = async (branchId: string, selectedResolutions = resolutions) => {
    if (!board.id) return;
    setLoading(true); setError(null);
    try {
      await updateBranchFromMain(board.id, branchId, selectedResolutions);
      setConflicts([]); setConflictBranchId(null); setResolutions({}); setMessage("Branch updated from main."); await load();
    } catch (caught) {
      if (caught instanceof ApiError && caught.details?.code === "BRANCH_CONFLICTS" && Array.isArray(caught.details.conflicts)) {
        setConflicts(caught.details.conflicts as BranchConflict[]); setConflictBranchId(branchId);
      }
      setError(caught instanceof Error ? caught.message : "Branch update failed.");
    } finally { setLoading(false); }
  };

  const openBranches = useMemo(() => branches.filter((branch) => branch.status === "open"), [branches]);
  const inactiveBranches = useMemo(() => branches.filter((branch) => branch.status !== "open"), [branches]);

  return <aside className={styles.inspectorPanel} aria-label="Design branches">
    <div className={styles.panelHeading}><span>Branches</span><button type="button" aria-label="Close branches" onClick={() => dispatch(setRightPanel("properties"))}><X aria-hidden="true" /></button></div>
    <div className={styles.inspectorBody}>
      {board.activeBranchId && <section className={styles.activeBranchCard}><span>Currently editing</span><strong><GitBranch aria-hidden="true" /> {board.activeBranchName}</strong><button type="button" onClick={() => leave()}><SignOut aria-hidden="true" /> Return to main</button></section>}
      <section className={styles.inspectorSection}>
        <h2>New branch</h2>
        <label className={styles.fullField}><span>Name</span><input value={name} maxLength={120} onChange={(event) => setName(event.target.value)} /></label>
        <button type="button" disabled={!name.trim() || !board.id || board.role === "viewer" || loading} onClick={() => {
          if (!board.id) return;
          setLoading(true); void createDesignBranch(board.id, name).then((branch) => { setBranches((current) => [branch, ...current]); enter(branch); }).catch((caught) => setError(caught instanceof Error ? caught.message : "Branch creation failed.")).finally(() => setLoading(false));
        }}><Plus aria-hidden="true" /> Create from main</button>
      </section>

      <section className={styles.inspectorSection}>
        <h2>Open branches</h2>
        {loading && <p className={styles.fieldHint} role="status">Loading branches…</p>}
        {!loading && !openBranches.length && <p className={styles.fieldHint}>No open branches.</p>}
        <div className={styles.branchList}>{openBranches.map((branch) => <div className={styles.branchRow} key={branch.id}>
          <div><GitBranch aria-hidden="true" /><span><strong>{branch.name}</strong><small>Updated {new Date(branch.updated_at).toLocaleDateString()}{branch.updated_from_main_at ? " · synced with main" : ""}</small>{(branch.branch_reviews ?? []).map((review) => <small key={review.reviewer_id}>{review.status === "changes-requested" ? "Changes requested" : review.status === "approved" ? "Approved" : "Review requested"}{review.note ? ` · ${review.note}` : ""}</small>)}</span></div>
          <div>
            <button type="button" disabled={board.activeBranchId === branch.id} onClick={() => enter(branch)}>Open</button>
            <button type="button" aria-label={`Copy link to ${branch.name}`} onClick={() => board.id && void navigator.clipboard.writeText(branchUrl(board.id, branch.id)).then(() => setMessage("Branch link copied."))}><Copy aria-hidden="true" /></button>
            <button type="button" aria-label={`Rename ${branch.name}`} onClick={() => { setRenaming(branch.id); setRenameValue(branch.name); }}><PencilSimple aria-hidden="true" /></button>
            <button type="button" aria-label={`Update ${branch.name} from main`} onClick={() => void updateFromMain(branch.id)}><ArrowsClockwise aria-hidden="true" /></button>
            {confirmMerge === branch.id ? <button type="button" className={styles.mergeConfirm} onClick={() => {
              if (!board.id) return;
              setLoading(true); void mergeDesignBranch(board.id, branch.id, mergeDescription).then((result) => { leave(result.revision); setMergeDescription(""); return load(); }).catch((caught) => setError(caught instanceof Error ? caught.message : "Merge failed.")).finally(() => { setConfirmMerge(null); setLoading(false); });
            }}>Confirm merge</button> : <button type="button" aria-label={`Merge ${branch.name}`} onClick={() => setConfirmMerge(branch.id)}><GitMerge aria-hidden="true" /></button>}
            <button type="button" aria-label={`Archive ${branch.name}`} onClick={() => board.id && void archiveDesignBranch(board.id, branch.id).then(load).catch((caught) => setError(caught instanceof Error ? caught.message : "Archive failed."))}><Archive aria-hidden="true" /></button>
            <button type="button" onClick={() => void openReview(branch.id)}>Review</button>
          </div>
          {renaming === branch.id && <form className={styles.branchReview} onSubmit={(event) => { event.preventDefault(); if (!board.id) return; void renameDesignBranch(board.id, branch.id, renameValue).then(() => { setRenaming(null); return load(); }).catch((caught) => setError(caught instanceof Error ? caught.message : "Rename failed.")); }}><label className={styles.fullField}><span>Branch name</span><input value={renameValue} onChange={(event) => setRenameValue(event.target.value)} /></label><button type="submit">Save name</button></form>}
          {confirmMerge === branch.id && <label className={styles.fullField}><span>Merge description</span><textarea value={mergeDescription} onChange={(event) => setMergeDescription(event.target.value)} placeholder="Summarize what changed" /></label>}
          {reviewing === branch.id && <div className={styles.branchReview}>
            <div className={styles.buttonGrid}><button type="button" aria-pressed={diffMode === "overlay"} onClick={() => setDiffMode("overlay")}>Overlay</button><button type="button" aria-pressed={diffMode === "side-by-side"} onClick={() => setDiffMode("side-by-side")}>Side by side</button></div>
            <BranchDiffPreview diff={diff} mode={diffMode} />
            <strong>{diff.length} document changes</strong>{diff.map((item) => <span key={item.shapeId}>{item.status} · {item.name}</span>)}
            <label className={styles.fullField}><span>Reviewer emails or IDs</span><input value={reviewers} onChange={(event) => setReviewers(event.target.value)} placeholder="reviewer@example.com" /></label>
            <label className={styles.fullField}><span>Review note</span><textarea value={reviewNote} onChange={(event) => setReviewNote(event.target.value)} /></label>
            <button type="button" disabled={!reviewers.trim()} onClick={() => board.id && void requestBranchReview(board.id, branch.id, reviewers.split(/[\s,]+/).filter(Boolean), reviewNote).then(() => { setMessage("Review requested."); return load(); }).catch((caught) => setError(caught instanceof Error ? caught.message : "Review request failed."))}>Request review</button>
            <div className={styles.buttonGrid}><button type="button" onClick={() => board.id && void reviewDesignBranch(board.id, branch.id, "approved", reviewNote).then(() => { setReviewing(null); setMessage("Branch approved."); return load(); })}>Approve</button><button type="button" onClick={() => board.id && void reviewDesignBranch(board.id, branch.id, "changes-requested", reviewNote).then(() => { setReviewing(null); setMessage("Changes requested."); return load(); })}>Request changes</button></div>
          </div>}
          {conflictBranchId === branch.id && conflicts.length > 0 && <div className={styles.branchReview} role="group" aria-label="Branch conflict resolution"><strong>{conflicts.length} conflicts need a decision</strong>{conflicts.map((conflict) => <fieldset key={conflict.shapeId}><legend>{conflict.shapeId}</legend><label><input type="radio" name={`conflict:${conflict.shapeId}`} checked={resolutions[conflict.shapeId] === "main"} onChange={() => setResolutions((current) => ({ ...current, [conflict.shapeId]: "main" }))} /> Keep main</label><label><input type="radio" name={`conflict:${conflict.shapeId}`} checked={resolutions[conflict.shapeId] === "branch"} onChange={() => setResolutions((current) => ({ ...current, [conflict.shapeId]: "branch" }))} /> Keep branch</label></fieldset>)}<button type="button" disabled={conflicts.some((conflict) => !resolutions[conflict.shapeId])} onClick={() => void updateFromMain(branch.id)}>Apply resolutions</button></div>}
        </div>)}</div>
      </section>

      {inactiveBranches.length > 0 && <section className={styles.inspectorSection}><h2>History</h2><div className={styles.branchList}>{inactiveBranches.map((branch) => <div className={styles.branchRow} key={branch.id}><div><GitBranch aria-hidden="true" /><span><strong>{branch.name}</strong><small>{branch.status}{branch.merge_description ? ` · ${branch.merge_description}` : ""}</small></span></div>{branch.status === "archived" && <button type="button" onClick={() => board.id && void restoreDesignBranch(board.id, branch.id).then(load)}>Restore</button>}</div>)}</div></section>}
      {message && <p className={styles.successLine} role="status">{message}</p>}
      {error && <p className={styles.fieldError} role="alert">{error}</p>}
    </div>
  </aside>;
};

export default BranchesPanel;
