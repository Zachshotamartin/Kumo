import { configureStore } from "@reduxjs/toolkit";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
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
}));

vi.mock("../../services/boardRepository", () => ({
  listBoards: mocks.list,
  searchPublicBoards: mocks.search,
  getBoard: mocks.get,
  createBoard: mocks.create,
  duplicateBoard: mocks.duplicate,
}));
vi.mock("../../services/socialRepository", () => ({
  listFriendships: mocks.friendships,
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
});
