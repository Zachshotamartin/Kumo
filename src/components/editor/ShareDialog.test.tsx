import { configureStore } from "@reduxjs/toolkit";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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
  updateRole: vi.fn(), transfer: vi.fn(), leave: vi.fn(), cancelInvite: vi.fn(), refreshInvite: vi.fn(),
  createLink: vi.fn(), loadRequests: vi.fn(), loadLinks: vi.fn(), resolveRequest: vi.fn(), revokeLink: vi.fn(),
  loadOpenSessions: vi.fn(), createOpenSession: vi.fn(), revokeOpenSession: vi.fn(),
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
  refreshBoardInvitation: mocks.refreshInvite,
}));
vi.mock("../../services/socialRepository", () => ({ listFriendships: mocks.friendships }));
vi.mock("../../services/productRepository", () => ({
  createShareLink: mocks.createLink,
  loadAccessRequests: mocks.loadRequests,
  loadShareLinks: mocks.loadLinks,
  resolveAccessRequest: mocks.resolveRequest,
  revokeShareLink: mocks.revokeLink,
}));
vi.mock("../../services/platformRepository", () => ({
  loadOpenSessions: mocks.loadOpenSessions,
  createOpenSession: mocks.createOpenSession,
  revokeOpenSession: mocks.revokeOpenSession,
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

const renderDialog = (onClose = vi.fn(), role: "owner" | "viewer" = "owner", boardOverrides: Record<string, unknown> = {}) => {
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
    ...boardOverrides,
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
    mocks.refreshInvite.mockResolvedValue({ refreshed: true, url: "https://kumo.test/?invite=fresh" });
    mocks.loadRequests.mockResolvedValue([]);
    mocks.loadLinks.mockResolvedValue([]);
    mocks.createLink.mockResolvedValue({ token: "secure", url: "https://kumo.test/?share=secure" });
    mocks.resolveRequest.mockResolvedValue({ resolved: true });
    mocks.revokeLink.mockResolvedValue(undefined);
    mocks.loadOpenSessions.mockResolvedValue([]);
    mocks.createOpenSession.mockResolvedValue({
      session: { id: "open-new", board_id: "board", role: "editor", expires_at: "2030-01-01T00:00:00.000Z", revoked_at: null, use_count: 0, created_at: "now" },
      token: "open-token", url: "https://kumo.test/?openSession=open-token",
    });
    mocks.revokeOpenSession.mockResolvedValue({ revoked: true });
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: mocks.clipboard } });
    mocks.clipboard.mockResolvedValue(undefined);
  });

  afterEach(() => vi.useRealTimers());

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

  it("refreshes, copies, and cancels pending invitation links", async () => {
    mocks.plan.mockResolvedValueOnce({ plan: linkedPlan, invitations: [
      { id: "invite", email: "pending@example.com", role: "viewer", status: "pending", expires_at: "2026-09-01", last_sent_at: "", created_at: "" },
      { id: "second", email: "editor@example.com", role: "editor", status: "pending", expires_at: "2026-09-01", last_sent_at: "", created_at: "" },
    ] });
    renderDialog();
    expect(await screen.findByText("pending@example.com")).toBeVisible();
    fireEvent.click(screen.getAllByRole("button", { name: "Refresh link" })[0]!);
    await waitFor(() => expect(mocks.refreshInvite).toHaveBeenCalledWith("board", "invite"));
    fireEvent.click(screen.getAllByRole("button", { name: "Refresh link" })[1]!);
    await waitFor(() => expect(mocks.refreshInvite).toHaveBeenCalledWith("board", "second"));
    fireEvent.click(screen.getByRole("button", { name: "Copy" }));
    await waitFor(() => expect(mocks.clipboard).toHaveBeenCalledWith("https://kumo.test/?invite=fresh"));
    fireEvent.click(screen.getAllByRole("button", { name: "Cancel" })[0]!);
    await waitFor(() => expect(mocks.cancelInvite).toHaveBeenCalledWith("board", "invite"));
    expect(screen.queryByText("pending@example.com")).not.toBeInTheDocument();
    expect(screen.getByText("editor@example.com")).toBeVisible();
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

  it("creates password-protected guest sessions, copies the URL, and revokes them", async () => {
    mocks.loadOpenSessions.mockResolvedValueOnce([{ id: "open-existing", board_id: "board", role: "viewer", expires_at: "2030-02-01T00:00:00.000Z", revoked_at: null, use_count: 3, created_at: "now" }]);
    renderDialog();
    const heading = await screen.findByRole("heading", { name: "Temporary open session" });
    const section = heading.closest("section")!;
    expect(within(section).getByText(/3 joins/)).toBeVisible();
    fireEvent.change(within(section).getByLabelText("Guest role"), { target: { value: "editor" } });
    const create = within(section).getByRole("button", { name: "Create open session" });
    expect(create).toBeDisabled();
    fireEvent.change(within(section).getByLabelText("Expires in hours"), { target: { value: "999" } });
    fireEvent.change(within(section).getByLabelText("Password (required)"), { target: { value: "guest-secret" } });
    fireEvent.click(create);
    await waitFor(() => expect(mocks.createOpenSession).toHaveBeenCalledWith("board", expect.objectContaining({ role: "editor", password: "guest-secret", expiresAt: expect.any(String) })));
    const expiresAt = new Date(mocks.createOpenSession.mock.calls[0]?.[1].expiresAt).getTime();
    expect(expiresAt - Date.now()).toBeLessThanOrEqual(168 * 3_600_000 + 1000);
    expect(within(section).getByText("Guest link ready")).toBeVisible();
    fireEvent.click(within(section).getByRole("button", { name: "Copy" }));
    await waitFor(() => expect(mocks.clipboard).toHaveBeenCalledWith("https://kumo.test/?openSession=open-token"));
    fireEvent.click(within(section).getAllByRole("button", { name: "Revoke" })[0]!);
    await waitFor(() => expect(mocks.revokeOpenSession).toHaveBeenCalledWith("board", expect.any(String)));
  });

  it("reports open-session creation failures", async () => {
    mocks.createOpenSession.mockRejectedValueOnce(new Error("Guest service unavailable"));
    renderDialog();
    const heading = await screen.findByRole("heading", { name: "Temporary open session" });
    fireEvent.click(within(heading.closest("section")!).getByRole("button", { name: "Create open session" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Guest service unavailable");
  });

  it("keeps sharing usable when an older API omits open sessions", async () => {
    mocks.loadOpenSessions.mockResolvedValueOnce(undefined);
    renderDialog();
    expect(await screen.findByRole("dialog", { name: "Share “Kumo”" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Temporary open session" })).toBeVisible();
  });

  it("handles load failures and ignores every stale access response", async () => {
    mocks.list.mockRejectedValueOnce("offline");
    mocks.loadOpenSessions.mockRejectedValueOnce(new Error("sessions offline"));
    mocks.friendships.mockRejectedValueOnce(new Error("friends offline"));
    mocks.loadRequests.mockRejectedValueOnce(new Error("requests offline"));
    renderDialog();
    expect(await screen.findByRole("alert")).toHaveTextContent("couldn't load board access");
    expect(await screen.findByText("No collaborators yet")).toBeVisible();
    cleanup();

    let resolvePeople: (value: typeof people) => void = () => undefined;
    let resolveSessions: (value: never[]) => void = () => undefined;
    let resolveFriends: (value: { friends: never[]; incoming: never[]; outgoing: never[]; blocked: never[] }) => void = () => undefined;
    let resolveRequests: (value: never[]) => void = () => undefined;
    mocks.list.mockImplementationOnce(() => new Promise((resolve) => { resolvePeople = resolve; }));
    mocks.plan.mockResolvedValueOnce({ plan: null, invitations: undefined });
    mocks.loadOpenSessions.mockImplementationOnce(() => new Promise((resolve) => { resolveSessions = resolve; }));
    mocks.friendships.mockImplementationOnce(() => new Promise((resolve) => { resolveFriends = resolve; }));
    mocks.loadRequests.mockImplementationOnce(() => new Promise((resolve) => { resolveRequests = resolve; }));
    mocks.loadLinks.mockResolvedValueOnce(undefined);
    renderDialog();
    cleanup();
    await act(async () => {
      resolvePeople(people);
      resolveSessions([]);
      resolveFriends({ friends: [], incoming: [], outgoing: [], blocked: [] });
      resolveRequests([]);
      await Promise.resolve();
    });

    let rejectPeople: (reason: unknown) => void = () => undefined;
    let rejectSessions: (reason: unknown) => void = () => undefined;
    let rejectFriends: (reason: unknown) => void = () => undefined;
    mocks.list.mockImplementationOnce(() => new Promise((_, reject) => { rejectPeople = reject; }));
    mocks.loadOpenSessions.mockImplementationOnce(() => new Promise((_, reject) => { rejectSessions = reject; }));
    mocks.friendships.mockImplementationOnce(() => new Promise((_, reject) => { rejectFriends = reject; }));
    renderDialog();
    cleanup();
    await act(async () => {
      rejectPeople(new Error("late"));
      rejectSessions(new Error("late"));
      rejectFriends(new Error("late"));
      await Promise.resolve();
    });
  });

  it("creates pending invitation links and exercises viewer/single-board copy", async () => {
    mocks.plan.mockResolvedValueOnce({ plan: linkedPlan, invitations: [{ id: "pending", email: "old@example.com", role: "editor", status: "pending", expires_at: "2030-01-01", last_sent_at: null, created_at: "now" }] });
    mocks.invite.mockResolvedValueOnce({
      pending: true,
      invitation: { id: "pending", email: "pending@example.com", role: "viewer", status: "pending", expires_at: "2030-01-01", last_sent_at: null, created_at: "now" },
      url: "https://kumo.test/?invite=pending",
    });
    renderDialog();
    await screen.findByLabelText("Share linked boards");
    fireEvent.change(screen.getByLabelText("Role"), { target: { value: "viewer" } });
    fireEvent.click(screen.getByLabelText("Share linked boards"));
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: " pending@example.com " } });
    fireEvent.click(screen.getByRole("button", { name: "Share" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Copy the secure link");
    expect(screen.getByText("pending@example.com")).toBeVisible();
    cleanup();

    mocks.invite.mockResolvedValueOnce({
      pending: true,
      invitation: { id: "pending-link", email: "link@example.com", role: "editor", status: "pending", expires_at: "2030-01-01", last_sent_at: null, created_at: "now" },
      url: "https://kumo.test/?invite=link",
    });
    renderDialog();
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "link@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Share" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Copy the secure link");
  });

  it("filters friends, handles pending/non-error friend failures, and renders empty friend states", async () => {
    mocks.friendships.mockResolvedValueOnce({
      friends: [
        { id: "member", displayName: "Member", username: "member", bio: "", avatarUrl: null, relationship: "friend" },
        { id: "friend", displayName: "Alex", username: "alex", bio: "", avatarUrl: null, relationship: "friend" },
        { id: "second", displayName: "Bea", username: "beatrice", bio: "", avatarUrl: null, relationship: "friend" },
      ], incoming: [], outgoing: [], blocked: [],
    });
    mocks.inviteFriend.mockResolvedValueOnce({ pending: true, invitation: {}, url: "" });
    renderDialog();
    const find = await screen.findByPlaceholderText("Find a friend");
    fireEvent.change(find, { target: { value: " ALEX " } });
    fireEvent.change(screen.getByLabelText("Friend sharing role"), { target: { value: "viewer" } });
    fireEvent.click(screen.getByRole("button", { name: "Share as viewer" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("must resolve to an existing profile");
    fireEvent.change(find, { target: { value: "nobody" } });
    expect(screen.getByText("Everyone matching this search already has access.")).toBeVisible();
    cleanup();

    mocks.friendships.mockResolvedValueOnce({ friends: [], incoming: [], outgoing: [], blocked: [] });
    renderDialog();
    expect(await screen.findByText(/Add friends from your dashboard/)).toBeVisible();
    cleanup();

    mocks.inviteFriend.mockRejectedValueOnce("friend failed");
    renderDialog();
    fireEvent.click(await screen.findByRole("button", { name: "Share as editor" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("couldn't share with this friend");
  });

  it("covers governed-link, open-session, and access-request variants", async () => {
    mocks.loadLinks.mockResolvedValueOnce([
      { id: "editor-link", board_id: "board", role: "editor", allowed_domain: null, expires_at: null, last_used_at: "2026-01-01", revoked_at: null, created_at: "" },
      { id: "viewer-link", board_id: "board", role: "viewer", allowed_domain: "example.com", expires_at: "2030-01-01", last_used_at: null, revoked_at: null, created_at: "" },
      { id: "revoked-link", board_id: "board", role: "viewer", allowed_domain: null, expires_at: null, last_used_at: null, revoked_at: "date", created_at: "" },
    ]);
    mocks.loadRequests.mockResolvedValueOnce([
      { id: "anonymous", board_id: "board", requester_id: "anon", requested_role: "viewer", status: "pending", message: "", profiles: null },
      { id: "second-request", board_id: "board", requester_id: "second", requested_role: "editor", status: "pending", message: "Please", profiles: { display_name: "Bea", avatar_url: "bea.png" } },
      { id: "done", board_id: "board", requester_id: "done", requested_role: "viewer", status: "approved", message: "done", profiles: null },
    ]);
    mocks.loadOpenSessions.mockResolvedValueOnce([
      { id: "editor-session", board_id: "board", role: "editor", expires_at: "2030-01-01", revoked_at: null, use_count: null, created_at: "" },
      { id: "viewer-session", board_id: "board", role: "viewer", expires_at: "2030-01-01", revoked_at: null, use_count: 2, created_at: "" },
      { id: "expired", board_id: "board", role: "viewer", expires_at: "2020-01-01", revoked_at: null, use_count: 0, created_at: "" },
      { id: "revoked", board_id: "board", role: "viewer", expires_at: "2030-01-01", revoked_at: "date", use_count: 0, created_at: "" },
    ]);
    renderDialog();
    expect(await screen.findByText("Editing link")).toBeVisible();
    expect(screen.getByText(/No expiry.*Used/)).toBeVisible();
    expect(screen.getByText("Guest editing")).toBeVisible();
    expect(screen.getByText("Guest viewing")).toBeVisible();
    expect(screen.getByText(/viewer · No message/)).toBeVisible();
    fireEvent.change(screen.getByLabelText("Expires in days"), { target: { value: "0" } });
    fireEvent.click(screen.getByRole("button", { name: "Create secure link" }));
    await waitFor(() => expect(mocks.createLink).toHaveBeenCalledWith("board", expect.objectContaining({ allowedDomain: undefined })));
    fireEvent.click(within(screen.getByText("Secure link ready").closest("div")!).getByRole("button", { name: "Copy" }));
    fireEvent.click(within(screen.getByText("Editing link").closest("div")!).getByRole("button", { name: "Revoke" }));
    await waitFor(() => expect(mocks.revokeLink).toHaveBeenCalledWith("editor-link"));
    fireEvent.click(screen.getAllByRole("button", { name: "Approve" })[0]!);
    await waitFor(() => expect(mocks.resolveRequest).toHaveBeenCalledWith("anonymous", "approved"));
    fireEvent.click(screen.getByRole("button", { name: "Deny" }));
    await waitFor(() => expect(mocks.resolveRequest).toHaveBeenCalledWith("second-request", "denied"));

    const session = screen.getByRole("heading", { name: "Temporary open session" }).closest("section")!;
    fireEvent.change(within(session).getByLabelText("Expires in hours"), { target: { value: "0" } });
    fireEvent.click(within(session).getByRole("button", { name: "Create open session" }));
    await waitFor(() => expect(mocks.createOpenSession).toHaveBeenCalledWith("board", expect.objectContaining({ role: "viewer", password: undefined })));
    fireEvent.click(within(screen.getAllByText("Guest editing")[0]!.closest("div")!).getByRole("button", { name: "Revoke" }));
    await waitFor(() => expect(mocks.revokeOpenSession).toHaveBeenCalledWith("board", expect.any(String)));
  });

  it("reports fallback mutation failures, resets copied state, and distinguishes backdrop clicks", async () => {
    vi.useFakeTimers();
    renderDialog();
    const dialog = screen.getByRole("dialog");
    fireEvent.pointerDown(dialog);
    const close = vi.fn();
    cleanup();
    renderDialog(close);
    const nextBackdrop = screen.getByRole("dialog").parentElement!;
    fireEvent.pointerDown(nextBackdrop);
    expect(close).toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Copy link" }));
    await act(async () => { await Promise.resolve(); });
    expect(screen.getByRole("button", { name: "Copied" })).toBeVisible();
    act(() => vi.advanceTimersByTime(1800));
    expect(screen.getByRole("button", { name: "Copy link" })).toBeVisible();
    vi.useRealTimers();

    mocks.remove.mockRejectedValueOnce("remove failed");
    fireEvent.click(screen.getByRole("button", { name: "Remove Member" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("couldn't remove this person");
    mocks.updateRole.mockRejectedValueOnce("role failed");
    fireEvent.change(screen.getByLabelText("Role for Member"), { target: { value: "editor" } });
    expect(await screen.findByRole("alert")).toHaveTextContent("Role update failed");
  });

  it("renders collaborator fallbacks and accepts a single-board viewer invite with plural exclusions", async () => {
    mocks.plan.mockResolvedValueOnce({
      plan: {
        ...linkedPlan,
        boards: [
          linkedPlan.boards[0], linkedPlan.boards[1],
          { ...linkedPlan.boards[1], id: "linked-two", title: "Research" },
          linkedPlan.boards[2], { ...linkedPlan.boards[2], id: "external-two", title: "Vendor" },
        ],
      },
      invitations: [],
    });
    mocks.list.mockResolvedValueOnce([
      { id: "owner", email: "", name: "", avatar: "avatar.png", role: "owner" },
      { id: "member", email: "member@example.com", name: "", avatar: null, role: "viewer" },
      { id: "other", email: "", name: "Other", avatar: null, role: "editor" },
    ]);
    mocks.invite.mockResolvedValueOnce({
      uid: "member", email: "member@example.com", role: "viewer", name: "", avatar: "member.png",
      sharedBoards: [linkedPlan.boards[0]], unavailableBoards: [linkedPlan.boards[2], { ...linkedPlan.boards[2], id: "external-two" }],
    });
    renderDialog();
    expect(await screen.findByText(/Include 2 linked boards/)).toBeVisible();
    expect(screen.getByText(/2 private linked boards have/)).toBeVisible();
    expect(screen.getByText("Collaborator")).toBeVisible();
    fireEvent.click(screen.getAllByRole("button", { name: "Make owner" })[0]!);
    await waitFor(() => expect(mocks.transfer).toHaveBeenCalledWith("board", "member"));
    fireEvent.change(screen.getByLabelText("Role"), { target: { value: "viewer" } });
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "member@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Share" }));
    expect(await screen.findByRole("status")).toHaveTextContent("can now view this board");
    expect(screen.getByRole("status")).toHaveTextContent("2 private destinations still need");
    cleanup();

    mocks.list.mockResolvedValueOnce([
      { id: "owner", email: "", name: "", avatar: "", role: "owner" },
      { id: "viewer", email: "", name: "Viewer", avatar: "", role: "viewer" },
      { id: "editor", email: "", name: "Editor", avatar: "", role: "editor" },
    ]);
    renderDialog(vi.fn(), "viewer");
    expect(await screen.findByText("Can view")).toBeVisible();
    expect(screen.getByText("Can edit")).toBeVisible();
    expect(screen.getByText("Board owner")).toBeVisible();
    expect(screen.getAllByText("Member")).toHaveLength(2);
  });

  it("covers null governed collections, missing-board disabled controls, and remaining error fallbacks", async () => {
    mocks.loadRequests.mockResolvedValueOnce(undefined);
    mocks.loadLinks.mockResolvedValueOnce(undefined);
    mocks.list.mockRejectedValueOnce(new Error("Access service unavailable"));
    renderDialog();
    expect(await screen.findByRole("alert")).toHaveTextContent("Access service unavailable");
    cleanup();

    renderDialog(vi.fn(), "owner", { id: null });
    expect(screen.getByRole("button", { name: "Copy link" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Share" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Create secure link" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Create open session" })).toBeDisabled();
    cleanup();

    mocks.invite.mockRejectedValueOnce("invite failed");
    mocks.remove.mockRejectedValueOnce(new Error("Removal blocked"));
    mocks.updateRole.mockRejectedValueOnce(new Error("Role blocked"));
    mocks.createLink.mockRejectedValueOnce(new Error("Link blocked"));
    mocks.createOpenSession.mockRejectedValueOnce("session failed");
    renderDialog();
    await screen.findByText("Member");
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "broken@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Share" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("couldn't invite this person"));
    fireEvent.click(screen.getByRole("button", { name: "Remove Member" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Removal blocked"));
    fireEvent.change(screen.getByLabelText("Role for Member"), { target: { value: "editor" } });
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Role blocked"));
    fireEvent.click(screen.getByRole("button", { name: "Create secure link" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Link blocked"));
    mocks.createLink.mockRejectedValueOnce("link failed");
    fireEvent.click(screen.getByRole("button", { name: "Create secure link" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Share link creation failed"));
    fireEvent.click(screen.getByRole("button", { name: "Create open session" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Open session creation failed"));
  });

  it("reports governed-action errors instead of leaking rejected promises", async () => {
    mocks.plan.mockResolvedValueOnce({ plan: linkedPlan, invitations: [{ id: "pending", email: "pending@example.com", role: "viewer", status: "pending", expires_at: "2030-01-01", last_sent_at: null, created_at: "now" }] });
    mocks.refreshInvite.mockRejectedValueOnce(new Error("Refresh blocked"));
    mocks.transfer.mockRejectedValueOnce("transfer failed");
    renderDialog();
    fireEvent.click(await screen.findByRole("button", { name: "Refresh link" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Refresh blocked");
    fireEvent.click(screen.getByRole("button", { name: "Make owner" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Ownership transfer failed");
  });
});
