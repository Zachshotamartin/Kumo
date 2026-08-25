import { configureStore } from "@reduxjs/toolkit";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Provider } from "react-redux";
import type { Shape } from "../../classes/shape";
import actionsReducer from "../../features/actions/actionsSlice";
import authReducer, { login } from "../../features/auth/authSlice";
import editorReducer, { setSaveStatus } from "../../features/editor/editorSlice";
import selectedReducer from "../../features/selected/selectedSlice";
import whiteBoardReducer, { setWhiteboardData } from "../../features/whiteBoard/whiteBoardSlice";
import EditorWorkspace from "./EditorWorkspace";

const mocks = vi.hoisted(() => ({
  commitBoardPatch: vi.fn(),
  deleteBoard: vi.fn(),
  signOut: vi.fn(),
  loadProductGraph: vi.fn(),
  updateMyPresence: vi.fn(),
  broadcastEvent: vi.fn(),
  connectionStatus: "connected" as "connected" | "connecting" | "initial" | "reconnecting" | "disconnected",
  syncStatus: "synchronized" as "synchronized" | "synchronizing",
  spotlight: false,
  unreadCommentCount: 0,
  listDesignBranches: vi.fn(),
}));

vi.mock("@liveblocks/react", () => ({
  useSyncStatus: () => mocks.syncStatus,
  useStatus: () => mocks.connectionStatus,
}));
vi.mock("@liveblocks/react/suspense", () => ({
  useMyPresence: () => [{ spotlight: mocks.spotlight }, mocks.updateMyPresence],
  useBroadcastEvent: () => mocks.broadcastEvent,
  useUnreadInboxNotificationsCount: () => ({ count: mocks.unreadCommentCount }),
}));
vi.mock("../../editor/useEditorActions", () => ({
  useEditorActions: () => ({ commitBoardPatch: mocks.commitBoardPatch }),
}));
vi.mock("../../services/boardRepository", () => ({ deleteBoard: mocks.deleteBoard }));
vi.mock("../../services/branchRepository", () => ({ listDesignBranches: mocks.listDesignBranches }));
vi.mock("../../services/productRepository", () => ({ loadProductGraph: mocks.loadProductGraph }));
vi.mock("firebase/auth", () => ({ signOut: mocks.signOut }));
vi.mock("../../config/firebase", () => ({ auth: {} }));
vi.mock("./EditorCanvas", () => ({ default: () => <div>Canvas</div> }));
vi.mock("./EditorToolbar", () => ({ default: () => <div>Toolbar</div> }));
vi.mock("./InspectorPanel", () => ({ default: () => <div>Inspector</div> }));
vi.mock("./LayersPanel", () => ({ default: () => <div>Layers</div> }));
vi.mock("./ShareDialog", () => ({ default: ({ onClose }: { onClose: () => void }) => (
  <div role="dialog">Sharing<button onClick={onClose}>Close share</button></div>
) }));
vi.mock("../../comments/CommentsPanel", () => ({ CommentsPanel: () => <div>Comments panel</div> }));
vi.mock("../../history/VersionHistoryPanel", () => ({ VersionHistoryPanel: () => <div>History panel</div> }));
vi.mock("./DesignLibraryPanel", () => ({ default: () => <div>Assets panel</div> }));
vi.mock("./PrototypePanel", () => ({ default: () => <div>Prototype panel</div> }));
vi.mock("./ExportPanel", () => ({ default: () => <div>Export panel</div> }));
vi.mock("./InspectPanel", () => ({ default: () => <div>Inspect panel</div> }));
vi.mock("./BranchesPanel", () => ({ default: () => <div>Branches panel</div> }));
vi.mock("./ProductPanel", () => ({ default: () => <div>Product panel</div> }));
vi.mock("./AdvancedStudioPanel", () => ({ default: () => <div>Studio panel</div> }));
vi.mock("./PresentationView", () => ({ default: () => <div>Presentation view</div> }));

interface WorkspaceOptions {
  authenticated?: boolean;
  board?: {
    id?: string | null;
    roomId?: string | null;
    baseRoomId?: string | null;
    activeBranchId?: string | null;
    activeBranchName?: string | null;
    type?: string | null;
    title?: string | null;
    shapes?: Shape[];
    currentUsers?: { uid: string; label?: string; cursorX: number | null; cursorY: number | null }[];
  };
}

