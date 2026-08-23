import { configureStore } from "@reduxjs/toolkit";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Provider } from "react-redux";
import actionsReducer from "../../features/actions/actionsSlice";
import authReducer, { login } from "../../features/auth/authSlice";
import editorReducer from "../../features/editor/editorSlice";
import selectedReducer from "../../features/selected/selectedSlice";
import whiteBoardReducer, { setWhiteboardData } from "../../features/whiteBoard/whiteBoardSlice";
import ShareDialog from "./ShareDialog";

const mocks = vi.hoisted(() => ({ getIdToken: vi.fn() }));
vi.mock("../../config/firebase", () => ({
  auth: { currentUser: { getIdToken: mocks.getIdToken } },
}));

const renderDialog = (onClose = vi.fn(), role: "owner" | "viewer" = "owner") => {
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
    id: "board", title: "Kumo", role, uid: "owner", sharedWith: ["member"],
    members: { owner: "owner", member: "viewer" },
  }));
  render(<Provider store={store}><ShareDialog onClose={onClose} /></Provider>);
  return { store, onClose };
};

describe("ShareDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getIdToken.mockResolvedValue("token");
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => vi.unstubAllGlobals());

  it("invites and removes collaborators with authenticated requests", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response(JSON.stringify({ uid: "new", role: "editor" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({}), { status: 200 }));
    const { store } = renderDialog();
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "new@example.com" } });
    fireEvent.submit(screen.getByRole("button", { name: "Invite" }).closest("form")!);
    expect(await screen.findByRole("status")).toHaveTextContent("can now edit");
    expect(store.getState().whiteBoard.members.new).toBe("editor");
    fireEvent.click(screen.getAllByRole("button", { name: "Remove" })[0]!);
    await waitFor(() => expect(store.getState().whiteBoard.members.member).toBeUndefined());
    expect(fetch).toHaveBeenCalledWith("/api/share-board", expect.objectContaining({
      headers: expect.objectContaining({ Authorization: "Bearer token" }),
    }));
  });

  it("reports API and missing-session failures", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ error: "No access" }), { status: 403 }));
    renderDialog();
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "new@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Invite" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("No access");
    mocks.getIdToken.mockResolvedValueOnce(undefined);
    fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Sign in again");
  });

  it("closes on Escape and hides owner controls from viewers", () => {
    const onClose = vi.fn();
    renderDialog(onClose, "viewer");
    expect(screen.getByText(/Only the board owner/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Invite" })).not.toBeInTheDocument();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });
});
