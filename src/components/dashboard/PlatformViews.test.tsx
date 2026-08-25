import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createFolder } from "../../services/productRepository";
import {
  cancelAccountDeletion, cancelWorkspaceInvitation, exportAccountData, inviteWorkspaceMember, loadCommunity, loadNotificationPreferences, loadOperations, loadWorkspaceAdmin,
  mutateWorkspaceFolder, remixCommunity, removeWorkspaceMember, renameWorkspace, reportCommunity, requestAccountDeletion, revokeAccountSessions,
  transferWorkspaceOwnership, updateNotificationPreferences, updateWorkspaceMember,
  loadPushConfig, subscribePush, testPush,
} from "../../services/platformRepository";
import { CommunityView } from "./CommunityView";
import { SettingsView } from "./SettingsView";
import { WorkspaceAdminView } from "./WorkspaceAdminView";
import { downloadBlob } from "../../editor/export";
import { disableBackgroundPush, enableBackgroundPush } from "../../platform/browserNotifications";
import type { WorkspaceAdminOverview } from "../../services/platformRepository";

vi.mock("../../services/productRepository", () => ({ createFolder: vi.fn() }));
vi.mock("../../editor/export", () => ({ downloadBlob: vi.fn() }));
vi.mock("../../platform/browserNotifications", () => ({ disableBackgroundPush: vi.fn(), enableBackgroundPush: vi.fn() }));
vi.mock("../../services/platformRepository", () => ({
  loadWorkspaceAdmin: vi.fn(), renameWorkspace: vi.fn(), inviteWorkspaceMember: vi.fn(), cancelWorkspaceInvitation: vi.fn(),
  updateWorkspaceMember: vi.fn(), removeWorkspaceMember: vi.fn(), mutateWorkspaceFolder: vi.fn(),
  transferWorkspaceOwnership: vi.fn(),
  loadNotificationPreferences: vi.fn(), updateNotificationPreferences: vi.fn(), loadOperations: vi.fn(),
  cancelAccountDeletion: vi.fn(), exportAccountData: vi.fn(), requestAccountDeletion: vi.fn(), revokeAccountSessions: vi.fn(),
  loadCommunity: vi.fn(), remixCommunity: vi.fn(), reportCommunity: vi.fn(),
  loadPushConfig: vi.fn(), subscribePush: vi.fn(), testPush: vi.fn(),
}));

const overview = {
  workspace: { workspace_id: "workspace", role: "owner" as const, workspaces: { id: "workspace", name: "Studio", owner_id: "owner" } },
  members: [
    { user_id: "owner", role: "owner" as const, created_at: "", profile: { firebase_uid: "owner", display_name: "Owner", email: "owner@example.com", avatar_url: null, username: "owner" } },
    { user_id: "member", role: "member" as const, created_at: "", profile: { firebase_uid: "member", display_name: "Member", email: "member@example.com", avatar_url: null, username: "member" } },
  ],
  folders: [{ id: "folder", workspace_id: "workspace", parent_id: null, name: "Research", created_by: "owner", created_at: "", updated_at: "" }],
  invitations: [],
};

