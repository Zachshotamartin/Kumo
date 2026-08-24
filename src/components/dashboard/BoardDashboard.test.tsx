import { configureStore } from "@reduxjs/toolkit";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
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
vi.mock("../social/FriendsView", () => ({
  FriendsView: ({ onOpenProfile }: { onOpenProfile: (username: string) => void }) => <div>Friends view <button onClick={() => onOpenProfile("alex")}>Open Alex</button></div>,
}));
vi.mock("../social/ProfileView", () => ({
  ProfileView: ({ username }: { username?: string | null }) => <div>Profile view {username ?? "self"}</div>,
}));
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

const renderDashboard = () => {
  const store = configureStore({
    reducer: {
      auth: authReducer,
      whiteBoard: whiteBoardReducer,
      actions: actionsReducer,
      selected: selectedReducer,
      editor: editorReducer,
    },
  });
  store.dispatch(login({ uid: "user", email: "user@example.com" }));
  render(<Provider store={store}><BoardDashboard /></Provider>);
  return store;
};

describe("BoardDashboard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
  });

  it("opens an access-controlled direct board link after authentication", async () => {
    window.history.replaceState({}, "", "/?board=shared-link");
    const store = renderDashboard();
    await waitFor(() => expect(mocks.get).toHaveBeenCalledWith("shared-link"));
    expect(store.getState().whiteBoard.id).toBe("shared-link");
  });

  afterEach(() => vi.useRealTimers());

  it("loads owned/shared boards and opens or creates them", async () => {
    const store = renderDashboard();
    expect(screen.getByRole("button", { name: "Kumo boards" })).toHaveTextContent("Kumo");
    expect(await screen.findByText("My map")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open My map" }).querySelector("img"))
      .toHaveAttribute("src", "https://signed.example/mine.svg");
    await waitFor(() => expect(screen.getByRole("button", { name: "Open Shared map" }).querySelector("img"))
      .toHaveAttribute("src", "blob:generated-preview"));
    expect(mocks.preview).toHaveBeenCalledWith("shared");
    expect(screen.getByText("Shared with me")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Open My map" }));
    await waitFor(() => expect(store.getState().whiteBoard.id).toBe("mine"));
    fireEvent.click(screen.getByRole("button", { name: "New board" }));
    await waitFor(() => expect(mocks.create).toHaveBeenCalledWith("Untitled board"));
    expect(store.getState().whiteBoard.id).toBe("created");
  });

  it("navigates between friends, public profiles, the current profile, and boards", async () => {
    renderDashboard();
    await screen.findByText("My map");
    fireEvent.click(screen.getByRole("button", { name: "Friends" }));
    expect(screen.getByText("Friends view")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Open Alex" }));
    expect(screen.getByText("Profile view alex")).toBeInTheDocument();
    expect(new URL(window.location.href).searchParams.get("profile")).toBe("alex");
    fireEvent.click(screen.getByRole("button", { name: "Open your profile" }));
    expect(screen.getByText("Profile view self")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Boards" }));
    expect(screen.getByRole("heading", { name: "My boards" })).toBeInTheDocument();
  });

  it("searches public boards, copies external results, and signs out", async () => {
    const store = renderDashboard();
    await screen.findByText("My map");
    fireEvent.change(screen.getByPlaceholderText("Search public boards"), {
      target: { value: "cloud" },
    });
    expect(await screen.findByText("Shared map")).toBeInTheDocument();
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
    mocks.templates.mockResolvedValue([{ id: "template", owner_id: "user", source_board_id: "mine", name: "Workshop", description: "A reusable workshop", visibility: "private", created_at: "", updated_at: "" }]);
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
    fireEvent.click(screen.getByRole("button", { name: "Use template" }));
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
});
