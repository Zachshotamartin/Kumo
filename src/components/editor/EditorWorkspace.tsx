import { lazy, Suspense, useEffect, useRef, useState } from "react";
import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";
import {
  CaretLeft,
  CaretRight,
  Broadcast,
  ChatCenteredText,
  ClockCounterClockwise,
  DotsThree,
  DiamondsFour,
  Globe,
  FlowArrow,
  Export,
  Code,
  GitBranch,
  Minus,
  Plus,
  ShareNetwork,
  Presentation,
  SignOut,
  Trash,
  X,
} from "@phosphor-icons/react";
import { useStatus, useSyncStatus } from "@liveblocks/react";
import {
  useBroadcastEvent,
  useMyPresence,
  useUnreadInboxNotificationsCount,
} from "@liveblocks/react/suspense";
import { useDispatch, useSelector } from "react-redux";
import { signOut } from "firebase/auth";
import { auth } from "../../config/firebase";
import { useEditorActions } from "../../editor/useEditorActions";
import { logout } from "../../features/auth/authSlice";
import { zoomAtPoint, ZOOM_STEP_FACTOR } from "../../editor/geometry";
import {
  setFollowingUserId,
  setPresentationMode,
  setRightPanel,
  setViewport,
} from "../../features/editor/editorSlice";
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
import CommandPalette from "./CommandPalette";

const CommentsPanel = lazy(() => import("../../comments/CommentsPanel").then((module) => ({ default: module.CommentsPanel })));
const VersionHistoryPanel = lazy(() => import("../../history/VersionHistoryPanel").then((module) => ({ default: module.VersionHistoryPanel })));
const DesignLibraryPanel = lazy(() => import("./DesignLibraryPanel"));
const PrototypePanel = lazy(() => import("./PrototypePanel"));
const PresentationView = lazy(() => import("./PresentationView"));
const ExportPanel = lazy(() => import("./ExportPanel"));
const InspectPanel = lazy(() => import("./InspectPanel"));
const BranchesPanel = lazy(() => import("./BranchesPanel"));

const emptyBoard = {
  shapes: [],
  id: null,
  roomId: null,
  baseRoomId: null,
  activeBranchId: null,
  activeBranchName: null,
  role: null,
  type: null,
  title: null,
  uid: null,
  sharedWith: [],
  members: {},
  linkedBoards: {},
  backGroundColor: "#252629",
  lastChangedBy: null,
  currentUsers: [],
  schemaVersion: 4,
  revision: 0,
  updatedAt: null,
};

type PanelSide = "layers" | "properties";

interface PanelResize {
  side: PanelSide;
  startX: number;
  startWidth: number;
}

const PANEL_LIMITS: Record<PanelSide, { min: number; max: number }> = {
  layers: { min: 168, max: 420 },
  properties: { min: 220, max: 480 },
};

const clampPanelWidth = (side: PanelSide, width: number) =>
  Math.min(PANEL_LIMITS[side].max, Math.max(PANEL_LIMITS[side].min, width));

