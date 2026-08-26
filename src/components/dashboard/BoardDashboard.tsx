import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Graph,
  Bell,
  Compass,
  Folder,
  Gear,
  Package,
  MagnifyingGlass,
  Plus,
  SignOut,
  UserCircle,
  UsersThree,
} from "@phosphor-icons/react";
import { useDispatch, useSelector } from "react-redux";
import { signOut } from "firebase/auth";
import KumoLogo from "../brand/KumoLogo";
import { auth } from "../../config/firebase";
import { logout } from "../../features/auth/authSlice";
import { clearSelectedShapes } from "../../features/selected/selectedSlice";
import { setWhiteboardData } from "../../features/whiteBoard/whiteBoardSlice";
import {
  BoardSummary,
  createBoard,
  createOnboardingBoard,
  deleteBoard,
  duplicateBoard,
  getBoard,
  listBoards,
  listDeletedBoards,
  restoreDeletedBoard,
  searchPublicBoards,
  updateBoardSettings,
} from "../../services/boardRepository";
import { AppDispatch, RootState } from "../../store";
import { listFriendships } from "../../services/socialRepository";
import { FriendsView } from "../social/FriendsView";
import { ProfileAvatar } from "../social/ProfileAvatar";
import { ProfileView } from "../social/ProfileView";
import { BoardCard } from "./BoardCard";
import styles from "./BoardDashboard.module.css";
import ui from "../ui/Ui.module.css";
import { WorkspaceAdminView } from "./WorkspaceAdminView";
import { SettingsView } from "./SettingsView";
import { CommunityView } from "./CommunityView";
import { acceptBoardInvitation } from "../../services/collaboratorRepository";
import { acceptWorkspaceInvitation, globalSearch, loadNotificationPreferences, type GlobalSearchResult } from "../../services/platformRepository";
import { deliverBrowserNotifications } from "../../platform/browserNotifications";
import { recentBoardVisits, recordBoardVisit } from "../../platform/recentBoards";
import {
  createFolder,
  instantiateTemplate,
  loadNotificationInbox,
  loadTemplates,
  loadWorkspaceOverview,
  markNotificationRead,
  organizeBoard,
  redeemShareLink,
  saveBoardView,
  renameBoardView,
  deleteBoardView,
  reorderBoardViews,
  requestBoardAccess,
  setBoardNotificationMuted,
  updateNotificationState,
  type AccountNotification,
  type BoardOrganization,
  type BoardTemplateSummary,
  type WorkspaceFolder,
} from "../../services/productRepository";
import { dashboardRouteFromUrl } from "./dashboardRouting";
import { orderWorkspaceFolders } from "./dashboardFolders";

type DashboardView = "boards" | "friends" | "profile" | "inbox" | "templates" | "workspace" | "community" | "settings";
type BoardSort = "updated" | "title";
type BoardDensity = "comfortable" | "compact";
interface SavedBoardView { id: string; name: string; filter: "active" | "favorites" | "archived" | "trash"; sort: BoardSort; density: BoardDensity }

const caughtMessage = (caught: unknown, fallback: string) => caught instanceof Error ? caught.message : fallback;
const persistDashboardPreference = (key: string, value: string) => {
  try { localStorage.setItem(key, value); }
  catch { /* Browser privacy settings can disable persistent preferences. */ }
};

const savedBoardViews = (): SavedBoardView[] => {
  try {
    const parsed = JSON.parse(localStorage.getItem("kumo:saved-board-views") ?? "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is SavedBoardView => Boolean(item) && typeof item === "object"
      && typeof item.id === "string" && typeof item.name === "string"
      && ["active", "favorites", "archived", "trash"].includes(item.filter)
      && ["updated", "title"].includes(item.sort)
      && ["comfortable", "compact"].includes(item.density)).slice(-12);
  }
  catch { return []; }
};

const readDashboardPreference = (key: string) => {
  try { return localStorage.getItem(key); }
  catch { return null; }
};
const storedBoardSort = (): BoardSort => readDashboardPreference("kumo:board-sort") === "title" ? "title" : "updated";
const storedBoardDensity = (): BoardDensity => readDashboardPreference("kumo:board-density") === "compact" ? "compact" : "comfortable";
const folderDepth = (folder: WorkspaceFolder, folders: WorkspaceFolder[]) => {
  let depth = 0;
  let parentId = folder.parent_id;
  const visited = new Set<string>([folder.id]);
  while (parentId && depth < 8 && !visited.has(parentId)) {
    visited.add(parentId);
    depth += 1;
    parentId = folders.find((candidate) => candidate.id === parentId)?.parent_id ?? null;
  }
  return depth;
};

const routeFromLocation = () => dashboardRouteFromUrl(window.location.href);

