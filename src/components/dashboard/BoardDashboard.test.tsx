import { configureStore } from "@reduxjs/toolkit";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { Provider } from "react-redux";
import actionsReducer from "../../features/actions/actionsSlice";
import authReducer, { login } from "../../features/auth/authSlice";
import editorReducer from "../../features/editor/editorSlice";
import selectedReducer from "../../features/selected/selectedSlice";
import whiteBoardReducer from "../../features/whiteBoard/whiteBoardSlice";
import BoardDashboard from "./BoardDashboard";

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  search: vi.fn(),
  get: vi.fn(),
  create: vi.fn(),
  duplicate: vi.fn(),
  signOut: vi.fn(),
  friendships: vi.fn(),
  preview: vi.fn(),
  workspace: vi.fn(),
  notifications: vi.fn(),
  templates: vi.fn(),
  markNotification: vi.fn(),
  instantiateTemplate: vi.fn(),
  createFolder: vi.fn(),
  organize: vi.fn(),
  redeem: vi.fn(),
  requestAccess: vi.fn(),
  globalSearch: vi.fn(), acceptWorkspaceInvitation: vi.fn(),
  acceptBoardInvitation: vi.fn(),
  notificationPreferences: vi.fn(), deliverBrowserNotifications: vi.fn(),
}));

vi.mock("../../services/boardRepository", () => ({
  listBoards: mocks.list,
  searchPublicBoards: mocks.search,
  getBoard: mocks.get,
  createBoard: mocks.create,
  duplicateBoard: mocks.duplicate,
  loadBoardPreview: mocks.preview,
}));
vi.mock("../../services/socialRepository", () => ({
  listFriendships: mocks.friendships,
}));
vi.mock("../../services/productRepository", () => ({
  loadWorkspaceOverview: mocks.workspace,
  loadNotifications: mocks.notifications,
  loadTemplates: mocks.templates,
  markNotificationRead: mocks.markNotification,
  instantiateTemplate: mocks.instantiateTemplate,
  createFolder: mocks.createFolder,
  organizeBoard: mocks.organize,
  redeemShareLink: mocks.redeem,
  requestBoardAccess: mocks.requestAccess,
}));
vi.mock("../../services/platformRepository", () => ({
  globalSearch: mocks.globalSearch,
  acceptWorkspaceInvitation: mocks.acceptWorkspaceInvitation,
  loadNotificationPreferences: mocks.notificationPreferences,
}));
vi.mock("../../services/collaboratorRepository", () => ({ acceptBoardInvitation: mocks.acceptBoardInvitation }));
vi.mock("../../platform/browserNotifications", () => ({ deliverBrowserNotifications: mocks.deliverBrowserNotifications }));
vi.mock("../social/FriendsView", () => ({
  FriendsView: ({ onOpenProfile, onIncomingCountChange }: { onOpenProfile: (username: string) => void; onIncomingCountChange: (count: number) => void }) => <div>Friends view <button onClick={() => onOpenProfile("alex")}>Open Alex</button><button onClick={() => onIncomingCountChange(3)}>Report requests</button></div>,
}));
vi.mock("../social/ProfileView", () => ({
  ProfileView: ({ username, onOpenBoard, onIncomingCountChange }: { username?: string | null; onOpenBoard: (board: { id: string }) => void; onIncomingCountChange: () => void }) => <div>Profile view {username ?? "self"}<button onClick={() => onOpenBoard({ id: "profile-board" })}>Open profile board</button><button onClick={onIncomingCountChange}>Refresh requests</button></div>,
}));
vi.mock("./WorkspaceAdminView", () => ({ WorkspaceAdminView: () => <div>Workspace admin view</div> }));
vi.mock("./SettingsView", () => ({ SettingsView: () => <div>Settings view</div> }));
vi.mock("./CommunityView", () => ({ CommunityView: ({ onOpenBoard }: { onOpenBoard: (id: string) => void }) => <div>Community view <button onClick={() => onOpenBoard("community-board")}>Open community board</button></div> }));
vi.mock("firebase/auth", () => ({ signOut: mocks.signOut }));
vi.mock("../../config/firebase", () => ({ auth: {} }));

const summary = (id: string, ownerId = "user") => ({
  id,
  title: id === "mine" ? "My map" : "Shared map",
  ownerId,
  visibility: "public" as const,
  roomId: `board:${id}`,
  role: ownerId === "user" ? "owner" as const : "viewer" as const,
  updatedAt: 1,
  thumbnailUrl: id === "mine" ? "https://signed.example/mine.svg" : null,
  members: { [ownerId]: "owner" as const },
});

