import { useCallback, useEffect, useRef, useState } from "react";
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
  duplicateBoard,
  getBoard,
  listBoards,
  searchPublicBoards,
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
import {
  createFolder,
  instantiateTemplate,
  loadNotifications,
  loadTemplates,
  loadWorkspaceOverview,
  markNotificationRead,
  organizeBoard,
  redeemShareLink,
  requestBoardAccess,
  type AccountNotification,
  type BoardOrganization,
  type BoardTemplateSummary,
  type WorkspaceFolder,
} from "../../services/productRepository";

type DashboardView = "boards" | "friends" | "profile" | "inbox" | "templates" | "workspace" | "community" | "settings";

const routeFromLocation = () => {
  const profile = new URL(window.location.href).searchParams.get("profile");
  return { view: profile ? "profile" as const : "boards" as const, profile };
};

const BoardDashboard = () => {
  const dispatch = useDispatch<AppDispatch>();
  const user = useSelector((state: RootState) => state.auth);
  const [boards, setBoards] = useState<BoardSummary[]>([]);
  const [publicBoards, setPublicBoards] = useState<BoardSummary[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [initialRoute] = useState(routeFromLocation);
  const [view, setView] = useState<DashboardView>(initialRoute.view);
  const [profileUsername, setProfileUsername] = useState<string | null>(initialRoute.profile);
  const [incomingCount, setIncomingCount] = useState(0);
  const [notifications, setNotifications] = useState<AccountNotification[]>([]);
  const [browserNotificationsEnabled, setBrowserNotificationsEnabled] = useState(false);
  const [templates, setTemplates] = useState<BoardTemplateSummary[]>([]);
  const [folders, setFolders] = useState<WorkspaceFolder[]>([]);
  const [organization, setOrganization] = useState<BoardOrganization[]>([]);
  const [boardFilter, setBoardFilter] = useState<"active" | "favorites" | "archived" | "trash">("active");
  const [folderName, setFolderName] = useState("");
  const [requestedBoardId, setRequestedBoardId] = useState<string | null>(null);
  const [globalResults, setGlobalResults] = useState<GlobalSearchResult[]>([]);
  const directLinkHandledRef = useRef(false);

  const openBoard = useCallback(async (boardId: string) => {
    setError(null);
    try {
      const board = await getBoard(boardId);
      const url = new URL(window.location.href);
      url.searchParams.set("board", boardId);
      window.history.replaceState({}, "", url);
      dispatch(clearSelectedShapes());
      dispatch(setWhiteboardData(board));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "We couldn't open this board.");
      setRequestedBoardId(boardId);
    }
  }, [dispatch]);

  const activateNotification = useCallback((notification: AccountNotification) => {
    void markNotificationRead(notification.id).then(() => {
      setNotifications((current) => current.map((item) => item.id === notification.id ? { ...item, read_at: new Date().toISOString() } : item));
    });
    if (!notification.action_url) return;
    const target = new URL(notification.action_url, window.location.origin);
    const boardId = target.searchParams.get("board");
    if (boardId) { window.history.pushState({}, "", target); void openBoard(boardId); }
    else { window.history.pushState({}, "", target); setView("boards"); }
  }, [openBoard]);

  useEffect(() => {
    if (!user.uid) return;
    let active = true;
    void listBoards()
      .then((nextBoards) => {
        if (!active) return;
        setBoards(nextBoards);
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
    void Promise.all([loadWorkspaceOverview(), loadNotifications(), loadTemplates(), loadNotificationPreferences()]).then(([workspace, nextNotifications, nextTemplates, preferences]) => {
      if (!active) return;
      setFolders(workspace.folders);
      setOrganization(workspace.organization);
      setNotifications(nextNotifications);
      setTemplates(nextTemplates);
      setBrowserNotificationsEnabled(preferences.browser_enabled);
    }).catch(() => undefined);
    return () => { active = false; };
  }, [user.uid]);

  useEffect(() => {
    if (!user.uid || !browserNotificationsEnabled) return;
    const refresh = () => {
      if (document.visibilityState === "hidden") return;
      void loadNotifications().then(setNotifications).catch(() => undefined);
    };
    const interval = window.setInterval(refresh, 30_000);
    document.addEventListener("visibilitychange", refresh);
    return () => { window.clearInterval(interval); document.removeEventListener("visibilitychange", refresh); };
  }, [browserNotificationsEnabled, user.uid]);

  useEffect(() => {
    if (!browserNotificationsEnabled) return;
    deliverBrowserNotifications(notifications, activateNotification);
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
    }).catch((caught) => setError(caught instanceof Error ? caught.message : "This share link could not be opened."));
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
    if (invitation) void acceptBoardInvitation(invitation).then(({ boardId }) => { url.searchParams.delete("invite"); window.history.replaceState({}, "", url); return openBoard(boardId); }).catch((caught) => setError(caught instanceof Error ? caught.message : "Invitation could not be accepted."));
    if (workspaceInvitation) void acceptWorkspaceInvitation(workspaceInvitation).then(() => { url.searchParams.delete("workspaceInvite"); window.history.replaceState({}, "", url); setView("workspace"); }).catch((caught) => setError(caught instanceof Error ? caught.message : "Workspace invitation could not be accepted."));
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
    url.searchParams.delete("profile");
    window.history.replaceState({}, "", url);
    setProfileUsername(null);
    setView("boards");
  };

  const showFriends = () => {
    const url = new URL(window.location.href);
    url.searchParams.delete("profile");
    window.history.replaceState({}, "", url);
    setProfileUsername(null);
    setView("friends");
  };

  const showProfile = (username?: string | null) => {
    const url = new URL(window.location.href);
    url.searchParams.delete("board");
    if (username) url.searchParams.set("profile", username);
    else url.searchParams.delete("profile");
    window.history.replaceState({}, "", url);
    setProfileUsername(username ?? null);
    setView("profile");
  };

  const showSimpleView = (next: "inbox" | "templates" | "workspace" | "community" | "settings") => {
    const url = new URL(window.location.href);
    url.searchParams.delete("profile");
    window.history.replaceState({}, "", url);
    setView(next);
  };

  const visibleBoards = boards.filter((board) => {
    const state = organization.find((item) => item.board_id === board.id);
    if (boardFilter === "favorites") return state?.favorite && !state.trashed_at;
    if (boardFilter === "archived") return Boolean(state?.archived_at) && !state?.trashed_at;
    if (boardFilter === "trash") return Boolean(state?.trashed_at);
    return !state?.archived_at && !state?.trashed_at;
  });
  const myBoards = visibleBoards.filter((board) => board.ownerId === user.uid);
  const sharedBoards = visibleBoards.filter((board) => board.ownerId !== user.uid);
  const publicResults = publicBoards;

  const handleCreate = async () => {
    if (!user.uid || creating) return;
    setCreating(true);
    setError(null);
    try {
      const boardId = await createBoard("Untitled board");
      await openBoard(boardId);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "We couldn't create a board.");
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
      setError(caught instanceof Error ? caught.message : "We couldn't copy this board.");
    }
  };

  const handleLogout = async () => {
    await signOut(auth);
    dispatch(logout());
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
            {query.trim() && globalResults.length > 0 && <div className={styles.globalSearchResults} role="listbox" aria-label="Search across Kumo">{globalResults.slice(0, 8).map((result) => <a key={`${result.kind}:${result.id}`} href={result.actionUrl} role="option" aria-selected="false"><strong>{result.label}</strong><small>{result.kind} · {result.detail}</small></a>)}</div>}
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
          <CommunityView onOpenBoard={(boardId) => void openBoard(boardId)} />
        ) : view === "settings" ? (
          <SettingsView />
        ) : view === "inbox" ? (
          <section className={styles.boardSection}>
            <div className={`${ui.sectionHeading} ${styles.sectionHeading}`}><h1>Inbox</h1><button type="button" className={`${ui.button} ${ui.buttonGhost}`} onClick={() => void markNotificationRead().then(() => setNotifications((current) => current.map((notification) => ({ ...notification, read_at: notification.read_at ?? new Date().toISOString() }))))}>Mark all read</button></div>
            <div className={styles.notificationList}>{notifications.map((notification) => <button type="button" key={notification.id} className={!notification.read_at ? styles.unreadNotification : undefined} onClick={() => activateNotification(notification)}><Bell aria-hidden="true" /><span><strong>{notification.title}</strong><small>{notification.body}</small></span><time>{new Date(notification.created_at).toLocaleDateString()}</time></button>)}</div>
            {!notifications.length && <div className={ui.emptyState}><p>Your inbox is clear.</p></div>}
          </section>
        ) : view === "templates" ? (
          <section className={styles.boardSection}>
            <div className={`${ui.sectionHeading} ${styles.sectionHeading}`}><h1>Board templates</h1><span>{templates.length}</span></div>
            <div className={styles.boardGrid}>{templates.map((template) => <article className={styles.boardCard} key={template.id}><div className={styles.templatePreview}><Package aria-hidden="true" /></div><div className={styles.boardMeta}><div><h3>{template.name}</h3><p>{template.description || "Reusable Kumo board"}</p></div><button type="button" className={`${ui.button} ${ui.buttonPrimary}`} onClick={() => void instantiateTemplate(template.id).then(({ boardId }) => openBoard(boardId))}>Use template</button></div></article>)}</div>
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

          <section className={styles.workspaceControls} aria-label="Board organization">
            <div role="group" aria-label="Board filters">{(["active", "favorites", "archived", "trash"] as const).map((filter) => <button type="button" key={filter} className={`${ui.button} ${ui.buttonGhost} ${boardFilter === filter ? styles.navActive : ""}`} aria-pressed={boardFilter === filter} onClick={() => setBoardFilter(filter)}>{filter}</button>)}</div>
            <form onSubmit={(event) => { event.preventDefault(); if (!folderName.trim()) return; void createFolder(folderName).then(({ folder }) => { setFolders((current) => [...current, folder]); setFolderName(""); }); }}><Folder aria-hidden="true" /><input aria-label="New folder name" placeholder="New folder" value={folderName} onChange={(event) => setFolderName(event.target.value)} /><button type="submit" className={`${ui.button} ${ui.buttonGhost}`}>Add</button></form>
            {folders.length > 0 && <span>{folders.length} folder{folders.length === 1 ? "" : "s"}</span>}
          </section>

        {error && <div className={`${ui.notice} ${ui.noticeError}`} role="alert"><span>{error}</span>{requestedBoardId && <button type="button" className={`${ui.button} ${ui.buttonCompact}`} onClick={() => void requestBoardAccess(requestedBoardId, "viewer", "Please share this board with me.").then(() => { setError("Access request sent to the board owner."); setRequestedBoardId(null); }).catch((caught) => setError(caught instanceof Error ? caught.message : "Access request failed."))}>Request access</button>}</div>}

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
            <section className={styles.boardSection}>
              <div className={`${ui.sectionHeading} ${styles.sectionHeading}`}>
                <h2>My boards</h2>
                <span>{myBoards.length}</span>
              </div>
              {loading ? (
                <div className={styles.skeletonGrid} aria-label="Loading boards">{[0, 1, 2].map((value) => <span key={value} />)}</div>
              ) : myBoards.length > 0 ? (
                <div className={styles.boardGrid}>{myBoards.map((board) => <BoardCard key={board.id} board={board} onOpen={() => openBoard(board.id)} organization={organization.find((item) => item.board_id === board.id)} folders={folders} onOrganize={(action, payload) => void organizeBoard(action, board.id, payload).then(({ organization: next }) => setOrganization((current) => [...current.filter((item) => item.board_id !== board.id), next]))} />)}</div>
              ) : (
                <div className={`${ui.emptyState} ${styles.emptyState}`}>
                  <KumoLogo className={styles.emptyLogo} context="attention" decorative />
                  <p>Start one board. Link the next.</p>
                  <span>Your first board is a clean, private canvas.</span>
                  <button type="button" className={`${ui.button} ${ui.buttonPrimary} ${ui.buttonCompact}`} onClick={handleCreate}><Plus aria-hidden="true" /> Create a board</button>
                </div>
              )}
            </section>
            {sharedBoards.length > 0 && (
              <section className={styles.boardSection}>
                <div className={`${ui.sectionHeading} ${styles.sectionHeading}`}><h2>Shared with me</h2><span>{sharedBoards.length}</span></div>
                <div className={styles.boardGrid}>{sharedBoards.map((board) => <BoardCard key={board.id} board={board} onOpen={() => openBoard(board.id)} organization={organization.find((item) => item.board_id === board.id)} folders={folders} onOrganize={(action, payload) => void organizeBoard(action, board.id, payload).then(({ organization: next }) => setOrganization((current) => [...current.filter((item) => item.board_id !== board.id), next]))} />)}</div>
              </section>
            )}
          </>
          )}
          </>
        )}
      </div>
    </main>
  );
};

export default BoardDashboard;