const renderWorkspace = (role: "owner" | "viewer" = "owner", options: WorkspaceOptions = {}) => {
  const store = configureStore({
    reducer: {
      auth: authReducer,
      whiteBoard: whiteBoardReducer,
      actions: actionsReducer,
      selected: selectedReducer,
      editor: editorReducer,
    },
  });
  if (options.authenticated !== false) store.dispatch(login({ uid: "owner", email: "owner@example.com" }));
  store.dispatch(setWhiteboardData({
    id: "board", roomId: "board:board", role, type: "private", title: "Original",
    uid: "owner", members: { owner: "owner", collaborator: "editor" },
    currentUsers: [{ uid: "owner", label: "Owner", cursorX: null, cursorY: null }],
    ...options.board,
  }));
  render(<Provider store={store}><EditorWorkspace /></Provider>);
  return store;
};

describe("EditorWorkspace", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.history.replaceState({}, "", "/");
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 1024 });
    mocks.connectionStatus = "connected";
    mocks.syncStatus = "synchronized";
    mocks.spotlight = false;
    mocks.unreadCommentCount = 0;
    mocks.deleteBoard.mockResolvedValue(undefined);
    mocks.signOut.mockResolvedValue(undefined);
    mocks.loadProductGraph.mockResolvedValue({ sourceId: "board", nodes: [], edges: [], incoming: [] });
    mocks.listDesignBranches.mockResolvedValue([]);
  });

  it.each([
    ["reconnecting", "Reconnecting"],
    ["disconnected", "Offline"],
  ] as const)("shows the %s collaboration connection state", (status, label) => {
    mocks.connectionStatus = status;
    renderWorkspace();
    expect(screen.getByText(label)).toBeVisible();
    expect(screen.getByLabelText("2 people on this board")).toBeVisible();
  });

  it("renames, changes visibility, opens sharing, and returns home", () => {
    const store = renderWorkspace();
    expect(screen.getByRole("button", { name: "Back to boards" })).toHaveTextContent("Kumo");
    fireEvent.change(screen.getByLabelText("Board title"), { target: { value: "  Renamed  " } });
    fireEvent.blur(screen.getByLabelText("Board title"));
    expect(mocks.commitBoardPatch).toHaveBeenCalledWith({ title: "Renamed" });
    fireEvent.click(screen.getByLabelText("Board menu"));
    fireEvent.click(screen.getByRole("menuitem", { name: "Make public" }));
    expect(mocks.commitBoardPatch).toHaveBeenCalledWith({ type: "public" });
    fireEvent.click(screen.getByRole("button", { name: "Share" }));
    expect(screen.getByRole("dialog", { name: "" })).toHaveTextContent("Sharing");
    fireEvent.click(screen.getByRole("button", { name: "Close share" }));
    fireEvent.click(screen.getByRole("button", { name: "Back to boards" }));
    expect(store.getState().whiteBoard.id).toBeNull();
  });

  it("deletes a board and clears it from the workspace", async () => {
    const store = renderWorkspace();
    fireEvent.click(screen.getByLabelText("Board menu"));
    fireEvent.click(screen.getByRole("menuitem", { name: "Delete board" }));
    expect(screen.getByRole("dialog")).toHaveTextContent("Permanent action");
    fireEvent.click(screen.getByRole("button", { name: "Delete board" }));
    await waitFor(() => expect(mocks.deleteBoard).toHaveBeenCalledWith("board"));
    expect(store.getState().whiteBoard.id).toBeNull();
  });

  it("reports delete failures and signs out", async () => {
    const store = renderWorkspace();
    mocks.deleteBoard.mockRejectedValueOnce(new Error("Delete failed"));
    fireEvent.click(screen.getByLabelText("Board menu"));
    fireEvent.click(screen.getByRole("menuitem", { name: "Delete board" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete board" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Delete failed");
    fireEvent.click(screen.getByLabelText("Dismiss error"));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    fireEvent.click(screen.getByLabelText("Board menu"));
    fireEvent.click(screen.getByRole("menuitem", { name: "Sign out" }));
    await waitFor(() => expect(mocks.signOut).toHaveBeenCalled());
    expect(store.getState().auth.isAuthenticated).toBe(false);
  });

  it("prevents viewers from renaming or destructive menu actions", () => {
    renderWorkspace("viewer");
    expect(screen.getByLabelText("Board title")).toBeDisabled();
    fireEvent.click(screen.getByLabelText("Board menu"));
    expect(screen.getByRole("menuitem", { name: "Make public" })).toBeDisabled();
    expect(screen.getByRole("menuitem", { name: "Delete board" })).toBeDisabled();
  });

  it("dismisses the board menu on outside interaction and Escape", () => {
    renderWorkspace();
    const toggle = screen.getByLabelText("Board menu");
    fireEvent.click(toggle);
    expect(screen.getByRole("menu")).toBeVisible();
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();

    fireEvent.click(toggle);
    fireEvent.pointerDown(screen.getByRole("menu"));
    expect(screen.getByRole("menu")).toBeVisible();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(screen.getByRole("menu")).toBeVisible();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(toggle).toHaveFocus();
  });

  it("collapses, restores, and resizes both editor sidebars", () => {
    renderWorkspace();
    const grid = screen.getByTestId("editor-grid");
    const layersResize = screen.getByRole("slider", { name: "Resize layers panel" });
    const propertiesResize = screen.getByRole("slider", { name: "Resize properties panel" });

    fireEvent.pointerDown(layersResize, { button: 0, clientX: 236 });
    fireEvent.pointerMove(window, { clientX: 300 });
    fireEvent.pointerUp(window);
    expect(grid.style.getPropertyValue("--layers-panel-width")).toBe("300px");

    fireEvent.keyDown(propertiesResize, { key: "ArrowLeft" });
    expect(grid.style.getPropertyValue("--properties-panel-width")).toBe("276px");

    fireEvent.click(screen.getByRole("button", { name: "Hide layers panel" }));
    expect(screen.queryByText("Layers")).not.toBeInTheDocument();
    expect(grid.style.getPropertyValue("--layers-panel-width")).toBe("0px");
    fireEvent.click(screen.getByRole("button", { name: "Show layers panel" }));
    expect(screen.getByText("Layers")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Hide properties panel" }));
    expect(screen.queryByText("Inspector")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Show properties panel" }));
    expect(screen.getByText("Inspector")).toBeInTheDocument();
  });

  it("uses stronger symmetric zoom controls", () => {
    const store = renderWorkspace();
    fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));
    expect(store.getState().editor.viewport.zoom).toBeCloseTo(1.4);
    expect(screen.getByRole("button", { name: "Reset zoom (140%)" })).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Zoom out" }));
    expect(store.getState().editor.viewport.zoom).toBeCloseTo(1);
    expect(screen.getByRole("button", { name: "Reset zoom (100%)" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Reset zoom (100%)" }));
    expect(store.getState().editor.viewport.zoom).toBe(1);
  });

  it("opens an available branch from a shared branch URL", async () => {
    window.history.replaceState({}, "", "/?board=board&branch=branch-one");
    mocks.listDesignBranches.mockResolvedValue([{ id: "branch-one", board_id: "board", name: "Exploration", room_id: "branch:one", created_by: "owner", status: "open", created_at: "", updated_at: "", merged_at: null }]);
    const store = renderWorkspace();
    await waitFor(() => expect(store.getState().whiteBoard.activeBranchId).toBe("branch-one"));
    expect(store.getState().whiteBoard).toEqual(expect.objectContaining({ roomId: "branch:one", baseRoomId: "board:board", activeBranchName: "Exploration" }));
  });

  it("removes stale branch links and keeps the main board open", async () => {
    window.history.replaceState({}, "", "/?board=board&branch=missing");
    renderWorkspace();
    expect(await screen.findByRole("alert")).toHaveTextContent("This branch is no longer available.");
    expect(new URL(window.location.href).searchParams.has("branch")).toBe(false);
  });

  it("loads each advanced workspace surface only when it is opened", async () => {
    renderWorkspace();
    for (const [button, panel] of [
      ["Comments", "Comments panel"],
      ["Assets", "Assets panel"],
      ["Prototype", "Prototype panel"],
      ["Export", "Export panel"],
      ["Inspect", "Inspect panel"],
      ["Branches", "Branches panel"],
      ["Tools", "Product panel"],
      ["Studio", "Studio panel"],
    ] as const) {
      fireEvent.click(screen.getByRole("button", { name: button }));
      expect(await screen.findByText(panel)).toBeVisible();
    }
    fireEvent.click(screen.getByLabelText("Board menu"));
    fireEvent.click(screen.getByRole("menuitem", { name: "Version history" }));
    expect(await screen.findByText("History panel")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Present" }));
    expect(await screen.findByText("Presentation view")).toBeVisible();
  });

  it.each([
    ["connecting", "Connecting"],
    ["initial", "Connecting"],
  ] as const)("shows the %s startup connection state", (status, label) => {
    mocks.connectionStatus = status;
    renderWorkspace();
    expect(screen.getByText(label)).toBeVisible();
  });

  it("reports every save state and dismisses persisted save errors", () => {
    mocks.syncStatus = "synchronizing";
    renderWorkspace();
    expect(screen.getByText("Saving")).toBeVisible();
    cleanup();

    mocks.syncStatus = "synchronized";
    const store = renderWorkspace();
    act(() => store.dispatch(setSaveStatus({ status: "saving" })));
    expect(screen.getByText("Saving")).toBeVisible();
    act(() => store.dispatch(setSaveStatus({ status: "saved" })));
    expect(screen.getByText("Saved")).toBeVisible();
    act(() => store.dispatch(setSaveStatus({ status: "error", error: "Sync failed" })));
    expect(screen.getByRole("alert")).toHaveTextContent("Sync failed");
    fireEvent.click(screen.getByLabelText("Dismiss error"));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(store.getState().editor.saveStatus).toBe("idle");
  });

  it("opens selection deep links, ignores missing targets, and handles repeated links once", async () => {
    const target: Shape = {
      id: "target", type: "rectangle", name: "Target", x1: 100, y1: 200, x2: 300, y2: 400,
      width: 200, height: 200, level: 0, zIndex: 1,
    };
    window.history.replaceState({}, "", "/?board=board&selection=target");
    const store = renderWorkspace("owner", { board: { shapes: [target] } });
    await waitFor(() => expect(store.getState().selected.selectedShapes).toEqual(["target"]));
    expect(store.getState().editor.viewport).toEqual({ x: -300, y: -50, zoom: 1 });
    act(() => store.dispatch(setWhiteboardData({ shapes: [{ ...target, name: "Updated" }] })));
    expect(store.getState().selected.selectedShapes).toEqual(["target"]);
    cleanup();

    window.history.replaceState({}, "", "/?board=board&selection=missing");
    const missing = renderWorkspace("owner", { board: { shapes: [target] } });
    expect(missing.getState().selected.selectedShapes).toEqual([]);
  });

  it("guards branch links and ignores branch results after unmount", async () => {
    window.history.replaceState({}, "", "/?board=board&branch=active");
    renderWorkspace("owner", { board: { activeBranchId: "active", activeBranchName: "Current" } });
    expect(mocks.listDesignBranches).not.toHaveBeenCalled();
    cleanup();

    let resolveBranches: (branches: never[]) => void = () => undefined;
    mocks.listDesignBranches.mockImplementationOnce(() => new Promise((resolve) => { resolveBranches = resolve; }));
    renderWorkspace();
    cleanup();
    await act(async () => { resolveBranches([]); await Promise.resolve(); });

    window.history.replaceState({}, "", "/?branch=ignored");
    renderWorkspace("owner", { board: { id: null, roomId: null, baseRoomId: null } });
    expect(mocks.listDesignBranches).toHaveBeenCalledTimes(1);
  });

  it("ignores rejected branch requests after unmount", async () => {
    window.history.replaceState({}, "", "/?board=board&branch=late");
    let rejectBranches: (reason: unknown) => void = () => undefined;
    mocks.listDesignBranches.mockImplementationOnce(() => new Promise((_, reject) => { rejectBranches = reject; }));
    renderWorkspace();
    cleanup();
    await act(async () => { rejectBranches(new Error("late failure")); await Promise.resolve(); });
  });

  it.each([
    [{ baseRoomId: "base:configured", roomId: "branch:current" }, "base:configured"],
    [{ baseRoomId: null, roomId: "branch:current" }, "branch:current"],
    [{ baseRoomId: null, roomId: null }, "board:board"],
  ] as const)("resolves the branch base room fallback", async (boardPatch, expectedBaseRoomId) => {
    window.history.replaceState({}, "", "/?board=board&branch=open");
    mocks.listDesignBranches.mockResolvedValueOnce([{ id: "open", board_id: "board", name: "Open", room_id: "branch:open", created_by: "owner", status: "open", created_at: "", updated_at: "", merged_at: null }]);
    const store = renderWorkspace("owner", { board: boardPatch });
    await waitFor(() => expect(store.getState().whiteBoard.activeBranchId).toBe("open"));
    expect(store.getState().whiteBoard.baseRoomId).toBe(expectedBaseRoomId);
  });

  it.each([
    [new Error("Branch failed"), "Branch failed"],
    ["offline", "This branch could not be opened."],
  ])("reports branch loading failures", async (failure, message) => {
    window.history.replaceState({}, "", "/?board=board&branch=broken");
    mocks.listDesignBranches.mockRejectedValueOnce(failure);
    renderWorkspace();
    expect(await screen.findByRole("alert")).toHaveTextContent(message as string);
  });

  it("handles every panel resize input and mobile collapse path", async () => {
    const desktop = renderWorkspace();
    const grid = screen.getByTestId("editor-grid");
    const layers = screen.getByRole("slider", { name: "Resize layers panel" });
    const properties = screen.getByRole("slider", { name: "Resize properties panel" });

    fireEvent.pointerMove(window, { clientX: 10 });
    fireEvent.pointerDown(layers, { button: 1, clientX: 236 });
    fireEvent.pointerMove(window, { clientX: 400 });
    expect(grid.style.getPropertyValue("--layers-panel-width")).toBe("236px");
    fireEvent.keyDown(layers, { key: "Home" });
    fireEvent.keyDown(layers, { key: "ArrowRight" });
    expect(grid.style.getPropertyValue("--layers-panel-width")).toBe("244px");
    fireEvent.pointerDown(properties, { button: 0, clientX: 268 });
    fireEvent.pointerMove(window, { clientX: 200 });
    expect(grid.style.getPropertyValue("--properties-panel-width")).toBe("336px");
    fireEvent.pointerCancel(window);
    fireEvent.doubleClick(layers);
    fireEvent.doubleClick(properties);
    expect(grid.style.getPropertyValue("--layers-panel-width")).toBe("236px");
    expect(grid.style.getPropertyValue("--properties-panel-width")).toBe("268px");
    expect(desktop.getState().editor.rightPanel).toBe("properties");
    cleanup();

    Object.defineProperty(window, "innerWidth", { configurable: true, value: 600 });
    const mobile = renderWorkspace();
    expect(screen.queryByText("Layers")).not.toBeInTheDocument();
    expect(screen.queryByText("Inspector")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Comments" }));
    expect(await screen.findByText("Comments panel")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Hide properties panel" }));
    expect(mobile.getState().editor.rightPanel).toBe("properties");
    expect(screen.queryByText("Inspector")).not.toBeInTheDocument();
  });

  it("tracks collaborators, unread comments, and both spotlight states", () => {
    mocks.unreadCommentCount = 3;
    const store = renderWorkspace("owner", { board: { currentUsers: [{ uid: "guest", cursorX: null, cursorY: null }] } });
    expect(screen.getByText("3")).toBeVisible();
    expect(screen.getByRole("button", { name: "Follow collaborator" })).toHaveTextContent("C");
    fireEvent.click(screen.getByRole("button", { name: "Follow collaborator" }));
    expect(screen.getByText("Following presenter")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Stop following" }));
    expect(store.getState().editor.followingUserId).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Spotlight" }));
    expect(mocks.updateMyPresence).toHaveBeenCalledWith({ spotlight: true });
    expect(mocks.broadcastEvent).toHaveBeenCalledWith({ type: "SPOTLIGHT_START", presenterId: "owner" });
    cleanup();

    mocks.spotlight = true;
    renderWorkspace();
    fireEvent.click(screen.getByRole("button", { name: "Stop spotlight" }));
    expect(mocks.broadcastEvent).toHaveBeenLastCalledWith({ type: "SPOTLIGHT_STOP", presenterId: "owner" });
  });

  it("handles signed-out actions and sign-out failures without leaking rejections", async () => {
    const signedOut = renderWorkspace("owner", { authenticated: false });
    expect(screen.getByTitle("You are here")).toHaveTextContent("Y");
    fireEvent.click(screen.getByRole("button", { name: "Spotlight" }));
    expect(mocks.updateMyPresence).not.toHaveBeenCalled();
    fireEvent.click(screen.getByLabelText("Board menu"));
    fireEvent.click(screen.getByRole("menuitem", { name: "Delete board" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete board" }));
    expect(mocks.deleteBoard).not.toHaveBeenCalled();
    expect(signedOut.getState().whiteBoard.id).toBe("board");
    cleanup();

    mocks.signOut.mockRejectedValueOnce(new Error("Sign-out failed"));
    renderWorkspace();
    fireEvent.click(screen.getByLabelText("Board menu"));
    fireEvent.click(screen.getByRole("menuitem", { name: "Sign out" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Sign-out failed");
    cleanup();

    mocks.signOut.mockRejectedValueOnce("offline");
    renderWorkspace();
    fireEvent.click(screen.getByLabelText("Board menu"));
    fireEvent.click(screen.getByRole("menuitem", { name: "Sign out" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("We couldn't sign you out.");
  });

  it("renders delete impact details, closes from the backdrop, and handles non-Error failures", async () => {
    mocks.loadProductGraph.mockResolvedValueOnce({
      sourceId: "board", nodes: [],
      incoming: [{ sourceId: "source", targetId: "board", shapeId: "incoming" }],
      edges: [{ sourceId: "board", targetId: "target", shapeId: "outgoing" }],
    });
    renderWorkspace();
    fireEvent.click(screen.getByLabelText("Board menu"));
    fireEvent.click(screen.getByRole("menuitem", { name: "Delete board" }));
    expect(await screen.findByText(/1 incoming board link will become broken/)).toHaveTextContent("1 outgoing links will be removed.");
    const dialog = screen.getByRole("dialog");
    fireEvent.pointerDown(dialog);
    expect(dialog).toBeInTheDocument();
    fireEvent.pointerDown(dialog.parentElement!);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    cleanup();

    mocks.deleteBoard.mockRejectedValueOnce("offline");
    renderWorkspace();
    fireEvent.click(screen.getByLabelText("Board menu"));
    fireEvent.click(screen.getByRole("menuitem", { name: "Delete board" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete board" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("We couldn't delete this board.");
  });

  it("handles public visibility, graph failures, missing board ids, and plural delete impact", async () => {
    mocks.loadProductGraph.mockRejectedValueOnce(new Error("Graph unavailable"));
    renderWorkspace("owner", { board: { type: "public" } });
    fireEvent.click(screen.getByLabelText("Board menu"));
    fireEvent.click(screen.getByRole("menuitem", { name: "Make private" }));
    expect(mocks.commitBoardPatch).toHaveBeenCalledWith({ type: "private" });
    fireEvent.click(screen.getByLabelText("Board menu"));
    fireEvent.click(screen.getByRole("menuitem", { name: "Delete board" }));
    await act(async () => { await Promise.resolve(); });
    expect(screen.queryByText(/incoming board/)).not.toBeInTheDocument();
    cleanup();

    mocks.loadProductGraph.mockResolvedValueOnce({
      sourceId: "board", nodes: [], edges: [],
      incoming: [
        { sourceId: "one", targetId: "board", shapeId: "one" },
        { sourceId: "two", targetId: "board", shapeId: "two" },
      ],
    });
    renderWorkspace();
    fireEvent.click(screen.getByLabelText("Board menu"));
    fireEvent.click(screen.getByRole("menuitem", { name: "Delete board" }));
    expect(await screen.findByText(/2 incoming board links will become broken/)).toBeVisible();
    cleanup();

    renderWorkspace("owner", { board: { id: null, roomId: null, baseRoomId: null } });
    fireEvent.click(screen.getByLabelText("Board menu"));
    fireEvent.click(screen.getByRole("menuitem", { name: "Delete board" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete board" }));
    expect(mocks.deleteBoard).not.toHaveBeenCalled();
    expect(mocks.loadProductGraph).toHaveBeenCalledTimes(2);
  });

  it("uses fallback history keys when the board and branch are not loaded", async () => {
    renderWorkspace("owner", { board: { id: null, roomId: null, baseRoomId: null, activeBranchId: null } });
    fireEvent.click(screen.getByLabelText("Board menu"));
    fireEvent.click(screen.getByRole("menuitem", { name: "Version history" }));
    expect(await screen.findByText("History panel")).toBeVisible();
  });

  it("normalizes untitled names, preserves viewer titles, and exercises keyboard title commits", () => {
    renderWorkspace("owner", { board: { title: null } });
    const untitled = screen.getByLabelText("Board title");
    expect(untitled).toHaveValue("Untitled board");
    fireEvent.change(untitled, { target: { value: "   " } });
    fireEvent.keyDown(untitled, { key: "Escape" });
    fireEvent.focus(untitled);
    fireEvent.keyDown(untitled, { key: "Enter" });
    fireEvent.blur(untitled);
    expect(mocks.commitBoardPatch).toHaveBeenCalledWith({ title: "Untitled board" });
    cleanup();

    renderWorkspace("viewer", { board: { title: null } });
    fireEvent.blur(screen.getByLabelText("Board title"));
    expect(screen.getByLabelText("Board title")).toHaveValue("Untitled board");
  });
});
