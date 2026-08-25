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
  updateRole: vi.fn(), transfer: vi.fn(), leave: vi.fn(), cancelInvite: vi.fn(), resendInvite: vi.fn(),
  createLink: vi.fn(), loadRequests: vi.fn(), loadLinks: vi.fn(), resolveRequest: vi.fn(), revokeLink: vi.fn(),
  clipboard: vi.fn(),
}));

vi.mock("../../services/collaboratorRepository", () => ({
  listBoardCollaborators: mocks.list,
  getBoardSharingOverview: mocks.plan,
  inviteBoardCollaborator: mocks.invite,
  inviteBoardFriend: mocks.inviteFriend,
  removeBoardCollaborator: mocks.remove,
  updateBoardCollaboratorRole: mocks.updateRole,
  transferBoardOwnership: mocks.transfer,
  leaveSharedBoard: mocks.leave,
  cancelBoardInvitation: mocks.cancelInvite,
  resendBoardInvitation: mocks.resendInvite,
}));
vi.mock("../../services/socialRepository", () => ({ listFriendships: mocks.friendships }));
vi.mock("../../services/productRepository", () => ({
  createShareLink: mocks.createLink,
  loadAccessRequests: mocks.loadRequests,
  loadShareLinks: mocks.loadLinks,
  resolveAccessRequest: mocks.resolveRequest,
  revokeShareLink: mocks.revokeLink,
}));

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
    mocks.plan.mockResolvedValue({ plan: linkedPlan, invitations: [] });
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
    mocks.updateRole.mockResolvedValue({ uid: "member", role: "editor" });
    mocks.transfer.mockResolvedValue({ transferred: true, newOwnerId: "member" });
    mocks.leave.mockResolvedValue({ left: true });
    mocks.cancelInvite.mockResolvedValue({ cancelled: true });
    mocks.resendInvite.mockResolvedValue({ resent: true, url: "https://kumo.test/?invite=fresh", delivery: "link-only" });
    mocks.loadRequests.mockResolvedValue([]);
    mocks.loadLinks.mockResolvedValue([]);
    mocks.createLink.mockResolvedValue({ token: "secure", url: "https://kumo.test/?share=secure" });
    mocks.resolveRequest.mockResolvedValue({ resolved: true });
    mocks.revokeLink.mockResolvedValue(undefined);
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
    mocks.plan.mockResolvedValueOnce({ plan: { ...linkedPlan, truncated: true }, invitations: [] });
    renderDialog();
    await screen.findByLabelText("Share linked boards");
    const option = screen.getByRole("checkbox");
    expect(option).toBeDisabled();
    expect(screen.getByRole("alert")).toHaveTextContent("only allow direct-board sharing");
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "new@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Share" }));
    await waitFor(() => expect(mocks.invite).toHaveBeenCalledWith("board", "new@example.com", "editor", false));
  });

  it("updates collaborator roles and transfers ownership", async () => {
    renderDialog();
    const role = await screen.findByLabelText("Role for Member");
    fireEvent.change(role, { target: { value: "editor" } });
    await waitFor(() => expect(mocks.updateRole).toHaveBeenCalledWith("board", "member", "editor", true));
    fireEvent.click(screen.getByRole("button", { name: "Make owner" }));
    await waitFor(() => expect(mocks.transfer).toHaveBeenCalledWith("board", "member"));
    expect(screen.getByRole("status")).toHaveTextContent("Member is now the owner");
  });

  it("resends, copies, and cancels pending email invitations", async () => {
    mocks.plan.mockResolvedValueOnce({ plan: linkedPlan, invitations: [{ id: "invite", email: "pending@example.com", role: "viewer", status: "pending", expires_at: "2026-09-01", last_sent_at: "", created_at: "" }] });
    renderDialog();
    expect(await screen.findByText("pending@example.com")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Resend" }));
    await waitFor(() => expect(mocks.resendInvite).toHaveBeenCalledWith("board", "invite"));
    fireEvent.click(screen.getByRole("button", { name: "Copy" }));
    await waitFor(() => expect(mocks.clipboard).toHaveBeenCalledWith("https://kumo.test/?invite=fresh"));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(mocks.cancelInvite).toHaveBeenCalledWith("board", "invite"));
    expect(screen.queryByText("pending@example.com")).not.toBeInTheDocument();
  });

  it("creates and revokes governed links and resolves access requests", async () => {
    mocks.loadLinks.mockResolvedValueOnce([{ id: "link", board_id: "board", role: "viewer", allowed_domain: "example.com", expires_at: "2026-09-01", last_used_at: null, revoked_at: null, created_at: "" }]);
    mocks.loadRequests.mockResolvedValueOnce([{ id: "request", board_id: "board", requester_id: "requester", requested_role: "editor", status: "pending", message: "Let me in", profiles: { display_name: "Ada", avatar_url: null } }]);
    renderDialog();
    expect(await screen.findByText("Access requests")).toBeVisible();
    fireEvent.change(screen.getByLabelText("Expires in days"), { target: { value: "30" } });
    fireEvent.change(screen.getByPlaceholderText("example.com"), { target: { value: "studio.test" } });
    fireEvent.click(screen.getByRole("button", { name: "Create secure link" }));
    await waitFor(() => expect(mocks.createLink).toHaveBeenCalledWith("board", expect.objectContaining({ role: "editor", allowedDomain: "studio.test", expiresAt: expect.any(String) })));
    fireEvent.click(screen.getByRole("button", { name: "Revoke" }));
    await waitFor(() => expect(mocks.revokeLink).toHaveBeenCalledWith("link"));
    fireEvent.click(screen.getByRole("button", { name: "Approve" }));
    await waitFor(() => expect(mocks.resolveRequest).toHaveBeenCalledWith("request", "approved"));
  });

  it("lets viewers leave and closes from the backdrop", async () => {
    const { store, onClose } = renderDialog(vi.fn(), "viewer");
    await screen.findByText("Only the board owner can invite or remove collaborators.");
    fireEvent.click(screen.getByRole("button", { name: /Leave board/ }));
    await waitFor(() => expect(mocks.leave).toHaveBeenCalledWith("board"));
    expect(store.getState().whiteBoard.id).toBeNull();
    expect(onClose).toHaveBeenCalled();
  });

  it("reports blocked clipboard access", async () => {
    mocks.clipboard.mockRejectedValueOnce(new Error("blocked"));
    renderDialog();
    fireEvent.click(screen.getByRole("button", { name: "Copy link" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("browser blocked clipboard");
  });
});
