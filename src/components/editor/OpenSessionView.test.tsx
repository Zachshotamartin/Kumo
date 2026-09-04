import { configureStore } from "@reduxjs/toolkit";
import { fireEvent, render, screen } from "@testing-library/react";
import { Provider } from "react-redux";
import actionsReducer from "../../features/actions/actionsSlice";
import authReducer from "../../features/auth/authSlice";
import editorReducer from "../../features/editor/editorSlice";
import selectedReducer from "../../features/selected/selectedSlice";
import whiteBoardReducer from "../../features/whiteBoard/whiteBoardSlice";
import { redeemOpenSession } from "../../services/platformRepository";
import { forgetOpenSessionPassword, openSessionPassword } from "../../collaboration/openSession";
import OpenSessionView from "./OpenSessionView";

vi.mock("../../services/platformRepository", () => ({ redeemOpenSession: vi.fn() }));
vi.mock("../brand/KumoLogo", () => ({ default: () => <div data-testid="kumo-logo" /> }));
vi.mock("../workSpace/workSpace", () => ({ default: () => <div>Authenticated workspace</div> }));
const mockedRedeem = vi.mocked(redeemOpenSession);

const renderSession = () => {
  const store = configureStore({ reducer: { auth: authReducer, whiteBoard: whiteBoardReducer, actions: actionsReducer, selected: selectedReducer, editor: editorReducer } });
  render(<Provider store={store}><OpenSessionView token="open-token" /></Provider>);
  return store;
};

const session = {
  id: "session", boardId: "board", title: "Open workshop", roomId: "board:board", ownerId: "owner",
  visibility: "private" as const, role: "editor" as const, expiresAt: "2030-01-01T00:00:00.000Z",
  guestId: "guest:abc", updatedAt: 42,
};

describe("open board sessions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    forgetOpenSessionPassword("open-token");
    sessionStorage.setItem("kumo:open-session-guest:open-token", "0123456789abcdef");
  });

  it("redeems the token, establishes a scoped guest identity, and opens the workspace", async () => {
    mockedRedeem.mockResolvedValue(session);
    const store = renderSession();
    expect(screen.getByRole("status")).toHaveTextContent("Joining open board");
    expect(await screen.findByText("Authenticated workspace")).toBeVisible();
    expect(mockedRedeem).toHaveBeenCalledWith("open-token", "", "0123456789abcdef");
    expect(store.getState().auth).toEqual(expect.objectContaining({ isAuthenticated: true, uid: "guest:abc", displayName: "Kumo guest" }));
    expect(store.getState().whiteBoard).toEqual(expect.objectContaining({ id: "board", role: "editor", roomId: "board:board" }));
  });

  it("prompts for a password and retries without leaking it into the URL", async () => {
    mockedRedeem.mockRejectedValueOnce(new Error("A password is required.")).mockResolvedValueOnce(session);
    renderSession();
    expect(await screen.findByText("Enter the password the host shared with you.")).toBeVisible();
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "shared-secret" } });
    fireEvent.click(screen.getByRole("button", { name: "Join board" }));
    expect(await screen.findByText("Authenticated workspace")).toBeVisible();
    expect(mockedRedeem).toHaveBeenLastCalledWith("open-token", "shared-secret", "0123456789abcdef");
    expect(window.location.href).not.toContain("shared-secret");
    expect(openSessionPassword("open-token")).toBe("shared-secret");
    expect(JSON.stringify({ ...sessionStorage })).not.toContain("shared-secret");
  });

  it("shows revoked or expired session errors without a password form", async () => {
    mockedRedeem.mockRejectedValue(new Error("This open session has expired."));
    renderSession();
    expect(await screen.findByRole("alert")).toHaveTextContent("expired");
    expect(screen.getByText("This link may have expired or been revoked.")).toBeVisible();
    expect(screen.queryByLabelText("Password")).not.toBeInTheDocument();
  });

  it("uses a safe message when session redemption rejects with a non-error value", async () => {
    mockedRedeem.mockRejectedValue("offline");
    renderSession();
    expect(await screen.findByRole("alert")).toHaveTextContent("This open session could not be joined.");
  });
});
