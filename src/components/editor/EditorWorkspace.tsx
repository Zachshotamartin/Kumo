import { useEffect, useRef, useState } from "react";
import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";
import {
  CaretLeft,
  CaretRight,
  Broadcast,
  BezierCurve,
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
  Toolbox,
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
import { shapeBounds, zoomAtPoint, ZOOM_STEP_FACTOR } from "../../editor/geometry";
import {
  setFollowingUserId,
  setPresentationMode,
  setRightPanel,
  setSaveStatus,
  setViewport,
} from "../../features/editor/editorSlice";
import { clearSelectedShapes, setSelectedShapes } from "../../features/selected/selectedSlice";
import { setWhiteboardData } from "../../features/whiteBoard/whiteBoardSlice";
import { deleteBoard } from "../../services/boardRepository";
import { AppDispatch, RootState } from "../../store";
import EditorCanvas from "./EditorCanvas";
import EditorMinimap from "./EditorMinimap";
import EditorToolbar from "./EditorToolbar";
import InspectorPanel from "./InspectorPanel";
import LayersPanel from "./LayersPanel";
import styles from "./EditorWorkspace.module.css";
import KumoLogo from "../brand/KumoLogo";
import ShareDialog from "./ShareDialog";
import CommandPalette from "./CommandPalette";
import ui from "../ui/Ui.module.css";
import { OfflineRecoveryBridge } from "../../collaboration/OfflineRecoveryBridge";
import { loadProductGraph, type ProductGraph } from "../../services/productRepository";
import { listDesignBranches } from "../../services/branchRepository";
import { BoardNavigation } from "./BoardNavigation";
import { CommentsPanel } from "../../comments/CommentsPanel";
import { VersionHistoryPanel } from "../../history/VersionHistoryPanel";
import DesignLibraryPanel from "./DesignLibraryPanel";
import PrototypePanel from "./PrototypePanel";
import PresentationView from "./PresentationView";
import ExportPanel from "./ExportPanel";
import InspectPanel from "./InspectPanel";
import BranchesPanel from "./BranchesPanel";
import ProductPanel from "./ProductPanel";
import AdvancedStudioPanel from "./AdvancedStudioPanel";

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
  const boardMenuRef = useRef<HTMLDivElement>(null);
  const boardMenuButtonRef = useRef<HTMLButtonElement>(null);
  const [title, setTitle] = useState(board.title ?? "Untitled board");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteGraph, setDeleteGraph] = useState<ProductGraph | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(() => new URL(window.location.href).searchParams.get("shareDialog") === "1");
  const [error, setError] = useState<string | null>(null);
  const [layersWidth, setLayersWidth] = useState(236);
  const [propertiesWidth, setPropertiesWidth] = useState(268);
  const [layersCollapsed, setLayersCollapsed] = useState(
    () => window.innerWidth < 720
  );
  const [propertiesCollapsed, setPropertiesCollapsed] = useState(
    () => window.innerWidth < 960
  );
  const [resizingPanel, setResizingPanel] = useState<PanelSide | null>(null);
  const deepLinkHandledRef = useRef<string | null>(null);
  const branchLinkHandledRef = useRef<string | null>(null);

  useEffect(() => {
    if (!board.id) return;
    const url = new URL(window.location.href);
    const branchId = url.searchParams.get("branch");
    if (!branchId) return;
    const linkKey = `${board.id}:${branchId}`;
    if (branchLinkHandledRef.current === linkKey) return;
    if (board.activeBranchId === branchId) {
      branchLinkHandledRef.current = linkKey;
      return;
    }
    let active = true;
    void listDesignBranches(board.id).then((branches) => {
      if (!active) return;
      const branch = branches.find((candidate) => candidate.id === branchId && candidate.status === "open");
      if (!branch) {
        url.searchParams.delete("branch");
        window.history.replaceState({}, "", url);
        setError("This branch is no longer available.");
        branchLinkHandledRef.current = linkKey;
        return;
      }
      branchLinkHandledRef.current = linkKey;
      dispatch(setWhiteboardData({
        roomId: branch.room_id,
        baseRoomId: board.baseRoomId ?? board.roomId ?? `board:${board.id}`,
        activeBranchId: branch.id,
        activeBranchName: branch.name,
        revision: board.revision + 1,
        shapes: [],
      }));
    }).catch((caught) => {
      if (active) setError(caught instanceof Error ? caught.message : "This branch could not be opened.");
    });
    return () => { active = false; };
  }, [board.activeBranchId, board.baseRoomId, board.id, board.revision, board.roomId, dispatch]);

  useEffect(() => {
    if (!board.id) return;
    const url = new URL(window.location.href);
    const selectionId = url.searchParams.get("selection");
    const linkKey = `${board.id}:${selectionId ?? ""}`;
    if (!selectionId || deepLinkHandledRef.current === linkKey) return;
    const selected = board.shapes.find((shape) => shape.id === selectionId);
    if (!selected) return;
    deepLinkHandledRef.current = linkKey;
    const bounds = shapeBounds(selected);
    dispatch(setSelectedShapes([selected.id]));
    dispatch(setViewport({ x: bounds.x + bounds.width / 2 - 500 / editor.viewport.zoom, y: bounds.y + bounds.height / 2 - 350 / editor.viewport.zoom, zoom: editor.viewport.zoom }));
  }, [board.id, board.shapes, dispatch, editor.viewport.zoom]);

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

  useEffect(() => {
    if (!menuOpen) return;
    const closeOutside = (event: PointerEvent) => {
      if (!boardMenuRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    const closeWithKeyboard = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setMenuOpen(false);
      boardMenuButtonRef.current?.focus();
    };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeWithKeyboard);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeWithKeyboard);
    };
  }, [menuOpen]);

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
    window.history.pushState({}, "", url);
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
    try {
      await signOut(auth);
      dispatch(logout());
      dispatch(setWhiteboardData(emptyBoard));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "We couldn't sign you out.");
    }
  };

  const setZoomAroundCanvasCenter = (nextZoom: number) => {
    const rect = canvasRegionRef.current!.getBoundingClientRect();
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
  const dismissError = () => {
    setError(null);
    if (editor.saveError) dispatch(setSaveStatus({ status: "idle", error: null }));
  };
  const propertiesVisible = !propertiesCollapsed || editor.rightPanel !== "properties";

  return (
    <main className={styles.workspace}>
      <OfflineRecoveryBridge connectionStatus={connectionStatus} />
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
          <BoardNavigation />
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
          <button
            type="button"
            className={`${styles.secondaryTopbarButton} ${editor.rightPanel === "studio" ? styles.activeTopbarButton : ""}`}
            onClick={() => dispatch(setRightPanel("studio"))}
          >
            <BezierCurve aria-hidden="true" />
            <span>Studio</span>
          </button>
          <button
            type="button"
            className={`${styles.secondaryTopbarButton} ${editor.rightPanel === "platform" ? styles.activeTopbarButton : ""}`}
            onClick={() => dispatch(setRightPanel("platform"))}
          >
            <Toolbox aria-hidden="true" />
            <span>Tools</span>
          </button>
          <button type="button" className={`${styles.secondaryTopbarButton} ${styles.primaryTopbarButton}`} onClick={() => setShareOpen(true)}>
            <ShareNetwork aria-hidden="true" />
            <span>Share</span>
          </button>
          <div className={styles.boardMenuAnchor} ref={boardMenuRef}>
            <button ref={boardMenuButtonRef} type="button" className={styles.menuButton} aria-label="Board menu" aria-haspopup="menu" aria-expanded={menuOpen} onClick={() => setMenuOpen((value) => !value)}><DotsThree aria-hidden="true" weight="bold" /></button>
            {menuOpen && (
              <div className={styles.boardMenu} role="menu">
                <button type="button" role="menuitem" onClick={() => { actions.commitBoardPatch({ type: board.type === "public" ? "private" : "public" }); setMenuOpen(false); }} disabled={board.role !== "owner"}>
                  <Globe aria-hidden="true" /> <span>Make {board.type === "public" ? "private" : "public"}</span>
                </button>
                <button type="button" role="menuitem" onClick={() => { dispatch(setRightPanel("history")); setMenuOpen(false); }}>
                  <ClockCounterClockwise aria-hidden="true" /> <span>Version history</span>
                </button>
                <button type="button" role="menuitem" onClick={() => { setConfirmDelete(true); setMenuOpen(false); if (board.id) void loadProductGraph(board.id).then(setDeleteGraph).catch(() => setDeleteGraph(null)); }} disabled={board.role !== "owner"}>
                  <Trash aria-hidden="true" /> <span>Delete board</span>
                </button>
                <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); void handleLogout(); }}><SignOut aria-hidden="true" /> <span>Sign out</span></button>
              </div>
            )}
          </div>
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
          <EditorMinimap />
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
            <>
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
                            : editor.rightPanel === "platform"
                              ? <ProductPanel />
                              : editor.rightPanel === "studio"
                                ? <AdvancedStudioPanel />
                            : <InspectorPanel />}
            </>
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
        <div className={`${ui.notice} ${ui.noticeError} ${styles.errorToast}`} role="alert">
          <span>{error ?? editor.saveError}</span>
          <button type="button" aria-label="Dismiss error" onClick={dismissError}><X aria-hidden="true" /></button>
        </div>
      )}

      {confirmDelete && (
        <div className={styles.dialogBackdrop} onPointerDown={(event) => event.target === event.currentTarget && setConfirmDelete(false)}>
          <div className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby="delete-board-title">
            <span className={styles.dialogEyebrow}>30-day recovery</span>
            <h2 id="delete-board-title">Delete “{board.title}”?</h2>
            <p>This removes the board for every collaborator. You can restore it from Dashboard → Trash for 30 days; after that Kumo permanently purges its canvas, comments, and assets.</p>
            {deleteGraph && <p className={styles.deleteImpact}>{deleteGraph.incoming.length ? `${deleteGraph.incoming.length} incoming board ${deleteGraph.incoming.length === 1 ? "link will" : "links will"} become broken.` : "No other board links to this board."} {deleteGraph.edges.filter((edge) => edge.sourceId === board.id).length ? `${deleteGraph.edges.filter((edge) => edge.sourceId === board.id).length} outgoing links will be removed.` : ""}</p>}
            <div className={styles.dialogActions}>
              <button type="button" className={ui.button} onClick={() => setConfirmDelete(false)}>Cancel</button>
              <button type="button" className={`${ui.button} ${ui.buttonDanger} ${styles.destructive}`} onClick={handleDelete}>Delete board</button>
            </div>
          </div>
        </div>
      )}
      {shareOpen && <ShareDialog onClose={() => { setShareOpen(false); const url = new URL(window.location.href); url.searchParams.delete("shareDialog"); window.history.replaceState({}, "", url); }} />}
      {editor.presentationMode && <PresentationView />}
    </main>
  );
};

export default EditorWorkspace;