const BoardDashboard = () => {
  const dispatch = useDispatch<AppDispatch>();
  const user = useSelector((state: RootState) => state.auth);
  const [boards, setBoards] = useState<BoardSummary[]>([]);
  const [deletedBoards, setDeletedBoards] = useState<BoardSummary[]>([]);
  const [publicBoards, setPublicBoards] = useState<BoardSummary[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [initialRoute] = useState(routeFromLocation);
  const [view, setView] = useState<DashboardView>(initialRoute.view);
  const [profileUsername, setProfileUsername] = useState<string | null>(initialRoute.profile);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(initialRoute.template);
  const [selectedCommunitySlug, setSelectedCommunitySlug] = useState<string | null>(initialRoute.community);
  const [incomingCount, setIncomingCount] = useState(0);
  const [notifications, setNotifications] = useState<AccountNotification[]>([]);
  const [mutedBoardIds, setMutedBoardIds] = useState<Set<string>>(() => new Set());
  const [inboxFilter, setInboxFilter] = useState<"all" | "unread" | "archived">("all");
  const [browserNotificationsEnabled, setBrowserNotificationsEnabled] = useState(false);
  const [templates, setTemplates] = useState<BoardTemplateSummary[]>([]);
  const [folders, setFolders] = useState<WorkspaceFolder[]>([]);
  const [organization, setOrganization] = useState<BoardOrganization[]>([]);
  const [boardFilter, setBoardFilter] = useState<"active" | "favorites" | "archived" | "trash">("active");
  const [boardSort, setBoardSort] = useState<BoardSort>(storedBoardSort);
  const [boardDensity, setBoardDensity] = useState<BoardDensity>(storedBoardDensity);
  const [savedViews, setSavedViews] = useState<SavedBoardView[]>(savedBoardViews);
  const [savedViewName, setSavedViewName] = useState("");
  const [selectedSavedViewId, setSelectedSavedViewId] = useState("");
  const [selectedBoardIds, setSelectedBoardIds] = useState<Set<string>>(() => new Set());
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [folderName, setFolderName] = useState("");
  const [requestedBoardId, setRequestedBoardId] = useState<string | null>(null);
  const [globalResults, setGlobalResults] = useState<GlobalSearchResult[]>([]);
  const [recentVisits, setRecentVisits] = useState(() => recentBoardVisits(user.uid));
  const directLinkHandledRef = useRef(false);

  const openBoard = useCallback(async (boardId: string) => {
    setError(null);
    try {
      const board = await getBoard(boardId);
      const url = new URL(window.location.href);
      url.searchParams.set("board", boardId);
      if (new URL(window.location.href).searchParams.get("board") !== boardId) window.history.pushState({}, "", url);
      dispatch(clearSelectedShapes());
      dispatch(setWhiteboardData(board));
      setRecentVisits(recordBoardVisit(user.uid, boardId));
    } catch (caught) {
      setError(caughtMessage(caught, "We couldn't open this board."));
      setRequestedBoardId(boardId);
    }
  }, [dispatch, user.uid]);

  const applyDashboardRoute = useCallback((href: string) => {
    const route = dashboardRouteFromUrl(href);
    setView(route.view);
    setProfileUsername(route.profile);
    setSelectedTemplateId(route.template);
    setSelectedCommunitySlug(route.community);
  }, []);

  const navigateToUrl = useCallback((href: string) => {
    const target = new URL(href, window.location.origin);
    const boardId = target.searchParams.get("board");
    window.history.pushState({}, "", target);
    if (boardId) void openBoard(boardId);
    else applyDashboardRoute(target.href);
  }, [applyDashboardRoute, openBoard]);

  const activateNotification = useCallback((notification: AccountNotification) => {
    void markNotificationRead(notification.id).then(() => {
      setNotifications((current) => current.map((item) => item.id === notification.id ? { ...item, read_at: new Date().toISOString() } : item));
    }).catch((caught) => setError(caughtMessage(caught, "The notification could not be marked read.")));
    if (!notification.action_url) return;
    navigateToUrl(notification.action_url);
  }, [navigateToUrl]);

  useEffect(() => {
    const handlePopState = () => applyDashboardRoute(window.location.href);
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [applyDashboardRoute]);

  useEffect(() => {
    if (!user.uid) return;
    let active = true;
    void Promise.all([listBoards(), listDeletedBoards()])
      .then(([nextBoards, nextDeletedBoards]) => {
        if (!active) return;
        setBoards(nextBoards);
        setDeletedBoards(nextDeletedBoards);
        setLoading(false);
      })
      .catch(() => {
        if (!active) return;
        setError("We couldn't load your boards.");
        setLoading(false);
      });
    return () => { active = false; };
  }, [user.uid]);

  useEffect(() => {
    if (!user.uid) return;
    let active = true;
    void Promise.all([loadWorkspaceOverview(), loadNotificationInbox(), loadTemplates(), loadNotificationPreferences()]).then(([workspace, inbox, nextTemplates, preferences]) => {
      if (!active) return;
      setFolders(workspace.folders);
      setOrganization(workspace.organization);
      setNotifications(inbox.notifications);
      setMutedBoardIds(new Set(inbox.mutedBoardIds));
      setTemplates(nextTemplates);
      setBrowserNotificationsEnabled(preferences.browser_enabled);
      const synchronizedViews = workspace.savedViews ?? [];
      setSavedViews(synchronizedViews);
      localStorage.setItem("kumo:saved-board-views", JSON.stringify(synchronizedViews));
    }).catch(() => { if (active) setError("Some workspace data could not be loaded. Refresh to retry folders, templates, and notifications."); });
    return () => { active = false; };
  }, [user.uid]);

  useEffect(() => {
    if (!user.uid || !browserNotificationsEnabled) return;
    const refresh = () => {
      if (document.visibilityState === "hidden") return;
      void loadNotificationInbox().then((inbox) => { setNotifications(inbox.notifications); setMutedBoardIds(new Set(inbox.mutedBoardIds)); }).catch(() => undefined);
    };
    const interval = window.setInterval(refresh, 30_000);
    document.addEventListener("visibilitychange", refresh);
    return () => { window.clearInterval(interval); document.removeEventListener("visibilitychange", refresh); };
  }, [browserNotificationsEnabled, user.uid]);

  useEffect(() => {
    if (!browserNotificationsEnabled) return;
    deliverBrowserNotifications(notifications.filter((notification) => !notification.archived_at), activateNotification);
  }, [activateNotification, browserNotificationsEnabled, notifications]);

  useEffect(() => {
    if (!user.uid) return;
    const token = new URL(window.location.href).searchParams.get("share");
    if (!token) return;
    void redeemShareLink(token).then(({ boardId }) => {
      const url = new URL(window.location.href);
      url.searchParams.delete("share");
      window.history.replaceState({}, "", url);
      return openBoard(boardId);
    }).catch((caught) => setError(caughtMessage(caught, "This share link could not be opened.")));
  }, [openBoard, user.uid]);

  useEffect(() => {
    if (!user.uid || directLinkHandledRef.current) return;
    directLinkHandledRef.current = true;
    const boardId = new URL(window.location.href).searchParams.get("board");
    if (!boardId) return;
    const timeout = window.setTimeout(() => void openBoard(boardId), 0);
    return () => window.clearTimeout(timeout);
  }, [openBoard, user.uid]);

  useEffect(() => {
    const normalized = query.trim();
    if (!normalized) return;
    let active = true;
    const timeout = window.setTimeout(() => {
      void Promise.all([searchPublicBoards(normalized), globalSearch(normalized)])
        .then(([results, everything]) => { if (active) { setPublicBoards(results); setGlobalResults(everything); } })
        .catch(() => { if (active) { setPublicBoards([]); setGlobalResults([]); } });
    }, 250);
    return () => {
      active = false;
      window.clearTimeout(timeout);
    };
  }, [query]);

  useEffect(() => {
    if (!user.uid) return;
    const url = new URL(window.location.href);
    const invitation = url.searchParams.get("invite");
    const workspaceInvitation = url.searchParams.get("workspaceInvite");
    if (invitation) void acceptBoardInvitation(invitation).then(({ boardId }) => { url.searchParams.delete("invite"); window.history.replaceState({}, "", url); return openBoard(boardId); }).catch((caught) => setError(caughtMessage(caught, "Invitation could not be accepted.")));
    if (workspaceInvitation) void acceptWorkspaceInvitation(workspaceInvitation).then(() => { url.searchParams.delete("workspaceInvite"); window.history.replaceState({}, "", url); setView("workspace"); }).catch((caught) => setError(caughtMessage(caught, "Workspace invitation could not be accepted.")));
  }, [openBoard, user.uid]);

  const refreshIncomingCount = useCallback(() => {
    void listFriendships()
      .then((overview) => setIncomingCount(overview.incoming.length))
      .catch(() => setIncomingCount(0));
  }, []);

  useEffect(() => {
    if (user.uid) refreshIncomingCount();
  }, [refreshIncomingCount, user.uid]);

  const showBoards = () => {
    const url = new URL(window.location.href);
    url.search = "";
    url.searchParams.set("view", "boards");
    window.history.pushState({}, "", url);
    setProfileUsername(null);
    setSelectedTemplateId(null);
    setSelectedCommunitySlug(null);
    setView("boards");
  };

  const showFriends = () => {
    const url = new URL(window.location.href);
    url.search = "";
    url.searchParams.set("view", "friends");
    window.history.pushState({}, "", url);
    setProfileUsername(null);
    setSelectedTemplateId(null);
    setSelectedCommunitySlug(null);
    setView("friends");
  };

  const showProfile = (username?: string | null) => {
    const url = new URL(window.location.href);
    url.search = "";
    if (username) url.searchParams.set("profile", username);
    else url.searchParams.set("view", "profile");
    window.history.pushState({}, "", url);
    setProfileUsername(username ?? null);
    setSelectedTemplateId(null);
    setSelectedCommunitySlug(null);
    setView("profile");
  };

  const showSimpleView = (next: "inbox" | "templates" | "workspace" | "community" | "settings") => {
    const url = new URL(window.location.href);
    url.search = "";
    url.searchParams.set("view", next);
    window.history.pushState({}, "", url);
    setProfileUsername(null);
    setSelectedTemplateId(null);
    setSelectedCommunitySlug(null);
    setView(next);
  };

  const orderedFolders = useMemo(() => orderWorkspaceFolders(folders), [folders]);
  const selectedFolderIds = useMemo(() => {
    if (!selectedFolderId) return null;
    const included = new Set([selectedFolderId]);
    let changed = true;
    while (changed) {
      changed = false;
      folders.forEach((folder) => {
        if (folder.parent_id && included.has(folder.parent_id) && !included.has(folder.id)) {
          included.add(folder.id);
          changed = true;
        }
      });
    }
    return included;
  }, [folders, selectedFolderId]);

  const availableBoards = boardFilter === "trash" ? [...boards, ...deletedBoards] : boards;
  const visibleBoards = availableBoards.filter((board) => {
    if (board.deletedAt) return boardFilter === "trash";
    const state = organization.find((item) => item.board_id === board.id);
    const inSelectedFolder = !selectedFolderIds || Boolean(state?.folder_id && selectedFolderIds.has(state.folder_id));
    if (!inSelectedFolder) return false;
    if (boardFilter === "favorites") return state?.favorite && !state.trashed_at;
    if (boardFilter === "archived") return Boolean(state?.archived_at) && !state?.trashed_at;
    if (boardFilter === "trash") return Boolean(state?.trashed_at);
    return !state?.archived_at && !state?.trashed_at;
  }).sort((left, right) => boardSort === "title"
    ? left.title.localeCompare(right.title)
    : (right.updatedAt ?? 0) - (left.updatedAt ?? 0));
  const myBoards = visibleBoards.filter((board) => board.ownerId === user.uid);
  const sharedBoards = visibleBoards.filter((board) => board.ownerId !== user.uid);
  const recentBoards = useMemo(() => {
    const byId = new Map(boards.map((board) => [board.id, board]));
    return recentVisits.flatMap((visit) => {
      const board = byId.get(visit.boardId);
      return board ? [board] : [];
    }).slice(0, 4);
  }, [boards, recentVisits]);
  const publicResults = publicBoards;
  const visibleNotifications = notifications.filter((notification) => inboxFilter === "archived"
    ? Boolean(notification.archived_at)
    : inboxFilter === "unread"
      ? !notification.read_at && !notification.archived_at
      : !notification.archived_at);

  const mutateNotification = (notification: AccountNotification, patch: { read?: boolean; archived?: boolean }) => {
    void updateNotificationState(notification.id, patch).then(() => setNotifications((current) => current.map((item) => item.id === notification.id ? {
      ...item,
      ...(patch.read !== undefined ? { read_at: patch.read ? new Date().toISOString() : null } : {}),
      ...(patch.archived !== undefined ? { archived_at: patch.archived ? new Date().toISOString() : null } : {}),
    } : item))).catch((caught) => setError(caughtMessage(caught, "The notification could not be updated.")));
  };

  const toggleBoardMute = (boardId: string) => {
    const muted = !mutedBoardIds.has(boardId);
    void setBoardNotificationMuted(boardId, muted).then(() => setMutedBoardIds((current) => {
      const next = new Set(current);
      if (muted) next.add(boardId); else next.delete(boardId);
      return next;
    })).catch((caught) => setError(caughtMessage(caught, "Board notification settings could not be updated.")));
  };

  const applyOrganization = (boardId: string, action: "move-board" | "favorite-board" | "archive-board" | "trash-board" | "restore-board", payload?: Record<string, unknown>) => organizeBoard(action, boardId, payload).then(({ organization: next }) => {
    setOrganization((current) => [...current.filter((item) => item.board_id !== boardId), next]);
    return next;
  });

  const bulkOrganize = (action: "move-board" | "favorite-board" | "archive-board" | "trash-board", payload?: Record<string, unknown>) => {
    const ids = [...selectedBoardIds];
    void Promise.all(ids.map((id) => applyOrganization(id, action, payload))).then(() => setSelectedBoardIds(new Set())).catch((caught) => setError(caughtMessage(caught, "Some selected boards could not be updated.")));
  };

  const renameBoardFromDashboard = (board: BoardSummary) => {
    const title = window.prompt("Rename board", board.title)?.trim();
    if (!title) return;
    void updateBoardSettings(board.id, { title }).then((updated) => setBoards((current) => current.map((item) => item.id === board.id ? { ...item, ...updated } : item))).catch((caught) => setError(caughtMessage(caught, "The board could not be renamed.")));
  };

  const deleteBoardFromDashboard = (board: BoardSummary) => {
    if (!window.confirm(`Move “${board.title}” to recoverable Trash for 30 days?`)) return;
    void deleteBoard(board.id).then(() => {
      setBoards((current) => current.filter((item) => item.id !== board.id));
      setDeletedBoards((current) => [{ ...board, deletedAt: Date.now() }, ...current]);
    }).catch((caught) => setError(caughtMessage(caught, "The board could not be deleted.")));
  };

  const shareBoardFromDashboard = (boardId: string) => {
    const url = new URL(window.location.href);
    url.searchParams.set("board", boardId);
    url.searchParams.set("shareDialog", "1");
    window.history.pushState({}, "", url);
    void openBoard(boardId);
  };

  const handleCreate = async () => {
    if (!user.uid || creating) return;
    setCreating(true);
    setError(null);
    try {
      const boardId = await createBoard("Untitled board");
      await openBoard(boardId);
    } catch (caught) {
      setError(caughtMessage(caught, "We couldn't create a board."));
    } finally {
      setCreating(false);
    }
  };

  const handleCopy = async (boardId: string) => {
    if (!user.uid) return;
    setError(null);
    try {
      const copyId = await duplicateBoard(boardId);
      await openBoard(copyId);
    } catch (caught) {
      setError(caughtMessage(caught, "We couldn't copy this board."));
    }
  };

  const handleLogout = async () => {
    await signOut(auth);
    dispatch(logout());
  };
  const selectedSavedViewIndex = savedViews.findIndex((item) => item.id === selectedSavedViewId);
  const commitSavedViews = (next: SavedBoardView[]) => {
    setSavedViews(next);
    persistDashboardPreference("kumo:saved-board-views", JSON.stringify(next));
  };

  return (
    <main className={styles.dashboard}>
      <header className={styles.header}>
        <button type="button" className={styles.brand} aria-label="Kumo boards" onClick={showBoards}>
          <KumoLogo className={styles.brandLogo} decorative />
          <span className={styles.brandName}>Kumo</span>
        </button>
        <nav className={styles.primaryNav} aria-label="Workspace">
          <button type="button" className={`${ui.button} ${ui.buttonGhost} ${ui.buttonCompact} ${view === "boards" ? styles.navActive : ""}`} aria-current={view === "boards" ? "page" : undefined} onClick={showBoards}>Boards</button>
          <button type="button" className={`${ui.button} ${ui.buttonGhost} ${ui.buttonCompact} ${view === "friends" ? styles.navActive : ""}`} aria-current={view === "friends" ? "page" : undefined} onClick={showFriends}>
            Friends
            {incomingCount > 0 && <span className={styles.navBadge} aria-label={`${incomingCount} pending friend requests`}>{incomingCount}</span>}
          </button>
          <button type="button" className={`${ui.button} ${ui.buttonGhost} ${ui.buttonCompact} ${view === "inbox" ? styles.navActive : ""}`} aria-current={view === "inbox" ? "page" : undefined} onClick={() => showSimpleView("inbox")}><Bell aria-hidden="true" /> Inbox{notifications.some((notification) => !notification.read_at) && <span className={styles.navBadge} aria-label="Unread notifications">{notifications.filter((notification) => !notification.read_at).length}</span>}</button>
          <button type="button" className={`${ui.button} ${ui.buttonGhost} ${ui.buttonCompact} ${view === "templates" ? styles.navActive : ""}`} aria-current={view === "templates" ? "page" : undefined} onClick={() => showSimpleView("templates")}><Package aria-hidden="true" /> Templates</button>
          <button type="button" className={`${ui.button} ${ui.buttonGhost} ${ui.buttonCompact} ${view === "workspace" ? styles.navActive : ""}`} aria-current={view === "workspace" ? "page" : undefined} onClick={() => showSimpleView("workspace")}><UsersThree aria-hidden="true" /> Workspace</button>
          <button type="button" className={`${ui.button} ${ui.buttonGhost} ${ui.buttonCompact} ${view === "community" ? styles.navActive : ""}`} aria-current={view === "community" ? "page" : undefined} onClick={() => showSimpleView("community")}><Compass aria-hidden="true" /> Community</button>
        </nav>
        {view === "boards" ? (
          <label className={`${ui.searchControl} ${styles.search}`}>
            <span className="sr-only">Search public boards</span>
            <MagnifyingGlass aria-hidden="true" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search public boards" />
            {query.trim() && globalResults.length > 0 && <div className={styles.globalSearchResults} role="listbox" aria-label="Search across Kumo">{globalResults.slice(0, 8).map((result) => <a key={`${result.kind}:${result.id}`} href={result.actionUrl} role="option" aria-selected="false" onClick={(event) => { event.preventDefault(); navigateToUrl(result.actionUrl); }}><strong>{result.label}</strong><small>{result.kind} · {result.detail}</small></a>)}</div>}
          </label>
        ) : <span className={styles.headerSpacer} />}
        <div className={styles.account}>
          <button type="button" className={`${ui.button} ${ui.buttonGhost} ${ui.buttonCompact} ${styles.profileButton}`} onClick={() => showProfile()} aria-label="Open your profile">
            <ProfileAvatar name={user.displayName || user.email || "Kumo user"} avatarUrl={user.avatarUrl} size={30} />
            <span>{user.displayName || user.username || user.email}</span>
            <UserCircle aria-hidden="true" />
          </button>
          <button type="button" className={`${ui.button} ${ui.buttonGhost} ${ui.buttonCompact}`} onClick={() => showSimpleView("settings")} aria-label="Open settings"><Gear aria-hidden="true" /></button>
          <button type="button" className={`${ui.button} ${ui.buttonGhost} ${ui.buttonCompact} ${styles.signOutButton}`} onClick={handleLogout} aria-label="Sign out"><SignOut aria-hidden="true" /><span>Sign out</span></button>
        </div>
      </header>

      <div className={styles.content}>
        {error && <div className={`${ui.notice} ${ui.noticeError}`} role="alert"><span>{error}</span>{requestedBoardId && <button type="button" className={`${ui.button} ${ui.buttonCompact}`} onClick={() => void requestBoardAccess(requestedBoardId, "viewer", "Please share this board with me.").then(() => { setError("Access request sent to the board owner."); setRequestedBoardId(null); }).catch((caught) => setError(caughtMessage(caught, "Access request failed.")))}>Request access</button>}</div>}
        {view === "friends" ? (
          <FriendsView onOpenProfile={showProfile} onIncomingCountChange={setIncomingCount} />
        ) : view === "profile" ? (
          <ProfileView
            key={profileUsername ?? "self"}
            username={profileUsername}
            onOpenBoard={(board) => void openBoard(board.id)}
            onIncomingCountChange={refreshIncomingCount}
          />
        ) : view === "workspace" ? (
          <WorkspaceAdminView />
        ) : view === "community" ? (
          <CommunityView onOpenBoard={(boardId) => void openBoard(boardId)} selectedSlug={selectedCommunitySlug} />
        ) : view === "settings" ? (
          <SettingsView />
        ) : view === "inbox" ? (
          <section className={styles.boardSection}>
            <div className={`${ui.sectionHeading} ${styles.sectionHeading}`}><h1>Inbox</h1><button type="button" className={`${ui.button} ${ui.buttonGhost}`} onClick={() => void markNotificationRead().then(() => setNotifications((current) => current.map((notification) => ({ ...notification, read_at: notification.read_at ?? new Date().toISOString() }))))}>Mark all read</button></div>
            <div role="group" aria-label="Inbox filters">{(["all", "unread", "archived"] as const).map((filter) => <button type="button" key={filter} className={`${ui.button} ${ui.buttonGhost} ${inboxFilter === filter ? styles.navActive : ""}`} aria-pressed={inboxFilter === filter} onClick={() => setInboxFilter(filter)}>{filter}</button>)}</div>
            <div className={styles.notificationList}>{visibleNotifications.map((notification) => <article key={notification.id} className={!notification.read_at ? styles.unreadNotification : undefined}><button type="button" onClick={() => activateNotification(notification)} aria-label={`Open ${notification.title}`}><Bell aria-hidden="true" /><span><strong>{notification.title}</strong><small>{notification.body}</small></span><time>{new Date(notification.created_at).toLocaleDateString()}</time></button><div><button type="button" className={`${ui.button} ${ui.buttonGhost} ${ui.buttonCompact}`} onClick={() => mutateNotification(notification, { read: !notification.read_at })}>Mark {notification.read_at ? "unread" : "read"}</button><button type="button" className={`${ui.button} ${ui.buttonGhost} ${ui.buttonCompact}`} onClick={() => mutateNotification(notification, { archived: !notification.archived_at })}>{notification.archived_at ? "Restore" : "Archive"}</button>{notification.board_id && <button type="button" className={`${ui.button} ${ui.buttonGhost} ${ui.buttonCompact}`} onClick={() => toggleBoardMute(notification.board_id!)}>{mutedBoardIds.has(notification.board_id) ? "Unmute board" : "Mute board"}</button>}</div></article>)}</div>
            {!visibleNotifications.length && <div className={ui.emptyState}><p>{inboxFilter === "archived" ? "No archived notifications." : inboxFilter === "unread" ? "You have no unread notifications." : "Your inbox is clear."}</p></div>}
          </section>
        ) : view === "templates" ? (
          <section className={styles.boardSection}>
            <div className={`${ui.sectionHeading} ${styles.sectionHeading}`}><h1>Board templates</h1><span>{templates.length}</span></div>
            <div className={styles.boardGrid}>{templates.map((template) => <article className={styles.boardCard} key={template.id} data-selected={template.id === selectedTemplateId || undefined}><div className={styles.templatePreview}><Package aria-hidden="true" /></div><div className={styles.boardMeta}><div><h3>{template.name}</h3><p>{template.description || "Reusable Kumo board"}</p></div><button type="button" className={`${ui.button} ${ui.buttonPrimary}`} aria-current={template.id === selectedTemplateId ? "true" : undefined} onClick={() => void instantiateTemplate(template.id).then(({ boardId }) => openBoard(boardId))}>Use template</button></div></article>)}</div>
          </section>
        ) : (
          <>
          <section className={styles.hero}>
            <div>
              <p className={styles.eyebrow}><Graph aria-hidden="true" /> Your connected workspace</p>
              <h1>Pick up where the idea moved.</h1>
              <p>Open a board, follow a link, or give the next thought its own canvas.</p>
            </div>
            <button type="button" className={`${ui.button} ${ui.buttonPrimary} ${styles.createButton}`} onClick={handleCreate} disabled={creating}>
              <Plus aria-hidden="true" weight="bold" />
              {creating ? "Creating" : "New board"}
            </button>
          </section>

          <div className={styles.boardWorkspaceLayout}>
          <aside className={styles.folderSidebar} aria-label="Workspace folders">
            <h2>Folders</h2>
            <div role="tree" aria-label="Board folder tree">
              <button type="button" role="treeitem" aria-selected={!selectedFolderId} className={!selectedFolderId ? styles.folderActive : undefined} onClick={() => setSelectedFolderId(null)}><Folder aria-hidden="true" /> All boards</button>
              {orderedFolders.map((folder) => <button type="button" role="treeitem" aria-level={folderDepth(folder, folders) + 1} aria-selected={selectedFolderId === folder.id} className={selectedFolderId === folder.id ? styles.folderActive : undefined} style={{ paddingLeft: `${12 + folderDepth(folder, folders) * 16}px` }} key={folder.id} onClick={() => setSelectedFolderId(folder.id)}><Folder aria-hidden="true" /> {folder.name}</button>)}
            </div>
          </aside>
          <div className={styles.boardWorkspaceMain}>
          <section className={styles.workspaceControls} aria-label="Board organization">
            <div role="group" aria-label="Board filters">{(["active", "favorites", "archived", "trash"] as const).map((filter) => <button type="button" key={filter} className={`${ui.button} ${ui.buttonGhost} ${boardFilter === filter ? styles.navActive : ""}`} aria-pressed={boardFilter === filter} onClick={() => setBoardFilter(filter)}>{filter}</button>)}</div>
            <form onSubmit={(event) => { event.preventDefault(); if (!folderName.trim()) return; void createFolder(folderName).then(({ folder }) => { setFolders((current) => [...current, folder]); setFolderName(""); }); }}><Folder aria-hidden="true" /><input aria-label="New folder name" placeholder="New folder" value={folderName} onChange={(event) => setFolderName(event.target.value)} /><button type="submit" className={`${ui.button} ${ui.buttonGhost}`}>Add</button></form>
            {folders.length > 0 && <span>{folders.length} folder{folders.length === 1 ? "" : "s"}</span>}
            <select aria-label="Sort boards" value={boardSort} onChange={(event) => { const next = event.target.value as BoardSort; setBoardSort(next); persistDashboardPreference("kumo:board-sort", next); }}><option value="updated">Recently updated</option><option value="title">Title</option></select>
            <select aria-label="Board card density" value={boardDensity} onChange={(event) => { const next = event.target.value as BoardDensity; setBoardDensity(next); persistDashboardPreference("kumo:board-density", next); }}><option value="comfortable">Comfortable</option><option value="compact">Compact</option></select>
            <form onSubmit={(event) => { event.preventDefault(); const name = savedViewName.trim(); if (!name) return; void saveBoardView({ name, filter: boardFilter, sort: boardSort, density: boardDensity }).then(({ view: saved }) => { const next = [...savedViews, saved].slice(-24); commitSavedViews(next); setSelectedSavedViewId(saved.id); setSavedViewName(""); }).catch((caught) => setError(caughtMessage(caught, "Saved view could not be synchronized."))); }}><input aria-label="Saved view name" placeholder="Save this view" value={savedViewName} onChange={(event) => setSavedViewName(event.target.value)} /><button type="submit" className={`${ui.button} ${ui.buttonGhost}`}>Save</button></form>
            {savedViews.length > 0 && <>
              <select aria-label="Open saved board view" value={selectedSavedViewId} onChange={(event) => { setSelectedSavedViewId(event.target.value); const saved = savedViews.find((item) => item.id === event.target.value); if (!saved) return; setBoardFilter(saved.filter); setBoardSort(saved.sort); setBoardDensity(saved.density); }}><option value="" disabled>Saved views</option>{savedViews.map((saved) => <option key={saved.id} value={saved.id}>{saved.name}</option>)}</select>
              <button type="button" className={`${ui.button} ${ui.buttonGhost}`} disabled={selectedSavedViewIndex < 0} onClick={() => { const current = savedViews[selectedSavedViewIndex]!; const name = window.prompt("Rename saved view", current.name)?.trim(); if (!name) return; void renameBoardView(current.id, name).then(({ view: updated }) => commitSavedViews(savedViews.map((item) => item.id === updated.id ? updated : item))).catch((caught) => setError(caughtMessage(caught, "Saved view could not be renamed."))); }}>Rename view</button>
              <button type="button" className={`${ui.button} ${ui.buttonGhost}`} disabled={!selectedSavedViewId} onClick={() => { const id = selectedSavedViewId; void deleteBoardView(id).then(() => { commitSavedViews(savedViews.filter((item) => item.id !== id)); setSelectedSavedViewId(""); }).catch((caught) => setError(caughtMessage(caught, "Saved view could not be deleted."))); }}>Delete view</button>
              <button type="button" className={`${ui.button} ${ui.buttonGhost}`} disabled={selectedSavedViewIndex <= 0} onClick={() => { const next = [...savedViews]; [next[selectedSavedViewIndex - 1], next[selectedSavedViewIndex]] = [next[selectedSavedViewIndex]!, next[selectedSavedViewIndex - 1]!]; commitSavedViews(next); void reorderBoardViews(next.map((item) => item.id)).catch((caught) => { commitSavedViews(savedViews); setError(caughtMessage(caught, "Saved views could not be reordered.")); }); }}>Move view up</button>
            </>}
            {selectedBoardIds.size > 0 && <div className={styles.bulkBoardActions} role="toolbar" aria-label="Bulk board actions"><strong>{selectedBoardIds.size} selected</strong><button type="button" className={`${ui.button} ${ui.buttonGhost}`} onClick={() => bulkOrganize("favorite-board", { favorite: true })}>Favorite</button><button type="button" className={`${ui.button} ${ui.buttonGhost}`} onClick={() => bulkOrganize("archive-board")}>Archive</button><button type="button" className={`${ui.button} ${ui.buttonGhost}`} onClick={() => bulkOrganize("trash-board")}>Trash</button><select aria-label="Move selected boards" defaultValue="" onChange={(event) => { if (event.target.value) bulkOrganize("move-board", { folderId: event.target.value }); event.target.value = ""; }}><option value="" disabled>Move to folder</option>{folders.map((folder) => <option key={folder.id} value={folder.id}>{folder.name}</option>)}</select><button type="button" className={`${ui.button} ${ui.buttonGhost}`} onClick={() => setSelectedBoardIds(new Set())}>Clear</button></div>}
          </section>

        {query.trim() ? (
          <section className={styles.boardSection}>
            <div className={`${ui.sectionHeading} ${styles.sectionHeading}`}>
              <h2>Public results</h2>
              <span>{publicResults.length}</span>
            </div>
            {publicResults.length > 0 ? (
              <div className={styles.boardGrid}>
                {publicResults.map((board) => (
                  <BoardCard key={board.id} board={board} actionLabel={board.ownerId === user.uid ? "Open" : "Copy"} onOpen={() => board.ownerId === user.uid ? openBoard(board.id) : handleCopy(board.id)} />
                ))}
              </div>
            ) : (
              <div className={`${ui.emptyState} ${styles.emptyState}`}><p>No public boards match “{query}”.</p><span>Try a shorter title or create your own.</span></div>
            )}
          </section>
        ) : (
          <>
            {boardFilter === "active" && boards.length > 4 && recentBoards.length > 0 && <section className={styles.boardSection}><div className={`${ui.sectionHeading} ${styles.sectionHeading}`}><h2>Recent boards</h2><span>{recentBoards.length}</span></div><div className={`${styles.boardGrid} ${boardDensity === "compact" ? styles.compactGrid : ""}`}>{recentBoards.map((board) => <BoardCard key={`recent:${board.id}`} board={board} onOpen={() => openBoard(board.id)} organization={organization.find((item) => item.board_id === board.id)} folders={folders} />)}</div></section>}
            <section className={styles.boardSection}>
              <div className={`${ui.sectionHeading} ${styles.sectionHeading}`}>
                <h2>My boards</h2>
                <span>{myBoards.length}</span>
              </div>
              {loading ? (
                <div className={styles.skeletonGrid} aria-label="Loading boards">{[0, 1, 2].map((value) => <span key={value} />)}</div>
              ) : myBoards.length > 0 ? (
                <div className={`${styles.boardGrid} ${boardDensity === "compact" ? styles.compactGrid : ""}`}>{myBoards.map((board) => <BoardCard key={board.id} board={board} onOpen={() => board.deletedAt ? undefined : openBoard(board.id)} organization={board.deletedAt ? { board_id: board.id, workspace_id: null, folder_id: null, favorite: false, archived_at: null, trashed_at: new Date(board.deletedAt).toISOString() } : organization.find((item) => item.board_id === board.id)} folders={folders} selected={selectedBoardIds.has(board.id)} onSelectionChange={board.deletedAt ? undefined : (selected) => setSelectedBoardIds((current) => { const next = new Set(current); if (selected) next.add(board.id); else next.delete(board.id); return next; })} onRename={board.deletedAt ? undefined : () => renameBoardFromDashboard(board)} onDuplicate={board.deletedAt ? undefined : () => void handleCopy(board.id)} onShare={board.deletedAt ? undefined : () => shareBoardFromDashboard(board.id)} onDelete={board.deletedAt ? undefined : () => deleteBoardFromDashboard(board)} onOrganize={(action, payload) => { if (board.deletedAt && action === "restore-board") { void restoreDeletedBoard(board.id).then((restored) => { setDeletedBoards((current) => current.filter((item) => item.id !== board.id)); setBoards((current) => [restored, ...current]); }); return; } void applyOrganization(board.id, action, payload); }} />)}</div>
              ) : (
                <div className={`${ui.emptyState} ${styles.emptyState}`}>
                  <KumoLogo className={styles.emptyLogo} context="attention" decorative />
                  <p>Start one board. Link the next.</p>
                  <span>Your first board is a clean, private canvas.</span>
                  <button type="button" className={`${ui.button} ${ui.buttonPrimary} ${ui.buttonCompact}`} onClick={handleCreate}><Plus aria-hidden="true" /> Create a board</button>
                  {boardFilter === "active" && !boards.some((board) => board.ownerId === user.uid && !board.deletedAt) && <button type="button" className={`${ui.button} ${ui.buttonGhost} ${ui.buttonCompact}`} onClick={() => void createOnboardingBoard().then(openBoard).catch((caught) => setError(caughtMessage(caught, "The guided board could not be created.")))}>Open guided sample</button>}
                </div>
              )}
            </section>
            {sharedBoards.length > 0 && (
              <section className={styles.boardSection}>
                <div className={`${ui.sectionHeading} ${styles.sectionHeading}`}><h2>Shared with me</h2><span>{sharedBoards.length}</span></div>
                <div className={`${styles.boardGrid} ${boardDensity === "compact" ? styles.compactGrid : ""}`}>
                  {sharedBoards.map((board) => (
                    <BoardCard
                      key={board.id}
                      board={board}
                      onOpen={() => openBoard(board.id)}
                      organization={organization.find((item) => item.board_id === board.id)}
                      folders={folders}
                      selected={selectedBoardIds.has(board.id)}
                      onSelectionChange={(selected) => setSelectedBoardIds((current) => { const next = new Set(current); if (selected) next.add(board.id); else next.delete(board.id); return next; })}
                      onDuplicate={() => void handleCopy(board.id)}
                      onOrganize={(action, payload) => {
                        void applyOrganization(board.id, action, payload);
                      }}
                    />
                  ))}
                </div>
              </section>
            )}
          </>
          )}
          </div>
          </div>
          </>
        )}
      </div>
    </main>
  );
};

export default BoardDashboard;
