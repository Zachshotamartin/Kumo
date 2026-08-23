import { configureStore } from "@reduxjs/toolkit";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Provider } from "react-redux";
import actionsReducer from "../../features/actions/actionsSlice";
import authReducer, { login } from "../../features/auth/authSlice";
import editorReducer from "../../features/editor/editorSlice";
import selectedReducer from "../../features/selected/selectedSlice";
import whiteBoardReducer, { setWhiteboardData } from "../../features/whiteBoard/whiteBoardSlice";
import EditorWorkspace from "./EditorWorkspace";

const mocks = vi.hoisted(() => ({
  commitBoardPatch: vi.fn(),
  deleteBoard: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock("@liveblocks/react", () => ({ useSyncStatus: () => "synchronized" }));
vi.mock("../../editor/useEditorActions", () => ({
  useEditorActions: () => ({ commitBoardPatch: mocks.commitBoardPatch }),
}));
vi.mock("../../services/boardRepository", () => ({ deleteBoard: mocks.deleteBoard }));
vi.mock("firebase/auth", () => ({ signOut: mocks.signOut }));
vi.mock("../../config/firebase", () => ({ auth: {} }));
vi.mock("./EditorCanvas", () => ({ default: () => <div>Canvas</div> }));
vi.mock("./EditorToolbar", () => ({ default: () => <div>Toolbar</div> }));
vi.mock("./InspectorPanel", () => ({ default: () => <div>Inspector</div> }));
vi.mock("./LayersPanel", () => ({ default: () => <div>Layers</div> }));
vi.mock("./ShareDialog", () => ({ default: ({ onClose }: { onClose: () => void }) => (
  <div role="dialog">Sharing<button onClick={onClose}>Close share</button></div>
) }));

const renderWorkspace = (role: "owner" | "viewer" = "owner") => {
  const store = configureStore({
    reducer: {
      auth: authReducer,
      whiteBoard: whiteBoardReducer,
      actions: actionsReducer,
      selected: selectedReducer,
      editor: editorReducer,
    },
  });
  store.dispatch(login({ uid: "owner", email: "owner@example.com" }));
  store.dispatch(setWhiteboardData({
    id: "board", roomId: "board:board", role, type: "private", title: "Original",
    uid: "owner", members: { owner: "owner", collaborator: "editor" },
    currentUsers: [{ uid: "owner", label: "Owner", cursorX: null, cursorY: null }],
  }));
  render(<Provider store={store}><EditorWorkspace /></Provider>);
  return store;
};

describe("EditorWorkspace", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.deleteBoard.mockResolvedValue(undefined);
    mocks.signOut.mockResolvedValue(undefined);
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
  });
});
