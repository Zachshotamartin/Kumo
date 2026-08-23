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
});