const EditorWorkspace = () => {
  const dispatch = useDispatch<AppDispatch>();
  const board = useSelector((state: RootState) => state.whiteBoard);
  const user = useSelector((state: RootState) => state.auth);
  const editor = useSelector((state: RootState) => state.editor);
  const actions = useEditorActions();
  const syncStatus = useSyncStatus({ smooth: true });
  const connectionStatus = useStatus();
  const [myPresence, updateMyPresence] = useMyPresence();
  const broadcastEvent = useBroadcastEvent();
  const { count: unreadCommentCount } = useUnreadInboxNotificationsCount();
  const canvasRegionRef = useRef<HTMLElement>(null);
  const panelResizeRef = useRef<PanelResize | null>(null);
  const [title, setTitle] = useState(board.title ?? "Untitled board");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [layersWidth, setLayersWidth] = useState(236);
  const [propertiesWidth, setPropertiesWidth] = useState(268);
  const [layersCollapsed, setLayersCollapsed] = useState(
    () => typeof window !== "undefined" && window.innerWidth < 720
  );
  const [propertiesCollapsed, setPropertiesCollapsed] = useState(
    () => typeof window !== "undefined" && window.innerWidth < 960
  );
  const [resizingPanel, setResizingPanel] = useState<PanelSide | null>(null);

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      const resize = panelResizeRef.current;
      if (!resize) return;
      const direction = resize.side === "layers" ? 1 : -1;
      const width = clampPanelWidth(
        resize.side,
        resize.startWidth + (event.clientX - resize.startX) * direction
      );
      if (resize.side === "layers") setLayersWidth(width);
      else setPropertiesWidth(width);
    };
    const finishPanelResize = () => {
      panelResizeRef.current = null;
      setResizingPanel(null);
    };
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", finishPanelResize);
    window.addEventListener("pointercancel", finishPanelResize);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", finishPanelResize);
      window.removeEventListener("pointercancel", finishPanelResize);
    };
  }, []);

  const beginPanelResize = (
    side: PanelSide,
    event: ReactPointerEvent<HTMLElement>
  ) => {
    if (event.button !== 0) return;
    event.preventDefault();
    panelResizeRef.current = {
      side,
      startX: event.clientX,
      startWidth: side === "layers" ? layersWidth : propertiesWidth,
    };
    setResizingPanel(side);
  };

  const resizePanelFromKeyboard = (side: PanelSide, event: React.KeyboardEvent) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const screenDirection = event.key === "ArrowRight" ? 1 : -1;
    const widthDirection = side === "layers" ? screenDirection : -screenDirection;
    if (side === "layers") {
      setLayersWidth((width) => clampPanelWidth(side, width + widthDirection * 8));
    } else {
      setPropertiesWidth((width) => clampPanelWidth(side, width + widthDirection * 8));
    }
  };

  const goHome = () => {
    const url = new URL(window.location.href);
    url.searchParams.delete("board");
    window.history.replaceState({}, "", url);
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

  const toggleSpotlight = () => {
    if (!user.uid) return;
    const spotlight = !myPresence.spotlight;
    updateMyPresence({ spotlight });
    broadcastEvent({
      type: spotlight ? "SPOTLIGHT_START" : "SPOTLIGHT_STOP",
      presenterId: user.uid,
    });
  };
  const propertiesVisible = !propertiesCollapsed || editor.rightPanel !== "properties";

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
          {board.activeBranchName && <span className={styles.branchBadge}><GitBranch aria-hidden="true" />{board.activeBranchName}</span>}
        </div>
        <div className={styles.topbarEnd}>
          <CommandPalette />
          <span
            className={`${styles.saveStatus} ${editor.saveStatus === "error" || connectionStatus === "disconnected" ? styles.saveError : ""}`}
            role="status"
          >
            {connectionStatus === "reconnecting"
              ? "Reconnecting"
              : connectionStatus === "disconnected"
              ? "Offline"
              : connectionStatus === "connecting" || connectionStatus === "initial"
              ? "Connecting"
              : syncStatus === "synchronizing" || editor.saveStatus === "saving"
              ? "Saving"
              : editor.saveStatus === "error"
              ? "Save failed"
              : editor.saveStatus === "saved"
              ? "Saved"
              : "Ready"}
          </span>
          <div className={styles.presenceStack} aria-label={`${board.currentUsers.length + 1} people on this board`}>
            <span className={styles.selfPresence} title="You are here">{(user.email ?? "Y").slice(0, 1).toUpperCase()}</span>
            {board.currentUsers.slice(0, 3).map((presence) => (
              <button
                type="button"
                key={presence.uid}
                title={`Follow ${presence.label ?? "collaborator"}`}
                aria-label={`Follow ${presence.label ?? "collaborator"}`}
                onClick={() => dispatch(setFollowingUserId(presence.uid))}
              >
                {(presence.label ?? "C").slice(0, 1).toUpperCase()}
              </button>
            ))}
          </div>
          <button
            type="button"
            className={styles.secondaryTopbarButton}
            onClick={() => dispatch(setPresentationMode(true))}
          >
            <Presentation aria-hidden="true" />
            <span>Present</span>
          </button>
          <button
            type="button"
            className={`${styles.secondaryTopbarButton} ${myPresence.spotlight ? styles.activeTopbarButton : ""}`}
            aria-pressed={myPresence.spotlight}
            onClick={toggleSpotlight}
          >
            <Broadcast aria-hidden="true" />
            <span>{myPresence.spotlight ? "Stop spotlight" : "Spotlight"}</span>
          </button>
          <button
            type="button"
            className={styles.secondaryTopbarButton}
            onClick={() => dispatch(setRightPanel("comments"))}
          >
            <ChatCenteredText aria-hidden="true" />
            <span>Comments</span>
            {unreadCommentCount > 0 && <b className={styles.notificationBadge}>{unreadCommentCount}</b>}
          </button>
          <button
            type="button"
            className={`${styles.secondaryTopbarButton} ${editor.rightPanel === "assets" ? styles.activeTopbarButton : ""}`}
            onClick={() => dispatch(setRightPanel("assets"))}
          >
            <DiamondsFour aria-hidden="true" />
            <span>Assets</span>
          </button>
          <button
            type="button"
            className={`${styles.secondaryTopbarButton} ${editor.rightPanel === "prototype" ? styles.activeTopbarButton : ""}`}
            onClick={() => dispatch(setRightPanel("prototype"))}
          >
            <FlowArrow aria-hidden="true" />
            <span>Prototype</span>
          </button>
          <button
            type="button"
            className={`${styles.secondaryTopbarButton} ${editor.rightPanel === "export" ? styles.activeTopbarButton : ""}`}
            onClick={() => dispatch(setRightPanel("export"))}
          >
            <Export aria-hidden="true" />
            <span>Export</span>
          </button>
          <button
            type="button"
            className={`${styles.secondaryTopbarButton} ${editor.rightPanel === "inspect" ? styles.activeTopbarButton : ""}`}
            onClick={() => dispatch(setRightPanel("inspect"))}
          >
            <Code aria-hidden="true" />
            <span>Inspect</span>
          </button>
          <button
            type="button"
            className={`${styles.secondaryTopbarButton} ${editor.rightPanel === "branches" ? styles.activeTopbarButton : ""}`}
            onClick={() => dispatch(setRightPanel("branches"))}
          >
            <GitBranch aria-hidden="true" />
            <span>Branches</span>
          </button>
          <button type="button" className={styles.shareButton} onClick={() => setShareOpen(true)}>
            <ShareNetwork aria-hidden="true" />
            <span>Share</span>
          </button>
          <button type="button" className={styles.menuButton} aria-label="Board menu" aria-expanded={menuOpen} onClick={() => setMenuOpen((value) => !value)}><DotsThree aria-hidden="true" weight="bold" /></button>
          {menuOpen && (
            <div className={styles.boardMenu} role="menu">
              <button type="button" role="menuitem" onClick={() => actions.commitBoardPatch({ type: board.type === "public" ? "private" : "public" })} disabled={board.role !== "owner"}>
                <Globe aria-hidden="true" /> <span>Make {board.type === "public" ? "private" : "public"}</span>
              </button>
              <button type="button" role="menuitem" onClick={() => { dispatch(setRightPanel("history")); setMenuOpen(false); }}>
                <ClockCounterClockwise aria-hidden="true" /> <span>Version history</span>
              </button>
              <button type="button" role="menuitem" onClick={() => setConfirmDelete(true)} disabled={board.role !== "owner"}>
                <Trash aria-hidden="true" /> <span>Delete board</span>
              </button>
              <button type="button" role="menuitem" onClick={handleLogout}><SignOut aria-hidden="true" /> <span>Sign out</span></button>
            </div>
          )}
        </div>
      </header>

      <div
        className={`${styles.editorGrid} ${resizingPanel ? styles.resizingPanels : ""}`}
        data-testid="editor-grid"
        style={{
          "--layers-panel-width": layersCollapsed ? "0px" : `${layersWidth}px`,
          "--layers-resizer-width": layersCollapsed ? "0px" : "6px",
          "--properties-panel-width": propertiesVisible ? `${propertiesWidth}px` : "0px",
          "--properties-resizer-width": propertiesVisible ? "6px" : "0px",
        } as CSSProperties}
      >
        <div className={styles.panelSlot}>{!layersCollapsed && <LayersPanel />}</div>
        <div
          className={styles.panelResizer}
          role="slider"
          aria-label="Resize layers panel"
          aria-orientation="horizontal"
          aria-valuemin={PANEL_LIMITS.layers.min}
          aria-valuemax={PANEL_LIMITS.layers.max}
          aria-valuenow={layersWidth}
          tabIndex={layersCollapsed ? -1 : 0}
          onPointerDown={(event) => beginPanelResize("layers", event)}
          onKeyDown={(event) => resizePanelFromKeyboard("layers", event)}
          onDoubleClick={() => setLayersWidth(236)}
        />
        <section ref={canvasRegionRef} className={styles.canvasRegion} aria-label="Design editor">
          <EditorCanvas />
          <EditorToolbar />
          <button
            type="button"
            className={`${styles.panelToggle} ${styles.layersToggle}`}
            aria-label={`${layersCollapsed ? "Show" : "Hide"} layers panel`}
            aria-expanded={!layersCollapsed}
            onClick={() => setLayersCollapsed((collapsed) => !collapsed)}
          >
            {layersCollapsed ? <CaretRight aria-hidden="true" /> : <CaretLeft aria-hidden="true" />}
          </button>
          <button
            type="button"
            className={`${styles.panelToggle} ${styles.propertiesToggle}`}
            aria-label={`${propertiesVisible ? "Hide" : "Show"} properties panel`}
            aria-expanded={propertiesVisible}
            onClick={() => {
              if (editor.rightPanel !== "properties") {
                dispatch(setRightPanel("properties"));
                setPropertiesCollapsed(true);
              } else {
                setPropertiesCollapsed((collapsed) => !collapsed);
              }
            }}
          >
            {propertiesVisible ? <CaretRight aria-hidden="true" /> : <CaretLeft aria-hidden="true" />}
          </button>
          <div className={styles.zoomControl} aria-label="Zoom controls">
            <button type="button" aria-label="Zoom out" onClick={() => setZoomAroundCanvasCenter(editor.viewport.zoom / ZOOM_STEP_FACTOR)}><Minus aria-hidden="true" /></button>
            <button
              type="button"
              className={styles.zoomValue}
              aria-label={`Reset zoom (${Math.round(editor.viewport.zoom * 100)}%)`}
              onClick={() => setZoomAroundCanvasCenter(1)}
            >
              {Math.round(editor.viewport.zoom * 100)}%
            </button>
            <button type="button" aria-label="Zoom in" onClick={() => setZoomAroundCanvasCenter(editor.viewport.zoom * ZOOM_STEP_FACTOR)}><Plus aria-hidden="true" /></button>
          </div>
        </section>
        <div
          className={styles.panelResizer}
          role="slider"
          aria-label="Resize properties panel"
          aria-orientation="horizontal"
          aria-valuemin={PANEL_LIMITS.properties.min}
          aria-valuemax={PANEL_LIMITS.properties.max}
          aria-valuenow={propertiesWidth}
          tabIndex={propertiesVisible ? 0 : -1}
          onPointerDown={(event) => beginPanelResize("properties", event)}
          onKeyDown={(event) => resizePanelFromKeyboard("properties", event)}
          onDoubleClick={() => setPropertiesWidth(268)}
        />
        <div className={styles.panelSlot}>
          {propertiesVisible && (
            <Suspense fallback={<div className={styles.panelLoading} role="status">Loading panel</div>}>
              {editor.rightPanel === "comments"
                ? <CommentsPanel />
                : editor.rightPanel === "history"
                  ? <VersionHistoryPanel key={`${board.id ?? "board"}:${board.activeBranchId ?? "main"}`} />
                  : editor.rightPanel === "assets"
                    ? <DesignLibraryPanel />
                    : editor.rightPanel === "prototype"
                      ? <PrototypePanel />
                      : editor.rightPanel === "export"
                        ? <ExportPanel />
                        : editor.rightPanel === "inspect"
                          ? <InspectPanel />
                          : editor.rightPanel === "branches"
                            ? <BranchesPanel />
                            : <InspectorPanel />}
            </Suspense>
          )}
        </div>
      </div>

      {editor.followingUserId && (
        <div className={styles.followBanner} role="status">
          <span>Following {board.currentUsers.find((person) => person.uid === editor.followingUserId)?.label ?? "presenter"}</span>
          <button type="button" onClick={() => dispatch(setFollowingUserId(null))}>Stop following</button>
        </div>
      )}

      {(error || editor.saveError) && (
        <div className={styles.errorToast} role="alert">
          <span>{error ?? editor.saveError}</span>
          <button type="button" aria-label="Dismiss error" onClick={() => setError(null)}><X aria-hidden="true" /></button>
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
      {editor.presentationMode && <Suspense fallback={null}><PresentationView /></Suspense>}
    </main>
  );
};

export default EditorWorkspace;
