import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createFolder } from "../../services/productRepository";
import {
  cancelAccountDeletion, cancelWorkspaceInvitation, exportAccountData, inviteWorkspaceMember, loadCommunity, loadNotificationPreferences, loadOperations, loadWorkspaceAdmin,
  mutateWorkspaceFolder, remixCommunity, removeWorkspaceMember, renameWorkspace, reportCommunity, requestAccountDeletion, revokeAccountSessions,
  transferWorkspaceOwnership, updateNotificationPreferences, updateWorkspaceMember,
} from "../../services/platformRepository";
import { CommunityView } from "./CommunityView";
import { SettingsView } from "./SettingsView";
import { WorkspaceAdminView } from "./WorkspaceAdminView";
import { downloadBlob } from "../../editor/export";
import { requestBrowserNotificationPermission } from "../../platform/browserNotifications";

vi.mock("../../services/productRepository", () => ({ createFolder: vi.fn() }));
vi.mock("../../editor/export", () => ({ downloadBlob: vi.fn() }));
vi.mock("../../platform/browserNotifications", () => ({ requestBrowserNotificationPermission: vi.fn() }));
vi.mock("../../services/platformRepository", () => ({
  loadWorkspaceAdmin: vi.fn(), renameWorkspace: vi.fn(), inviteWorkspaceMember: vi.fn(), cancelWorkspaceInvitation: vi.fn(),
  updateWorkspaceMember: vi.fn(), removeWorkspaceMember: vi.fn(), mutateWorkspaceFolder: vi.fn(),
  transferWorkspaceOwnership: vi.fn(),
  loadNotificationPreferences: vi.fn(), updateNotificationPreferences: vi.fn(), loadOperations: vi.fn(),
  cancelAccountDeletion: vi.fn(), exportAccountData: vi.fn(), requestAccountDeletion: vi.fn(), revokeAccountSessions: vi.fn(),
  loadCommunity: vi.fn(), remixCommunity: vi.fn(), reportCommunity: vi.fn(),
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
    vi.mocked(requestBrowserNotificationPermission).mockResolvedValue(true);
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
    vi.mocked(requestBrowserNotificationPermission).mockResolvedValueOnce(false);
    render(<SettingsView />);
    const browser = await screen.findByRole("checkbox", { name: "Browser notifications" });
    fireEvent.click(browser);
    expect(await screen.findByRole("alert")).toHaveTextContent("Allow notifications");
    expect(browser).not.toBeChecked();
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
});