const board = (id: string) => ({
  shapes: [], id, roomId: `board:${id}`, role: "owner" as const, type: "private",
  title: "Opened", uid: "user", sharedWith: [], members: { user: "owner" as const },
  linkedBoards: {},
  backGroundColor: "#252629", lastChangedBy: null, currentUsers: [], schemaVersion: 3,
  revision: 0, updatedAt: 1,
});

const renderDashboard = (authenticated = true) => {
  const store = configureStore({
    reducer: {
      auth: authReducer,
      whiteBoard: whiteBoardReducer,
      actions: actionsReducer,
      selected: selectedReducer,
      editor: editorReducer,
    },
  });
  if (authenticated) store.dispatch(login({ uid: "user", email: "user@example.com" }));
  render(<Provider store={store}><BoardDashboard /></Provider>);
  return store;
};

describe("BoardDashboard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    window.history.replaceState({}, "", "/");
    mocks.list.mockResolvedValue([summary("mine"), summary("shared", "other")]);
    mocks.get.mockImplementation(async (id: string) => board(id));
    mocks.create.mockResolvedValue("created");
    mocks.duplicate.mockResolvedValue("copied");
    mocks.search.mockResolvedValue([summary("public", "other")]);
    mocks.signOut.mockResolvedValue(undefined);
    mocks.friendships.mockResolvedValue({ friends: [], incoming: [], outgoing: [], blocked: [] });
    mocks.preview.mockResolvedValue("blob:generated-preview");
    mocks.workspace.mockResolvedValue({ workspace: { workspace_id: "workspace" }, folders: [], organization: [] });
    mocks.notifications.mockResolvedValue([]);
    mocks.templates.mockResolvedValue([]);
    mocks.markNotification.mockResolvedValue(undefined);
    mocks.instantiateTemplate.mockResolvedValue({ boardId: "from-template" });
    mocks.createFolder.mockResolvedValue({ folder: { id: "folder", workspace_id: "workspace", parent_id: null, name: "Research", created_by: "user", created_at: "", updated_at: "" } });
    mocks.organize.mockImplementation(async (_action: string, boardId: string, payload?: Record<string, unknown>) => ({ organization: { board_id: boardId, workspace_id: "workspace", folder_id: payload?.folderId ?? null, favorite: payload?.favorite ?? false, archived_at: null, trashed_at: null } }));
    mocks.redeem.mockResolvedValue({ boardId: "shared-link", role: "viewer" });
    mocks.requestAccess.mockResolvedValue({ id: "request", status: "pending" });
    mocks.globalSearch.mockResolvedValue([]);
    mocks.acceptWorkspaceInvitation.mockResolvedValue({ accepted: true, workspaceId: "workspace" });
    mocks.acceptBoardInvitation.mockResolvedValue({ boardId: "invited", role: "editor" });
    mocks.notificationPreferences.mockResolvedValue({ browser_enabled: false });
  });

  it("opens an access-controlled direct board link after authentication", async () => {
    window.history.replaceState({}, "", "/?board=shared-link");
    const store = renderDashboard();
    await waitFor(() => expect(mocks.get).toHaveBeenCalledWith("shared-link"));
    expect(store.getState().whiteBoard.id).toBe("shared-link");
    expect(JSON.parse(localStorage.getItem("kumo:recent-boards:user") ?? "[]")).toEqual([
      expect.objectContaining({ boardId: "shared-link" }),
    ]);
  });

  it("sorts, compacts, saves, and restores board views while surfacing recent work", async () => {
    mocks.workspace.mockResolvedValue({ workspace: { workspace_id: "workspace" }, folders: [], organization: [{ board_id: "one", workspace_id: "workspace", folder_id: null, favorite: false, archived_at: null, trashed_at: null }] });
    localStorage.setItem("kumo:recent-boards:user", JSON.stringify([
      { boardId: "four", openedAt: 20 },
      { boardId: "two", openedAt: 10 },
    ]));
    mocks.list.mockResolvedValue([
      { ...summary("one"), title: "Zulu", updatedAt: 1 },
      { ...summary("two"), title: "Alpha", updatedAt: 5 },
      { ...summary("three"), title: "Echo", updatedAt: 4 },
      { ...summary("four"), title: "Bravo", updatedAt: 3 },
      { ...summary("five"), title: "Delta", updatedAt: 2 },
    ]);
    renderDashboard();
    const recentHeading = await screen.findByRole("heading", { name: "Recent boards" });
    expect(recentHeading).toBeVisible();
    expect(within(recentHeading.closest("section")!).getAllByRole("button", { name: /^Open (?:Bravo|Alpha)$/ }).map((button) => button.getAttribute("aria-label")))
      .toEqual(["Open Bravo", "Open Alpha"]);
    fireEvent.click(within(recentHeading.closest("section")!).getByRole("button", { name: "Open Bravo" }));
    await waitFor(() => expect(mocks.get).toHaveBeenCalledWith("four"));
    fireEvent.change(screen.getByLabelText("Sort boards"), { target: { value: "title" } });
    fireEvent.change(screen.getByLabelText("Board card density"), { target: { value: "compact" } });
    expect(localStorage.getItem("kumo:board-sort")).toBe("title");
    expect(localStorage.getItem("kumo:board-density")).toBe("compact");
    fireEvent.change(screen.getByLabelText("Saved view name"), { target: { value: "  Product maps  " } });
    fireEvent.submit(screen.getByLabelText("Saved view name").closest("form")!);
    const views = JSON.parse(localStorage.getItem("kumo:saved-board-views") ?? "[]") as Array<{ id: string; name: string }>;
    expect(views).toEqual([expect.objectContaining({ name: "Product maps" })]);
    fireEvent.change(screen.getByLabelText("Open saved board view"), { target: { value: views[0]?.id } });
    expect(screen.getByLabelText("Sort boards")).toHaveValue("title");
    expect(screen.getByLabelText("Board card density")).toHaveValue("compact");
  });

  it("ignores malformed persisted board organization state", async () => {
    localStorage.setItem("kumo:saved-board-views", JSON.stringify([null, { id: "broken" }, { id: "bad", name: "Bad", filter: "unknown", sort: "sideways", density: "tiny" }]));
    localStorage.setItem("kumo:board-sort", "sideways");
    localStorage.setItem("kumo:board-density", "tiny");
    renderDashboard();
    await screen.findByText("My map");
    expect(screen.getByLabelText("Sort boards")).toHaveValue("updated");
    expect(screen.getByLabelText("Board card density")).toHaveValue("comfortable");
    expect(screen.queryByLabelText("Open saved board view")).not.toBeInTheDocument();
  });

  afterEach(() => vi.useRealTimers());

  it("loads owned/shared boards and opens or creates them", async () => {
    mocks.workspace.mockResolvedValue({ workspace: { workspace_id: "workspace" }, folders: [], organization: [{ board_id: "mine", workspace_id: "workspace", folder_id: null, favorite: false, archived_at: null, trashed_at: null }] });
    const store = renderDashboard();
    expect(screen.getByRole("button", { name: "Kumo boards" })).toHaveTextContent("Kumo");
    expect(await screen.findByText("My map")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open My map" }).querySelector("img"))
      .toHaveAttribute("src", "https://signed.example/mine.svg");
    await waitFor(() => expect(screen.getByRole("button", { name: "Open Shared map" }).querySelector("img"))
      .toHaveAttribute("src", "blob:generated-preview"));
    expect(mocks.preview).toHaveBeenCalledWith("shared", expect.any(AbortSignal));
    expect(screen.getByText("Shared with me")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Open My map" }));
    await waitFor(() => expect(store.getState().whiteBoard.id).toBe("mine"));
    fireEvent.click(screen.getByRole("button", { name: "Open Shared map" }));
    await waitFor(() => expect(store.getState().whiteBoard.id).toBe("shared"));
    fireEvent.click(screen.getByRole("button", { name: "Add Shared map to favorites" }));
    await waitFor(() => expect(mocks.organize).toHaveBeenCalledWith("favorite-board", "shared", { favorite: true }));
    fireEvent.click(screen.getByRole("button", { name: "New board" }));
    await waitFor(() => expect(mocks.create).toHaveBeenCalledWith("Untitled board"));
    expect(store.getState().whiteBoard.id).toBe("created");
  });

  it("navigates between friends, public profiles, the current profile, and boards", async () => {
    renderDashboard();
    await screen.findByText("My map");
    await waitFor(() => expect(screen.getByRole("button", { name: "Open Shared map" }).querySelector("img")).toHaveAttribute("src", "blob:generated-preview"));
    fireEvent.click(screen.getByRole("button", { name: "Friends" }));
    expect(screen.getByText("Friends view")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Open Alex" }));
    expect(screen.getByText("Profile view alex")).toBeInTheDocument();
    expect(new URL(window.location.href).searchParams.get("profile")).toBe("alex");
    fireEvent.click(screen.getByRole("button", { name: "Open your profile" }));
    expect(screen.getByText("Profile view self")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Boards" }));
    expect(screen.getByRole("heading", { name: "My boards" })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: "Open Shared map" }).querySelector("img")).toHaveAttribute("src", "blob:generated-preview"));
  });

  it("searches public boards, copies external results, and signs out", async () => {
    mocks.globalSearch.mockResolvedValueOnce([{ id: "global", kind: "board", label: "Global board", detail: "Everywhere", actionUrl: "/?board=global" }]);
    const store = renderDashboard();
    await screen.findByText("My map");
    fireEvent.change(screen.getByPlaceholderText("Search public boards"), {
      target: { value: "cloud" },
    });
    expect(await screen.findByText("Shared map")).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /Global board/ })).toHaveAttribute("href", "/?board=global");
    fireEvent.click(screen.getByRole("button", { name: "Copy Shared map" }));
    await act(async () => { await Promise.resolve(); });
    expect(mocks.duplicate).toHaveBeenCalledWith("public");
    expect(store.getState().whiteBoard.id).toBe("copied");
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    await act(async () => { await Promise.resolve(); });
    expect(mocks.signOut).toHaveBeenCalled();
    expect(store.getState().auth.isAuthenticated).toBe(false);
  });

  it("surfaces load and create failures", async () => {
    mocks.list.mockRejectedValueOnce(new Error("offline"));
    renderDashboard();
    expect(await screen.findByRole("alert")).toHaveTextContent("couldn't load");
    mocks.create.mockRejectedValueOnce(new Error("Liveblocks configuration is incomplete"));
    fireEvent.click(screen.getByRole("button", { name: "New board" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Liveblocks configuration is incomplete");
  });

  it("organizes boards, creates folders, processes inbox items, and instantiates templates", async () => {
    mocks.workspace.mockResolvedValue({
      workspace: { workspace_id: "workspace" },
      folders: [{ id: "existing", workspace_id: "workspace", parent_id: null, name: "Existing", created_by: "user", created_at: "", updated_at: "" }],
      organization: [
        { board_id: "mine", workspace_id: "workspace", folder_id: null, favorite: true, archived_at: null, trashed_at: null },
        { board_id: "shared", workspace_id: "workspace", folder_id: null, favorite: false, archived_at: "2026-08-01", trashed_at: null },
      ],
    });
    mocks.notifications.mockResolvedValue([{ id: "notice", actor_id: "other", board_id: "mine", kind: "access", title: "Access granted", body: "You can edit.", action_url: null, read_at: null, created_at: "2026-08-23" }]);
    mocks.templates.mockResolvedValue([
      { id: "template", owner_id: "user", source_board_id: "mine", name: "Workshop", description: "A reusable workshop", visibility: "private", created_at: "", updated_at: "" },
      { id: "blank-template", owner_id: "user", source_board_id: "mine", name: "Blank", description: "", visibility: "private", created_at: "", updated_at: "" },
    ]);
    renderDashboard();
    await screen.findByText("My map");
    await waitFor(() => expect(screen.getByText("1 folder")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "Remove My map from favorites" }));
    fireEvent.click(screen.getByRole("button", { name: "Archive My map" }));
    fireEvent.change(screen.getByLabelText("Folder for My map"), { target: { value: "existing" } });
    await waitFor(() => expect(mocks.organize).toHaveBeenCalledTimes(3));

    fireEvent.change(screen.getByLabelText("New folder name"), { target: { value: "Research" } });
    fireEvent.submit(screen.getByLabelText("New folder name").closest("form")!);
    await waitFor(() => expect(screen.getByText("2 folders")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: /Inbox/ }));
    expect(screen.getByText("Access granted")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Access granted/ }));
    await waitFor(() => expect(mocks.markNotification).toHaveBeenCalledWith("notice"));
    fireEvent.click(screen.getByRole("button", { name: "Mark all read" }));
    await waitFor(() => expect(mocks.markNotification).toHaveBeenCalledWith());

    fireEvent.click(screen.getByRole("button", { name: /Templates/ }));
    expect(screen.getByText("A reusable workshop")).toBeInTheDocument();
    expect(screen.getByText("Reusable Kumo board")).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("button", { name: "Use template" })[0]!);
    await waitFor(() => expect(mocks.get).toHaveBeenCalledWith("from-template"));
  });

  it("redeems governed links and offers an access request when a direct board is unavailable", async () => {
    window.history.replaceState({}, "", "/?share=secret-token");
    renderDashboard();
    await waitFor(() => expect(mocks.redeem).toHaveBeenCalledWith("secret-token"));
    await waitFor(() => expect(mocks.get).toHaveBeenCalledWith("shared-link"));
    expect(new URL(window.location.href).searchParams.has("share")).toBe(false);

    cleanup();
    vi.clearAllMocks();
    mocks.list.mockResolvedValue([summary("mine"), summary("shared", "other")]);
    mocks.workspace.mockResolvedValue({ workspace: { workspace_id: "workspace" }, folders: [], organization: [] });
    mocks.notifications.mockResolvedValue([]);
    mocks.templates.mockResolvedValue([]);
    mocks.friendships.mockResolvedValue({ friends: [], incoming: [], outgoing: [], blocked: [] });
    mocks.preview.mockResolvedValue("blob:generated-preview");
    mocks.requestAccess.mockResolvedValue({ id: "request", status: "pending" });
    window.history.replaceState({}, "", "/?board=restricted");
    mocks.get.mockRejectedValueOnce(new Error("Board access is required."));
    renderDashboard();
    expect(await screen.findByRole("alert")).toHaveTextContent("Board access is required");
    fireEvent.click(screen.getByRole("button", { name: "Request access" }));
    await waitFor(() => expect(mocks.requestAccess).toHaveBeenCalledWith("restricted", "viewer", "Please share this board with me."));
    expect(screen.getByRole("alert")).toHaveTextContent("Access request sent");
  });

  it("delivers permission-enabled browser notifications and opens their board", async () => {
    const notice = { id: "notice", actor_id: "other", board_id: "mine", kind: "branch", title: "Review requested", body: "Open the branch", action_url: "/?board=mine&branch=branch", read_at: null, created_at: "2026-08-24" };
    mocks.notificationPreferences.mockResolvedValue({ browser_enabled: true });
    mocks.notifications.mockResolvedValue([notice]);
    const store = renderDashboard();
    await waitFor(() => expect(mocks.deliverBrowserNotifications).toHaveBeenCalledWith([notice], expect.any(Function)));
    const activate = mocks.deliverBrowserNotifications.mock.calls.at(-1)?.[1] as (item: typeof notice) => void;
    act(() => activate(notice));
    await waitFor(() => expect(mocks.markNotification).toHaveBeenCalledWith("notice"));
    await waitFor(() => expect(store.getState().whiteBoard.id).toBe("mine"));
  });

  it("validates, limits, and restores persisted board preferences", async () => {
    localStorage.setItem("kumo:saved-board-views", "not-json");
    renderDashboard();
    await screen.findByText("My map");
    expect(screen.queryByLabelText("Open saved board view")).not.toBeInTheDocument();
    cleanup();

    localStorage.setItem("kumo:saved-board-views", JSON.stringify({ id: "not-an-array" }));
    renderDashboard();
    await screen.findByText("My map");
    expect(screen.queryByLabelText("Open saved board view")).not.toBeInTheDocument();
    cleanup();

    const valid = Array.from({ length: 13 }, (_, index) => ({ id: `view-${index}`, name: `View ${index}`, filter: "active", sort: "title", density: "compact" }));
    localStorage.setItem("kumo:saved-board-views", JSON.stringify([
      false, "text", { id: 1, name: "Bad", filter: "active", sort: "title", density: "compact" },
      { id: "bad-name", name: 1, filter: "active", sort: "title", density: "compact" },
      { id: "bad-filter", name: "Bad", filter: "missing", sort: "title", density: "compact" },
      { id: "bad-sort", name: "Bad", filter: "active", sort: "missing", density: "compact" },
      { id: "bad-density", name: "Bad", filter: "active", sort: "title", density: "missing" },
      ...valid,
    ]));
    localStorage.setItem("kumo:board-sort", "title");
    localStorage.setItem("kumo:board-density", "compact");
    renderDashboard();
    await screen.findByText("My map");
    const saved = screen.getByLabelText("Open saved board view");
    expect(within(saved).getAllByRole("option")).toHaveLength(13);
    expect(within(saved).queryByRole("option", { name: "View 0" })).not.toBeInTheDocument();
    fireEvent.change(saved, { target: { value: "missing" } });
    expect(screen.getByLabelText("Sort boards")).toHaveValue("title");
  });

  it("does not run authenticated operations for a signed-out dashboard", async () => {
    renderDashboard(false);
    expect(mocks.list).not.toHaveBeenCalled();
    expect(mocks.workspace).not.toHaveBeenCalled();
    expect(mocks.friendships).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "New board" }));
    expect(mocks.create).not.toHaveBeenCalled();
    fireEvent.change(screen.getByPlaceholderText("Search public boards"), { target: { value: "public" } });
    expect(await screen.findByText("Shared map")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Copy Shared map" }));
    expect(mocks.duplicate).not.toHaveBeenCalled();
  });

  it("ignores stale board/workspace loads and stale failures after unmount", async () => {
    let resolveBoards: (boards: ReturnType<typeof summary>[]) => void = () => undefined;
    let resolveWorkspace: (value: { workspace: { workspace_id: string }; folders: []; organization: [] }) => void = () => undefined;
    mocks.list.mockImplementationOnce(() => new Promise((resolve) => { resolveBoards = resolve; }));
    mocks.workspace.mockImplementationOnce(() => new Promise((resolve) => { resolveWorkspace = resolve; }));
    const stale = renderDashboard();
    stale.getState();
    cleanup();
    await act(async () => {
      resolveBoards([summary("late")]);
      resolveWorkspace({ workspace: { workspace_id: "workspace" }, folders: [], organization: [] });
      await Promise.resolve();
    });

    let rejectBoards: (reason: unknown) => void = () => undefined;
    mocks.list.mockImplementationOnce(() => new Promise((_, reject) => { rejectBoards = reject; }));
    renderDashboard();
    cleanup();
    await act(async () => { rejectBoards(new Error("late")); await Promise.resolve(); });
  });

  it("refreshes browser notifications only while visible and cleans up listeners", async () => {
    mocks.notificationPreferences.mockResolvedValue({ browser_enabled: true });
    mocks.notifications.mockResolvedValueOnce([]).mockResolvedValueOnce([]).mockRejectedValueOnce(new Error("offline"));
    const visibility = vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    renderDashboard();
    await waitFor(() => expect(mocks.deliverBrowserNotifications).toHaveBeenCalled());
    const initialCalls = mocks.notifications.mock.calls.length;
    fireEvent(document, new Event("visibilitychange"));
    expect(mocks.notifications).toHaveBeenCalledTimes(initialCalls);
    visibility.mockReturnValue("visible");
    fireEvent(document, new Event("visibilitychange"));
    await waitFor(() => expect(mocks.notifications.mock.calls.length).toBe(initialCalls + 1));
    fireEvent(document, new Event("visibilitychange"));
    await act(async () => { await Promise.resolve(); });
    cleanup();
    fireEvent(document, new Event("visibilitychange"));
    expect(mocks.notifications).toHaveBeenCalledTimes(initialCalls + 2);
    visibility.mockRestore();
  });

  it("handles inbox actions without boards and marks mixed notifications read", async () => {
    const plain = { id: "plain", actor_id: null, board_id: null, kind: "system", title: "Plain", body: "No action", action_url: null, read_at: null, created_at: "2026-08-24" };
    const home = { ...plain, id: "home", title: "Home", action_url: "/?profile=alex", read_at: "2026-08-24T01:00:00Z" };
    mocks.notifications.mockResolvedValue([plain, home]);
    renderDashboard();
    await screen.findByText("My map");
    fireEvent.click(screen.getByRole("button", { name: /Inbox/ }));
    fireEvent.click(screen.getByRole("button", { name: "Mark all read" }));
    await waitFor(() => expect(mocks.markNotification).toHaveBeenCalledWith());
    expect(screen.getByRole("button", { name: /Plain/ })).not.toHaveClass("unreadNotification");
    fireEvent.click(screen.getByRole("button", { name: /Plain/ }));
    await waitFor(() => expect(mocks.markNotification).toHaveBeenCalledWith("plain"));
    expect(window.location.search).toBe("");
    fireEvent.click(screen.getByRole("button", { name: /Home/ }));
    expect(window.location.search).toContain("profile=alex");
  });

  it("accepts board and workspace invitations and reports invitation/link failures", async () => {
    window.history.replaceState({}, "", "/?invite=board-token&workspaceInvite=workspace-token");
    renderDashboard();
    await waitFor(() => expect(mocks.get).toHaveBeenCalledWith("invited"));
    expect(await screen.findByText("Workspace admin view")).toBeInTheDocument();
    expect(new URL(window.location.href).searchParams.get("board")).toBe("invited");
    cleanup();

    window.history.replaceState({}, "", "/?share=bad");
    mocks.redeem.mockRejectedValueOnce("bad link");
    renderDashboard();
    expect(await screen.findByRole("alert")).toHaveTextContent("share link could not be opened");
    cleanup();

    window.history.replaceState({}, "", "/?invite=bad&workspaceInvite=bad-workspace");
    mocks.acceptBoardInvitation.mockRejectedValueOnce("bad invite");
    mocks.acceptWorkspaceInvitation.mockRejectedValueOnce(new Error("Workspace expired"));
    renderDashboard();
    expect(await screen.findByRole("alert")).toHaveTextContent("Workspace expired");
    cleanup();

    window.history.replaceState({}, "", "/?share=bad&invite=bad&workspaceInvite=bad-workspace");
    mocks.redeem.mockRejectedValueOnce(new Error("Share expired"));
    mocks.acceptBoardInvitation.mockRejectedValueOnce(new Error("Invite expired"));
    mocks.acceptWorkspaceInvitation.mockRejectedValueOnce("bad workspace");
    renderDashboard();
    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
  });

  it("opens all dashboard views and exercises profile/community callbacks", async () => {
    mocks.friendships.mockResolvedValueOnce({ friends: [], incoming: [{ id: "request" }], outgoing: [], blocked: [] });
    const store = renderDashboard();
    await screen.findByText("My map");
    expect(await screen.findByLabelText("1 pending friend requests")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Friends/ }));
    fireEvent.click(screen.getByRole("button", { name: "Report requests" }));
    expect(screen.getByLabelText("3 pending friend requests")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Open Alex" }));
    fireEvent.click(screen.getByRole("button", { name: "Open profile board" }));
    await waitFor(() => expect(store.getState().whiteBoard.id).toBe("profile-board"));
    fireEvent.click(screen.getByRole("button", { name: "Refresh requests" }));
    await waitFor(() => expect(mocks.friendships).toHaveBeenCalledTimes(2));
    fireEvent.click(screen.getByRole("button", { name: /Workspace/ }));
    expect(screen.getByText("Workspace admin view")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Community/ }));
    fireEvent.click(screen.getByRole("button", { name: "Open community board" }));
    await waitFor(() => expect(store.getState().whiteBoard.id).toBe("community-board"));
    fireEvent.click(screen.getByRole("button", { name: "Open settings" }));
    expect(screen.getByText("Settings view")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Inbox/ }));
    expect(screen.getByText("Your inbox is clear.")).toBeInTheDocument();
  });

  it("filters every organization state and handles public-owner and empty results", async () => {
    mocks.workspace.mockResolvedValue({
      workspace: { workspace_id: "workspace" }, folders: [], organization: [
        { board_id: "favorite", workspace_id: "workspace", folder_id: null, favorite: true, archived_at: null, trashed_at: null },
        { board_id: "archived", workspace_id: "workspace", folder_id: null, favorite: false, archived_at: "date", trashed_at: null },
        { board_id: "trashed", workspace_id: "workspace", folder_id: null, favorite: true, archived_at: "date", trashed_at: "date" },
      ],
    });
    mocks.list.mockResolvedValue([
      { ...summary("favorite"), title: "Favorite", updatedAt: undefined },
      { ...summary("archived"), title: "Archived", updatedAt: undefined },
      { ...summary("trashed"), title: "Trashed", updatedAt: 2 },
      { ...summary("active"), title: "Active", updatedAt: undefined },
    ]);
    renderDashboard();
    await screen.findByText("Active");
    fireEvent.click(screen.getByRole("button", { name: "favorites" }));
    expect(screen.getByText("Favorite")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "archived" }));
    expect(screen.getByText("Archived")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "trash" }));
    expect(screen.getByText("Trashed")).toBeInTheDocument();
    fireEvent.submit(screen.getByLabelText("New folder name").closest("form")!);
    expect(mocks.createFolder).not.toHaveBeenCalled();
    fireEvent.submit(screen.getByLabelText("Saved view name").closest("form")!);

    mocks.search.mockResolvedValueOnce([{ ...summary("owned-public"), title: "Owned public" }]);
    fireEvent.change(screen.getByPlaceholderText("Search public boards"), { target: { value: "owned" } });
    expect(await screen.findByText("Owned public")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Open Owned public" }));
    await waitFor(() => expect(mocks.get).toHaveBeenCalledWith("owned-public"));
    fireEvent.change(screen.getByPlaceholderText("Search public boards"), { target: { value: "none" } });
    mocks.search.mockResolvedValueOnce([]);
    expect(await screen.findByText(/No public boards match/)).toBeInTheDocument();
  });

  it("reports non-error open/create/copy/access failures and friendship fallback", async () => {
    mocks.friendships.mockRejectedValueOnce("offline");
    mocks.get.mockRejectedValueOnce("not found");
    window.history.replaceState({}, "", "/?board=missing");
    renderDashboard();
    expect(await screen.findByRole("alert")).toHaveTextContent("couldn't open this board");
    mocks.requestAccess.mockRejectedValueOnce("denied");
    fireEvent.click(screen.getByRole("button", { name: "Request access" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Access request failed");
    mocks.requestAccess.mockRejectedValueOnce(new Error("Requests disabled"));
    fireEvent.click(screen.getByRole("button", { name: "Request access" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Requests disabled");
    mocks.create.mockRejectedValueOnce("create failed");
    fireEvent.click(screen.getByRole("button", { name: "New board" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("couldn't create a board");
    mocks.search.mockResolvedValueOnce([summary("public", "other")]);
    fireEvent.change(screen.getByPlaceholderText("Search public boards"), { target: { value: "copy" } });
    expect(await screen.findByText("Shared map")).toBeInTheDocument();
    mocks.duplicate.mockRejectedValueOnce("copy failed");
    fireEvent.click(screen.getByRole("button", { name: "Copy Shared map" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("couldn't copy this board");
    mocks.duplicate.mockRejectedValueOnce(new Error("Copy disabled"));
    fireEvent.click(screen.getByRole("button", { name: "Copy Shared map" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Copy disabled");
  });

  it("starts on a linked profile route", async () => {
    window.history.replaceState({}, "", "/?profile=alex");
    renderDashboard();
    expect(screen.getByText("Profile view alex")).toBeInTheDocument();
  });

  it("handles workspace bootstrap failure and stale search success/failure", async () => {
    mocks.workspace.mockRejectedValueOnce(new Error("workspace offline"));
    renderDashboard();
    expect(await screen.findByText("My map")).toBeInTheDocument();
    cleanup();

    let resolveSearch: (boards: ReturnType<typeof summary>[]) => void = () => undefined;
    mocks.search.mockImplementationOnce(() => new Promise((resolve) => { resolveSearch = resolve; }));
    renderDashboard();
    fireEvent.change(screen.getByPlaceholderText("Search public boards"), { target: { value: "first" } });
    await waitFor(() => expect(mocks.search).toHaveBeenCalledWith("first"));
    fireEvent.change(screen.getByPlaceholderText("Search public boards"), { target: { value: "second" } });
    await act(async () => { resolveSearch([summary("late")]); await Promise.resolve(); });
    cleanup();

    let rejectSearch: (reason: unknown) => void = () => undefined;
    mocks.search.mockImplementationOnce(() => new Promise((_, reject) => { rejectSearch = reject; }));
    renderDashboard();
    fireEvent.change(screen.getByPlaceholderText("Search public boards"), { target: { value: "stale" } });
    await waitFor(() => expect(mocks.search).toHaveBeenCalledWith("stale"));
    cleanup();
    await act(async () => { rejectSearch(new Error("late")); await Promise.resolve(); });

    mocks.search.mockRejectedValueOnce(new Error("offline"));
    renderDashboard();
    fireEvent.change(screen.getByPlaceholderText("Search public boards"), { target: { value: "failure" } });
    await waitFor(() => expect(mocks.search).toHaveBeenCalledWith("failure"));
    expect(await screen.findByText(/No public boards match/)).toBeInTheDocument();
  });
});
