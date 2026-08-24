import { Archive, GitBranch, GitMerge, Plus, SignOut, X } from "@phosphor-icons/react";
import { useCallback, useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { setRightPanel } from "../../features/editor/editorSlice";
import { clearSelectedShapes } from "../../features/selected/selectedSlice";
import { setWhiteboardData } from "../../features/whiteBoard/whiteBoardSlice";
import {
  archiveDesignBranch,
  createDesignBranch,
  diffDesignBranch,
  listDesignBranches,
  mergeDesignBranch,
  reviewDesignBranch,
  type BranchDiffItem,
  type DesignBranch,
} from "../../services/branchRepository";
import type { AppDispatch, RootState } from "../../store";
import styles from "./EditorWorkspace.module.css";

const BranchesPanel = () => {
  const dispatch = useDispatch<AppDispatch>();
  const board = useSelector((state: RootState) => state.whiteBoard);
  const [branches, setBranches] = useState<DesignBranch[]>([]);
  const [name, setName] = useState("Exploration");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirmMerge, setConfirmMerge] = useState<string | null>(null);
  const [reviewing, setReviewing] = useState<string | null>(null);
  const [diff, setDiff] = useState<BranchDiffItem[]>([]);
  const [reviewNote, setReviewNote] = useState("");

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
    void listDesignBranches(board.id)
      .then((result) => { if (active) { setBranches(result); setError(null); } })
      .catch((caught) => { if (active) setError(caught instanceof Error ? caught.message : "Branches could not be loaded."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [board.id]);

  const enter = (branch: DesignBranch) => {
    dispatch(clearSelectedShapes());
    dispatch(setWhiteboardData({
      roomId: branch.room_id,
      baseRoomId: board.baseRoomId ?? (board.id ? `board:${board.id}` : null),
      activeBranchId: branch.id,
      activeBranchName: branch.name,
      revision: board.revision + 1,
      shapes: [],
    }));
  };

  const leave = (revision = board.revision + 1) => {
    dispatch(clearSelectedShapes());
    dispatch(setWhiteboardData({
      roomId: board.baseRoomId ?? (board.id ? `board:${board.id}` : null),
      activeBranchId: null,
      activeBranchName: null,
      revision,
      shapes: [],
    }));
  };

  return (
    <aside className={styles.inspectorPanel} aria-label="Design branches">
      <div className={styles.panelHeading}><span>Branches</span><button type="button" aria-label="Close branches" onClick={() => dispatch(setRightPanel("properties"))}><X aria-hidden="true" /></button></div>
      <div className={styles.inspectorBody}>
        {board.activeBranchId && (
          <section className={styles.activeBranchCard}>
            <span>Currently editing</span><strong><GitBranch aria-hidden="true" /> {board.activeBranchName}</strong>
            <button type="button" onClick={() => leave()}><SignOut aria-hidden="true" /> Return to main</button>
          </section>
        )}
        <section className={styles.inspectorSection}>
          <h2>New branch</h2>
          <label className={styles.fullField}><span>Name</span><input value={name} maxLength={120} onChange={(event) => setName(event.target.value)} /></label>
          <button type="button" disabled={!name.trim() || !board.id || board.role === "viewer"} onClick={() => {
            if (!board.id) return;
            setLoading(true);
            void createDesignBranch(board.id, name).then((branch) => { setBranches((current) => [branch, ...current]); enter(branch); }).catch((caught) => setError(caught instanceof Error ? caught.message : "Branch creation failed.")).finally(() => setLoading(false));
          }}><Plus aria-hidden="true" /> Create from main</button>
        </section>
        <section className={styles.inspectorSection}>
          <h2>Board branches</h2>
          {loading && <p className={styles.fieldHint} role="status">Loading branches…</p>}
          {!loading && !branches.length && <p className={styles.fieldHint}>No branches yet. Branches isolate experimental work from the main board.</p>}
          <div className={styles.branchList}>
            {branches.map((branch) => (
              <div className={styles.branchRow} key={branch.id}>
                <div><GitBranch aria-hidden="true" /><span><strong>{branch.name}</strong><small>{branch.status} · {new Date(branch.updated_at).toLocaleDateString()}</small>{(branch.branch_reviews ?? []).map((review) => <small key={review.reviewer_id}>{review.status === "changes-requested" ? "Changes requested" : review.status === "approved" ? "Approved" : "Review requested"}{review.note ? ` · ${review.note}` : ""}</small>)}</span></div>
                {branch.status === "open" && (
                  <div>
                    <button type="button" disabled={board.activeBranchId === branch.id} onClick={() => enter(branch)}>Open</button>
                    {confirmMerge === branch.id ? (
                      <button type="button" className={styles.mergeConfirm} onClick={() => {
                        if (!board.id) return;
                        setLoading(true);
                        void mergeDesignBranch(board.id, branch.id).then((result) => { leave(result.revision); return load(); }).catch((caught) => setError(caught instanceof Error ? caught.message : "Merge failed.")).finally(() => { setConfirmMerge(null); setLoading(false); });
                      }}>Confirm merge</button>
                    ) : <button type="button" aria-label={`Merge ${branch.name}`} onClick={() => setConfirmMerge(branch.id)}><GitMerge aria-hidden="true" /></button>}
                    <button type="button" aria-label={`Archive ${branch.name}`} onClick={() => {
                      if (!board.id) return;
                      void archiveDesignBranch(board.id, branch.id).then(load).catch((caught) => setError(caught instanceof Error ? caught.message : "Archive failed."));
                    }}><Archive aria-hidden="true" /></button>
                    <button type="button" onClick={() => {
                      if (!board.id) return;
                      setReviewing(branch.id);
                      void diffDesignBranch(board.id, branch.id).then((result) => setDiff(result.diff)).catch((caught) => setError(caught instanceof Error ? caught.message : "Diff failed."));
                    }}>Review</button>
                  </div>
                )}
                {reviewing === branch.id && <div className={styles.branchReview}>
                  <strong>{diff.length} document changes</strong>
                  {diff.map((item) => <span key={item.shapeId}>{item.status} · {item.name}</span>)}
                  <label className={styles.fullField}><span>Review note</span><textarea value={reviewNote} onChange={(event) => setReviewNote(event.target.value)} /></label>
                  <div className={styles.buttonGrid}><button type="button" onClick={() => { if (!board.id) return; void reviewDesignBranch(board.id, branch.id, "approved", reviewNote).then(() => { setReviewing(null); setError(null); }); }}>Approve</button><button type="button" onClick={() => { if (!board.id) return; void reviewDesignBranch(board.id, branch.id, "changes-requested", reviewNote).then(() => { setReviewing(null); setError(null); }); }}>Request changes</button></div>
                </div>}
              </div>
            ))}
          </div>
        </section>
        {error && <p className={styles.fieldError} role="alert">{error}</p>}
      </div>
    </aside>
  );
};

export default BranchesPanel;
