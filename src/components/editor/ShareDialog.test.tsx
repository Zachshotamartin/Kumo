import { configureStore } from "@reduxjs/toolkit";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Provider } from "react-redux";
import actionsReducer from "../../features/actions/actionsSlice";
import authReducer, { login } from "../../features/auth/authSlice";
import editorReducer from "../../features/editor/editorSlice";
import selectedReducer from "../../features/selected/selectedSlice";
import whiteBoardReducer, { setWhiteboardData } from "../../features/whiteBoard/whiteBoardSlice";
import ShareDialog from "./ShareDialog";

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  plan: vi.fn(),
  invite: vi.fn(),
  inviteFriend: vi.fn(),
  friendships: vi.fn(),
  remove: vi.fn(),
  clipboard: vi.fn(),
}));

vi.mock("../../services/collaboratorRepository", () => ({
  listBoardCollaborators: mocks.list,
  getBoardSharePlan: mocks.plan,
  inviteBoardCollaborator: mocks.invite,
  inviteBoardFriend: mocks.inviteFriend,
  removeBoardCollaborator: mocks.remove,
}));
vi.mock("../../services/socialRepository", () => ({ listFriendships: mocks.friendships }));

const linkedPlan = {
  truncated: false,
  boards: [
    { id: "board", title: "Kumo", visibility: "private", depth: 0, ownerId: "owner", manageable: true },
    { id: "linked", title: "Roadmap", visibility: "private", depth: 1, ownerId: "owner", manageable: true },
    { id: "external", title: "Partner", visibility: "private", depth: 1, ownerId: "other", manageable: false },
  ],
};

const people = [
  { id: "owner", email: "owner@example.com", name: "Owner", avatar: "", role: "owner" as const },
  { id: "member", email: "member@example.com", name: "Member", avatar: "", role: "viewer" as const },
];

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
    mocks.list.mockResolvedValue(people);
    mocks.plan.mockResolvedValue(linkedPlan);
    mocks.invite.mockResolvedValue({
      uid: "new", email: "new@example.com", role: "editor",
      name: "New person", avatar: null,
      sharedBoards: linkedPlan.boards.slice(0, 2), unavailableBoards: linkedPlan.boards.slice(2),
    });
    mocks.inviteFriend.mockResolvedValue({
      uid: "friend", email: "friend@example.com", name: "Alex", avatar: null, role: "editor",
      sharedBoards: linkedPlan.boards.slice(0, 2), unavailableBoards: [],
    });
    mocks.friendships.mockResolvedValue({
      friends: [{ id: "friend", displayName: "Alex", username: "alex", bio: "", avatarUrl: null, relationship: "friend" }],
      incoming: [], outgoing: [], blocked: [],
    });
    mocks.remove.mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: mocks.clipboard } });
    mocks.clipboard.mockResolvedValue(undefined);
  });

  it("shares with an accepted friend without requiring their email", async () => {
    const { store } = renderDialog();
    const shareButton = await screen.findByRole("button", { name: "Share as editor" });
    fireEvent.click(shareButton);
    await waitFor(() => expect(mocks.inviteFriend).toHaveBeenCalledWith("board", "friend", "editor", true));
    expect(store.getState().whiteBoard.members.friend).toBe("editor");
    expect(screen.getByRole("status")).toHaveTextContent("Alex can now edit 2 connected boards");
  });

  it("shows the linked access plan, shares managed destinations, and removes collaborators", async () => {
    const { store } = renderDialog();
    expect(await screen.findByText(/Include 1 linked board/)).toBeInTheDocument();
    expect(screen.getByText(/another owner/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "new@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Share" }));
    expect(await screen.findByRole("status")).toHaveTextContent("2 connected boards");
    expect(mocks.invite).toHaveBeenCalledWith("board", "new@example.com", "editor", true);
    expect(store.getState().whiteBoard.members.new).toBe("editor");
    fireEvent.click(screen.getByRole("button", { name: "Remove Member" }));
    await waitFor(() => expect(store.getState().whiteBoard.members.member).toBeUndefined());
    expect(mocks.remove).toHaveBeenCalledWith("board", "member", true);
  });

  it("copies a direct access-controlled board link", async () => {
    renderDialog();
    fireEvent.click(screen.getByRole("button", { name: "Copy link" }));
    await waitFor(() => expect(mocks.clipboard).toHaveBeenCalledWith(expect.stringContaining("board=board")));
    expect(screen.getByRole("button", { name: "Copied" })).toBeInTheDocument();
  });

  it("reports API failures", async () => {
    mocks.invite.mockRejectedValueOnce(new Error("No access"));
    renderDialog();
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "new@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Share" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("No access");
  });

  it("closes on Escape and hides owner controls from viewers", async () => {
    const onClose = vi.fn();
    renderDialog(onClose, "viewer");
    expect(screen.getByText(/Only the board owner/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Share" })).not.toBeInTheDocument();
    await waitFor(() => expect(mocks.list).toHaveBeenCalled());
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });

  it("falls back to direct sharing when the connected graph exceeds the safe bound", async () => {
    mocks.plan.mockResolvedValueOnce({ ...linkedPlan, truncated: true });
    renderDialog();
    await screen.findByLabelText("Share linked boards");
    const option = screen.getByRole("checkbox");
    expect(option).toBeDisabled();
    expect(screen.getByRole("alert")).toHaveTextContent("only allow direct-board sharing");
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "new@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Share" }));
    await waitFor(() => expect(mocks.invite).toHaveBeenCalledWith("board", "new@example.com", "editor", false));
  });
});