describe("platform dashboard views", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(loadWorkspaceAdmin).mockResolvedValue(overview);
    vi.mocked(inviteWorkspaceMember).mockResolvedValue({ added: true, userId: "new", role: "member" });
    vi.mocked(updateWorkspaceMember).mockResolvedValue({ updated: true, role: "admin" });
    vi.mocked(transferWorkspaceOwnership).mockResolvedValue({ transferred: true, ownerId: "member" });
    vi.mocked(renameWorkspace).mockResolvedValue({ workspace: { id: "workspace", name: "Studio", owner_id: "owner" } });
    vi.mocked(cancelWorkspaceInvitation).mockResolvedValue({ cancelled: true });
    vi.mocked(removeWorkspaceMember).mockResolvedValue({ removed: true });
    vi.mocked(mutateWorkspaceFolder).mockResolvedValue({ folder: overview.folders[0] });
    vi.mocked(createFolder).mockResolvedValue({ folder: overview.folders[0]! });
    vi.mocked(loadNotificationPreferences).mockResolvedValue({ user_id: "owner", email_enabled: true, browser_enabled: false, digest: "instant", board_comments: "all", branch_reviews: true, library_updates: true, access_changes: true });
    vi.mocked(updateNotificationPreferences).mockImplementation(async (value) => value as Awaited<ReturnType<typeof loadNotificationPreferences>>);
    vi.mocked(loadOperations).mockResolvedValue({ events: [], telemetry: { counts: { ready: 2, lost: 1, failed: 0, restored: 1 }, eventCount: 4, retryCount: 1, recoveryRate: 1, averageRecoveryMs: 220, healthy: true } });
    vi.mocked(loadCommunity).mockResolvedValue([{ board_id: "public", published_by: "owner", slug: "public-board", description: "A useful system", tags: ["design"], remix_allowed: true, remix_count: 3, published_at: "", boards: { title: "Public board" } }]);
    vi.mocked(remixCommunity).mockResolvedValue({ boardId: "remix" });
    vi.mocked(reportCommunity).mockResolvedValue({ reported: true });
    vi.mocked(exportAccountData).mockResolvedValue({ profile: { id: "owner" } });
    vi.mocked(revokeAccountSessions).mockResolvedValue({ revoked: true });
    vi.mocked(requestAccountDeletion).mockResolvedValue({ deletion: { requested_at: "2026-08-24", scheduled_for: "2026-08-31" } });
    vi.mocked(cancelAccountDeletion).mockResolvedValue({ cancelled: true });
    vi.mocked(loadPushConfig).mockResolvedValue({ configured: true, publicKey: "test-public-key" });
    vi.mocked(subscribePush).mockResolvedValue({ subscription: { id: "push", endpoint: "https://push.example/subscription", updated_at: "2026-08-25" } });
    vi.mocked(testPush).mockResolvedValue({ delivered: 1, subscriptions: 1 });
    vi.mocked(enableBackgroundPush).mockResolvedValue({} as PushSubscription);
    vi.mocked(disableBackgroundPush).mockResolvedValue(true);
  });

  it("manages workspace invitations, member roles, and folders", async () => {
    render(<WorkspaceAdminView />);
    expect(await screen.findByDisplayValue("Studio")).toBeVisible();
    fireEvent.change(screen.getByLabelText("Workspace invite email"), { target: { value: "new@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: /Invite/ }));
    await waitFor(() => expect(inviteWorkspaceMember).toHaveBeenCalledWith("workspace", "new@example.com", "member"));
    fireEvent.change(screen.getByLabelText("Workspace role for Member"), { target: { value: "admin" } });
    await waitFor(() => expect(updateWorkspaceMember).toHaveBeenCalledWith("workspace", "member", "admin"));
    fireEvent.click(screen.getByRole("button", { name: /Make owner/ }));
    expect(screen.getByRole("dialog")).toHaveTextContent("Transfer workspace ownership?");
    fireEvent.click(screen.getByRole("button", { name: "Transfer ownership" }));
    await waitFor(() => expect(transferWorkspaceOwnership).toHaveBeenCalledWith("workspace", "member"));
    fireEvent.change(screen.getByLabelText("Workspace folder name"), { target: { value: "Planning" } });
    fireEvent.click(screen.getByRole("button", { name: /Create/ }));
    await waitFor(() => expect(createFolder).toHaveBeenCalledWith("Planning"));
  });

  it("updates notification delivery immediately and reports collaboration health", async () => {
    render(<SettingsView />);
    const email = await screen.findByRole("checkbox", { name: "Email notifications" });
    fireEvent.click(email);
    await waitFor(() => expect(updateNotificationPreferences).toHaveBeenCalledWith(expect.objectContaining({ email_enabled: false })));
    expect(screen.getByText("100%")).toBeVisible();
    expect(screen.getByText("Connection telemetry is healthy.")).toBeVisible();
  });

  it("keeps browser alerts disabled when permission is denied", async () => {
    vi.mocked(enableBackgroundPush).mockResolvedValueOnce(null);
    render(<SettingsView />);
    const browser = await screen.findByRole("checkbox", { name: "Browser notifications" });
    fireEvent.click(browser);
    expect(await screen.findByRole("alert")).toHaveTextContent("Allow notifications");
    expect(browser).not.toBeChecked();
  });

  it("revokes the browser subscription when alerts are disabled", async () => {
    vi.mocked(loadNotificationPreferences).mockResolvedValueOnce({ user_id: "owner", email_enabled: true, browser_enabled: true, digest: "instant", board_comments: "all", branch_reviews: true, library_updates: true, access_changes: true });
    render(<SettingsView />);
    fireEvent.click(await screen.findByRole("checkbox", { name: "Browser notifications" }));
    await waitFor(() => expect(disableBackgroundPush).toHaveBeenCalledOnce());
  });

  it("updates each notification preference and completes every account security action", async () => {
    render(<SettingsView />);
    await screen.findByRole("checkbox", { name: "Email notifications" });
    fireEvent.click(screen.getByRole("checkbox", { name: "Browser notifications" }));
    fireEvent.change(screen.getByRole("combobox", { name: "Delivery" }), { target: { value: "daily" } });
    fireEvent.change(screen.getByRole("combobox", { name: "Board comments" }), { target: { value: "mentions" } });
    fireEvent.click(screen.getByRole("checkbox", { name: "Branch reviews" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Library updates" }));
    await waitFor(() => expect(updateNotificationPreferences).toHaveBeenCalledTimes(5));
    fireEvent.click(screen.getByRole("button", { name: /Export data/ }));
    await waitFor(() => expect(downloadBlob).toHaveBeenCalledWith(expect.any(Blob), "kumo-account-export.json"));
    fireEvent.click(screen.getByRole("button", { name: /Revoke sessions/ }));
    await waitFor(() => expect(revokeAccountSessions).toHaveBeenCalled());
    fireEvent.click(screen.getByRole("button", { name: /Schedule deletion/ }));
    expect(requestAccountDeletion).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Confirm deletion" }));
    await waitFor(() => expect(requestAccountDeletion).toHaveBeenCalled());
    fireEvent.click(screen.getByRole("button", { name: /Cancel deletion/ }));
    await waitFor(() => expect(cancelAccountDeletion).toHaveBeenCalled());
  });

  it("reports settings load failures from Error and non-Error rejections", async () => {
    vi.mocked(loadNotificationPreferences).mockRejectedValueOnce(new Error("Preferences unavailable"));
    const first = render(<SettingsView />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Preferences unavailable");
    first.unmount();

    vi.mocked(loadOperations).mockRejectedValueOnce("offline");
    render(<SettingsView />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Settings could not be loaded.");
  });

  it("handles push configuration, persistence, disable, and health edge cases", async () => {
    vi.mocked(loadPushConfig).mockResolvedValueOnce({ configured: false, publicKey: "" });
    const unconfigured = render(<SettingsView />);
    fireEvent.click(await screen.findByRole("checkbox", { name: "Browser notifications" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("not configured");
    unconfigured.unmount();

    vi.mocked(updateNotificationPreferences).mockRejectedValueOnce(new Error("Save failed"));
    const rejected = render(<SettingsView />);
    fireEvent.click(await screen.findByRole("checkbox", { name: "Email notifications" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Save failed");
    vi.mocked(updateNotificationPreferences).mockRejectedValueOnce("save failed");
    fireEvent.click(screen.getByRole("checkbox", { name: "Email notifications" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Notification settings could not be saved.");
    rejected.unmount();

    vi.mocked(loadNotificationPreferences).mockResolvedValueOnce({ user_id: "owner", email_enabled: true, browser_enabled: true, digest: "instant", board_comments: "all", branch_reviews: true, library_updates: true, access_changes: true });
    vi.mocked(disableBackgroundPush).mockRejectedValueOnce(new Error("Already removed"));
    vi.mocked(loadOperations).mockResolvedValueOnce({ events: [], telemetry: { counts: { ready: 0, lost: 2, failed: 1, restored: 0 }, eventCount: 3, retryCount: 3, recoveryRate: 0, averageRecoveryMs: 0, healthy: false } });
    render(<SettingsView />);
    fireEvent.click(await screen.findByRole("checkbox", { name: "Browser notifications" }));
    await waitFor(() => expect(disableBackgroundPush).toHaveBeenCalled());
    expect(screen.getByText("Connection failures need review.")).toBeVisible();
  });

  it("tests push delivery outcomes and account deletion cancellation and failures", async () => {
    vi.mocked(loadNotificationPreferences).mockResolvedValue({ user_id: "owner", email_enabled: true, browser_enabled: true, digest: "instant", board_comments: "all", branch_reviews: true, library_updates: true, access_changes: true });
    render(<SettingsView />);
    const push = await screen.findByRole("button", { name: "Send test notification" });
    fireEvent.click(push);
    expect(await screen.findByRole("status")).toHaveTextContent("Background push delivered.");

    vi.mocked(testPush).mockResolvedValueOnce({ delivered: 0, subscriptions: 0 });
    fireEvent.click(push);
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("No active push subscription"));
    vi.mocked(testPush).mockRejectedValueOnce(new Error("Push unavailable"));
    fireEvent.click(push);
    expect(await screen.findByRole("alert")).toHaveTextContent("Push unavailable");
    vi.mocked(testPush).mockRejectedValueOnce("push unavailable");
    fireEvent.click(push);
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Push test failed."));

    fireEvent.click(screen.getByRole("button", { name: /Schedule deletion/ }));
    fireEvent.click(screen.getByRole("button", { name: "Keep account" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    vi.mocked(requestAccountDeletion).mockRejectedValueOnce(new Error("Deletion unavailable"));
    fireEvent.click(screen.getByRole("button", { name: /Schedule deletion/ }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm deletion" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Deletion unavailable");
    fireEvent.click(screen.getByRole("button", { name: "Keep account" }));

    vi.mocked(requestAccountDeletion).mockRejectedValueOnce("deletion unavailable");
    fireEvent.click(screen.getByRole("button", { name: /Schedule deletion/ }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm deletion" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Account deletion could not be scheduled."));
  });

  it("renames the workspace and manages pending invitations, members, and nested folders", async () => {
    const detailed = {
      ...overview,
      invitations: [{ id: "invite", email: "pending@example.com", role: "guest" as const, status: "pending", expires_at: "2026-09-01", created_at: "" }],
      folders: [
        overview.folders[0]!,
        { ...overview.folders[0]!, id: "nested", name: "Drafts", parent_id: "folder" },
      ],
    };
    vi.mocked(loadWorkspaceAdmin).mockResolvedValue(detailed);
    render(<WorkspaceAdminView />);
    const workspaceName = await screen.findByLabelText("Workspace name");
    fireEvent.change(workspaceName, { target: { value: "Kumo Studio" } });
    fireEvent.submit(workspaceName.closest("form")!);
    await waitFor(() => expect(renameWorkspace).toHaveBeenCalledWith("workspace", "Kumo Studio"));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(cancelWorkspaceInvitation).toHaveBeenCalledWith("workspace", "invite"));
    fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    expect(removeWorkspaceMember).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Remove member" }));
    await waitFor(() => expect(removeWorkspaceMember).toHaveBeenCalledWith("workspace", "member"));
    const folderName = screen.getByLabelText("Folder name for Research");
    fireEvent.change(folderName, { target: { value: "Discovery" } });
    fireEvent.blur(folderName);
    await waitFor(() => expect(mutateWorkspaceFolder).toHaveBeenCalledWith("rename-folder", "workspace", "folder", { name: "Discovery" }));
    fireEvent.change(screen.getByLabelText("Parent folder for Drafts"), { target: { value: "" } });
    await waitFor(() => expect(mutateWorkspaceFolder).toHaveBeenCalledWith("move-folder", "workspace", "nested", { parentId: null }));
    fireEvent.click(screen.getAllByRole("button", { name: "Delete" })[0]!);
    expect(mutateWorkspaceFolder).not.toHaveBeenCalledWith("delete-folder", "workspace", "folder", { recursive: true });
    fireEvent.click(screen.getByRole("button", { name: "Delete folder" }));
    await waitFor(() => expect(mutateWorkspaceFolder).toHaveBeenCalledWith("delete-folder", "workspace", "folder", { recursive: true }));
  });

  it("allows an ownership transfer confirmation to be cancelled", async () => {
    render(<WorkspaceAdminView />);
    await screen.findByDisplayValue("Studio");
    fireEvent.click(screen.getByRole("button", { name: /Make owner/ }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(transferWorkspaceOwnership).not.toHaveBeenCalled();
  });

  it("reports workspace loading failures and ignores completion after unmount", async () => {
    vi.mocked(loadWorkspaceAdmin).mockRejectedValueOnce(new Error("Workspace offline"));
    const first = render(<WorkspaceAdminView />);
    expect(await screen.findByText("Workspace offline")).toBeVisible();
    first.unmount();

    vi.mocked(loadWorkspaceAdmin).mockRejectedValueOnce("offline");
    const second = render(<WorkspaceAdminView />);
    expect(await screen.findByText("Workspace could not be loaded.")).toBeVisible();
    second.unmount();

    let resolveLoad!: (value: typeof overview) => void;
    vi.mocked(loadWorkspaceAdmin).mockImplementationOnce(() => new Promise((resolve) => { resolveLoad = resolve; }));
    const pendingSuccess = render(<WorkspaceAdminView />);
    pendingSuccess.unmount();
    await act(async () => { resolveLoad(overview); await Promise.resolve(); });

    let rejectLoad!: (reason: unknown) => void;
    vi.mocked(loadWorkspaceAdmin).mockImplementationOnce(() => new Promise((_, reject) => { rejectLoad = reject; }));
    const pendingFailure = render(<WorkspaceAdminView />);
    pendingFailure.unmount();
    await act(async () => { rejectLoad(new Error("Too late")); await Promise.resolve(); });
  });

  it("covers admin, member, sparse profiles, and every invitation result", async () => {
    const sparse = {
      ...overview,
      workspace: { ...overview.workspace, role: "admin" as const },
      members: [
        overview.members[0]!,
        { ...overview.members[1]!, profile: { ...overview.members[1]!.profile, display_name: undefined, avatar_url: undefined } },
        { user_id: "anonymous", role: "guest" as const, created_at: "", profile: undefined },
      ],
    };
    vi.mocked(loadWorkspaceAdmin).mockResolvedValue(sparse as unknown as WorkspaceAdminOverview);
    vi.mocked(inviteWorkspaceMember).mockResolvedValueOnce({ delivery: "sent", role: "guest" });
    const adminView = render(<WorkspaceAdminView />);
    expect(await screen.findAllByText("Kumo user")).toHaveLength(2);
    fireEvent.change(screen.getByLabelText("Workspace invite role"), { target: { value: "guest" } });
    fireEvent.change(screen.getByLabelText("Workspace invite email"), { target: { value: "sent@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: /Invite/ }));
    expect(await screen.findByRole("status")).toHaveTextContent("Invitation sent.");

    vi.mocked(inviteWorkspaceMember).mockResolvedValueOnce({ delivery: "link", url: "https://invite.example/token", role: "member" });
    fireEvent.change(screen.getByLabelText("Workspace invite email"), { target: { value: "link@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: /Invite/ }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Invitation created: https://invite.example/token"));
    expect(screen.queryByRole("button", { name: /Make owner/ })).not.toBeInTheDocument();
    adminView.unmount();

    const memberOverview = { ...overview, workspace: { ...overview.workspace, role: "member" as const } };
    vi.mocked(loadWorkspaceAdmin).mockResolvedValueOnce(memberOverview);
    const memberView = render(<WorkspaceAdminView />);
    expect(await screen.findByLabelText("Workspace name")).toBeDisabled();
    expect(screen.queryByLabelText("Workspace invite email")).not.toBeInTheDocument();
    memberView.unmount();
  });

  it("reports rename, invitation, reload, and folder-move failures", async () => {
    const detailed = {
      ...overview,
      folders: [overview.folders[0]!, { ...overview.folders[0]!, id: "sibling", name: "Sibling", parent_id: null }],
    };
    vi.mocked(loadWorkspaceAdmin).mockResolvedValue(detailed);
    render(<WorkspaceAdminView />);
    const workspaceName = await screen.findByLabelText("Workspace name");

    vi.mocked(renameWorkspace).mockRejectedValueOnce(new Error("Rename failed"));
    fireEvent.submit(workspaceName.closest("form")!);
    expect(await screen.findByRole("alert")).toHaveTextContent("Rename failed");
    vi.mocked(renameWorkspace).mockRejectedValueOnce("rename failed");
    fireEvent.submit(workspaceName.closest("form")!);
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Workspace could not be renamed."));

    vi.mocked(inviteWorkspaceMember).mockRejectedValueOnce(new Error("Invite failed"));
    fireEvent.change(screen.getByLabelText("Workspace invite email"), { target: { value: "fail@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: /Invite/ }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Invite failed"));
    vi.mocked(inviteWorkspaceMember).mockRejectedValueOnce("invite failed");
    fireEvent.click(screen.getByRole("button", { name: /Invite/ }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Workspace invitation could not be sent."));

    const unchanged = screen.getByLabelText("Folder name for Research");
    fireEvent.blur(unchanged);
    expect(mutateWorkspaceFolder).not.toHaveBeenCalledWith("rename-folder", expect.anything(), expect.anything(), expect.anything());

    vi.mocked(mutateWorkspaceFolder).mockRejectedValueOnce(new Error("Move failed"));
    fireEvent.change(screen.getByLabelText("Parent folder for Sibling"), { target: { value: "folder" } });
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Move failed"));
    vi.mocked(mutateWorkspaceFolder).mockRejectedValueOnce("move failed");
    fireEvent.change(screen.getByLabelText("Parent folder for Sibling"), { target: { value: "folder" } });
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Folder could not be moved."));

    vi.mocked(loadWorkspaceAdmin).mockRejectedValueOnce(new Error("Reload failed"));
    vi.mocked(inviteWorkspaceMember).mockResolvedValueOnce({ added: true, userId: "new", role: "member" });
    fireEvent.click(screen.getByRole("button", { name: /Invite/ }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Reload failed"));

    vi.mocked(loadWorkspaceAdmin).mockRejectedValueOnce("reload failed");
    vi.mocked(inviteWorkspaceMember).mockResolvedValueOnce({ added: true, userId: "newer", role: "member" });
    fireEvent.change(screen.getByLabelText("Workspace invite email"), { target: { value: "reload@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: /Invite/ }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Workspace could not be loaded."));
  });

  it("handles ownership, member removal, and folder deletion failures and cancellations", async () => {
    const sparseOwner = {
      ...overview,
      members: [
        overview.members[0]!,
        { ...overview.members[1]!, profile: { ...overview.members[1]!.profile, display_name: undefined } },
        { user_id: "anonymous", role: "guest" as const, created_at: "", profile: undefined },
      ],
    };
    vi.mocked(loadWorkspaceAdmin).mockResolvedValue(sparseOwner as unknown as WorkspaceAdminOverview);
    render(<WorkspaceAdminView />);
    await screen.findByDisplayValue("Studio");

    vi.mocked(transferWorkspaceOwnership).mockRejectedValueOnce(new Error("Transfer failed"));
    fireEvent.click(screen.getAllByRole("button", { name: /Make owner/ })[0]!);
    expect(screen.getByRole("dialog")).toHaveTextContent("member@example.com");
    fireEvent.click(screen.getByRole("button", { name: "Transfer ownership" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Transfer failed");
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    vi.mocked(transferWorkspaceOwnership).mockRejectedValueOnce("transfer failed");
    fireEvent.click(screen.getAllByRole("button", { name: /Make owner/ })[1]!);
    expect(screen.getByRole("dialog")).toHaveTextContent("This member");
    fireEvent.click(screen.getByRole("button", { name: "Transfer ownership" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Ownership could not be transferred."));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    vi.mocked(removeWorkspaceMember).mockRejectedValueOnce(new Error("Removal failed"));
    fireEvent.click(screen.getAllByRole("button", { name: "Remove" })[0]!);
    fireEvent.click(screen.getByRole("button", { name: "Remove member" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Removal failed");
    fireEvent.click(screen.getByRole("button", { name: "Keep member" }));

    vi.mocked(removeWorkspaceMember).mockRejectedValueOnce("removal failed");
    fireEvent.click(screen.getAllByRole("button", { name: "Remove" })[1]!);
    fireEvent.click(screen.getByRole("button", { name: "Remove member" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Member could not be removed."));
    fireEvent.click(screen.getByRole("button", { name: "Keep member" }));

    vi.mocked(mutateWorkspaceFolder).mockRejectedValueOnce(new Error("Delete failed"));
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete folder" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Delete failed");
    fireEvent.click(screen.getByRole("button", { name: "Keep folder" }));

    vi.mocked(mutateWorkspaceFolder).mockRejectedValueOnce("delete failed");
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete folder" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Folder could not be deleted."));
  });

  it("opens and remixes discoverable community boards", async () => {
    const open = vi.fn();
    render(<CommunityView onOpenBoard={open} />);
    expect(await screen.findByText("Public board")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: /Remix/ }));
    await waitFor(() => expect(open).toHaveBeenCalledWith("remix"));
    fireEvent.click(screen.getByRole("button", { name: "Report Public board" }));
    await waitFor(() => expect(reportCommunity).toHaveBeenCalledWith("public", expect.stringContaining("moderation review")));
    expect(screen.getByRole("status")).toHaveTextContent("Report sent");
  });

  it("renders sparse community metadata and opens non-remixable boards", async () => {
    vi.mocked(loadCommunity).mockResolvedValueOnce([{
      board_id: "legacy", published_by: "owner", slug: "legacy-board", description: "", tags: [],
      remix_allowed: false, remix_count: 0, published_at: "", boards: undefined,
    }]);
    const open = vi.fn();
    render(<CommunityView onOpenBoard={open} />);
    expect(await screen.findByText("legacy-board")).toBeVisible();
    expect(screen.getByText("A public Kumo board.")).toBeVisible();
    expect(screen.queryByRole("button", { name: /Remix/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Open" }));
    expect(open).toHaveBeenCalledWith("legacy");
  });
});
