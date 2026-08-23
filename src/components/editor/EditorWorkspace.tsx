import { useRef, useState } from "react";
import { useSyncStatus } from "@liveblocks/react";
import { useDispatch, useSelector } from "react-redux";
import { signOut } from "firebase/auth";
import { auth } from "../../config/firebase";
import { useEditorActions } from "../../editor/useEditorActions";
import { logout } from "../../features/auth/authSlice";
import { zoomAtPoint } from "../../editor/geometry";
import { setViewport } from "../../features/editor/editorSlice";
import { clearSelectedShapes } from "../../features/selected/selectedSlice";
import { setWhiteboardData } from "../../features/whiteBoard/whiteBoardSlice";
import { deleteBoard } from "../../services/boardRepository";
import { AppDispatch, RootState } from "../../store";
import EditorCanvas from "./EditorCanvas";
import EditorToolbar from "./EditorToolbar";
import InspectorPanel from "./InspectorPanel";
import LayersPanel from "./LayersPanel";
import styles from "./EditorWorkspace.module.css";
import KumoLogo from "../brand/KumoLogo";
import ShareDialog from "./ShareDialog";

const emptyBoard = {
  shapes: [],
  id: null,
  roomId: null,
  role: null,
  type: null,
  title: null,
  uid: null,
  sharedWith: [],
  members: {},
  backGroundColor: "#252629",
  lastChangedBy: null,
  currentUsers: [],
  schemaVersion: 3,
  revision: 0,
  updatedAt: null,
};

const EditorWorkspace = () => {
  const dispatch = useDispatch<AppDispatch>();
  const board = useSelector((state: RootState) => state.whiteBoard);
  const user = useSelector((state: RootState) => state.auth);
  const editor = useSelector((state: RootState) => state.editor);
  const actions = useEditorActions();
  const syncStatus = useSyncStatus({ smooth: true });
  const canvasRegionRef = useRef<HTMLElement>(null);
  const [title, setTitle] = useState(board.title ?? "Untitled board");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const goHome = () => {
    dispatch(clearSelectedShapes());
    dispatch(setWhiteboardData(emptyBoard));
  };

  const commitTitle = () => {
    if (board.role !== "owner") {
      setTitle(board.title ?? "Untitled board");
      return;
    }
    const cleanTitle = title.trim() || "Untitled board";
    setTitle(cleanTitle);
    if (cleanTitle !== board.title) actions.commitBoardPatch({ title: cleanTitle });
  };

  const handleDelete = async () => {
    if (!user.uid) return;
    try {
      if (!board.id) return;
      await deleteBoard(board.id);
      setConfirmDelete(false);
      goHome();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "We couldn't delete this board.");
    }
  };

  const handleLogout = async () => {
    await signOut(auth);
    dispatch(logout());
    dispatch(setWhiteboardData(emptyBoard));
  };

  const setZoomAroundCanvasCenter = (nextZoom: number) => {
    const rect = canvasRegionRef.current?.getBoundingClientRect();
    if (!rect) return;
    dispatch(
      setViewport(
        zoomAtPoint(
          editor.viewport,
          { x: rect.width / 2, y: rect.height / 2 },
          nextZoom
        )
      )
    );
  };

  return (
    <main className={styles.workspace}>
      <header className={styles.topbar}>
        <div className={styles.topbarStart}>
          <button type="button" className={styles.brandButton} onClick={goHome} aria-label="Back to boards">
            <KumoLogo className={styles.brandLogo} decorative />
            <span className={styles.brandWord}>Kumo</span>
          </button>
          <span className={styles.breadcrumb} aria-hidden="true">/</span>
          <input
            className={styles.titleInput}
            value={title}
            aria-label="Board title"
            disabled={board.role !== "owner"}
            title={board.role === "owner" ? "Rename board" : "Only the board owner can rename this board"}
            onChange={(event) => setTitle(event.target.value)}
            onBlur={commitTitle}
            onKeyDown={(event) => event.key === "Enter" && event.currentTarget.blur()}
          />
        </div>
        <div className={styles.topbarEnd}>
          <span
            className={`${styles.saveStatus} ${editor.saveStatus === "error" ? styles.saveError : ""}`}
            role="status"
          >
            {syncStatus === "synchronizing" || editor.saveStatus === "saving"
              ? "Saving"
              : editor.saveStatus === "error"
              ? "Save failed"
              : editor.saveStatus === "saved"
              ? "Saved"
              : "Ready"}
          </span>
          <div className={styles.presenceStack} aria-label={`${board.currentUsers.length} people on this board`}>
            {board.currentUsers.slice(0, 3).map((presence) => (
              <span key={presence.uid} title={presence.label ?? "Collaborator"}>
                {(presence.label ?? "C").slice(0, 1).toUpperCase()}
              </span>
            ))}
          </div>
          <button type="button" className={styles.shareButton} onClick={() => setShareOpen(true)}>
            Share
          </button>
          <button type="button" className={styles.menuButton} aria-label="Board menu" aria-expanded={menuOpen} onClick={() => setMenuOpen((value) => !value)}>•••</button>
          {menuOpen && (
            <div className={styles.boardMenu} role="menu">
              <button type="button" role="menuitem" onClick={() => actions.commitBoardPatch({ type: board.type === "public" ? "private" : "public" })} disabled={board.role !== "owner"}>
                Make {board.type === "public" ? "private" : "public"}
              </button>
              <button type="button" role="menuitem" onClick={() => setConfirmDelete(true)} disabled={board.role !== "owner"}>
                Delete board
              </button>
              <button type="button" role="menuitem" onClick={handleLogout}>Sign out</button>
            </div>
          )}
        </div>
      </header>

      <div className={styles.editorGrid}>
        <LayersPanel />
        <section ref={canvasRegionRef} className={styles.canvasRegion} aria-label="Design editor">
          <EditorCanvas />
          <EditorToolbar />
          <div className={styles.zoomControl} aria-label="Zoom controls">
            <button type="button" aria-label="Zoom out" onClick={() => setZoomAroundCanvasCenter(editor.viewport.zoom / 1.25)}>−</button>
            <button type="button" className={styles.zoomValue} onClick={() => setZoomAroundCanvasCenter(1)}>
              {Math.round(editor.viewport.zoom * 100)}%
            </button>
            <button type="button" aria-label="Zoom in" onClick={() => setZoomAroundCanvasCenter(editor.viewport.zoom * 1.25)}>＋</button>
          </div>
        </section>
        <InspectorPanel />
      </div>

      {(error || editor.saveError) && (
        <div className={styles.errorToast} role="alert">
          <span>{error ?? editor.saveError}</span>
          <button type="button" aria-label="Dismiss error" onClick={() => setError(null)}>×</button>
        </div>
      )}

      {confirmDelete && (
        <div className={styles.dialogBackdrop}>
          <div className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby="delete-board-title">
            <span className={styles.dialogEyebrow}>Permanent action</span>
            <h2 id="delete-board-title">Delete “{board.title}”?</h2>
            <p>This removes the board for every collaborator. This action cannot be undone.</p>
            <div className={styles.dialogActions}>
              <button type="button" onClick={() => setConfirmDelete(false)}>Cancel</button>
              <button type="button" className={styles.destructive} onClick={handleDelete}>Delete board</button>
            </div>
          </div>
        </div>
      )}
      {shareOpen && <ShareDialog onClose={() => setShareOpen(false)} />}
    </main>
  );
};

export default EditorWorkspace;
