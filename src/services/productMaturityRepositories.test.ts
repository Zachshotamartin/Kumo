import { authenticatedFetch, publicFetch } from "./apiClient";
import {
  acceptWorkspaceInvitation, cancelAccountDeletion, cancelWorkspaceInvitation, createPrototypeLink, exportAccountData, globalSearch, installExtension, inviteWorkspaceMember, leaveWorkspace, loadCommunity,
  loadExtensions, loadNotificationPreferences, loadOperations, loadPrototypeLinks, loadWorkspaceAdmin, mutateWorkspaceFolder,
  publishCommunity, publishExtension, redeemPrototype, remixCommunity, removeWorkspaceMember, renameWorkspace, reportCommunity,
  requestAccountDeletion, revokeAccountSessions, revokePrototypeLink, toggleExtension, uninstallExtension,
  transferWorkspaceOwnership, unpublishCommunity, updateNotificationPreferences, updateWorkspaceMember,
} from "./platformRepository";
import {
  compareBoardVersion, createBoardAutosave, createBoardCheckpoint, duplicateBoardVersion, getBoardVersion,
  getSharedBoardVersion, listBoardVersions, renameBoardVersion, restoreBoardVersion, shareBoardVersion,
} from "./versionRepository";
import {
  archiveDesignBranch, createDesignBranch, diffDesignBranch, listDesignBranches, mergeDesignBranch, renameDesignBranch,
  requestBranchReview, restoreDesignBranch, reviewDesignBranch, updateBranchFromMain,
} from "./branchRepository";
import {
  acceptBoardInvitation, cancelBoardInvitation, getBoardSharePlan, getBoardSharingOverview, inviteBoardCollaborator,
  inviteBoardFriend, leaveSharedBoard, listBoardCollaborators, removeBoardCollaborator, resendBoardInvitation,
  transferBoardOwnership, updateBoardCollaboratorRole,
} from "./collaboratorRepository";

vi.mock("./apiClient", () => ({ authenticatedFetch: vi.fn(), publicFetch: vi.fn() }));

describe("product maturity repositories", () => {
  beforeEach(() => vi.clearAllMocks());

  it("encodes workspace, search, preferences, and operations contracts", async () => {
    vi.mocked(authenticatedFetch)
      .mockResolvedValueOnce({ workspace: {}, members: [], folders: [], invitations: [] })
      .mockResolvedValueOnce({ workspace: { id: "workspace" } })
      .mockResolvedValueOnce({ updated: true, role: "admin" })
      .mockResolvedValueOnce({ removed: true })
      .mockResolvedValueOnce({ folder: { id: "folder" } })
      .mockResolvedValueOnce({ preferences: { digest: "instant" } })
      .mockResolvedValueOnce({ preferences: { digest: "weekly" } })
      .mockResolvedValueOnce({ results: [] })
      .mockResolvedValueOnce({ events: [], telemetry: {} })
      .mockResolvedValueOnce({ accepted: true, workspaceId: "workspace" });
    await loadWorkspaceAdmin(); await renameWorkspace("workspace", "Studio"); await updateWorkspaceMember("workspace", "user", "admin"); await removeWorkspaceMember("workspace", "user"); await mutateWorkspaceFolder("move-folder", "workspace", "folder", { parentId: "parent" });
    await loadNotificationPreferences(); await updateNotificationPreferences({ digest: "weekly" }); await globalSearch("design system"); await loadOperations("board"); await acceptWorkspaceInvitation("secret");
    expect(authenticatedFetch).toHaveBeenCalledWith("/api/platform?scope=global-search&q=design+system");
    expect(authenticatedFetch).toHaveBeenCalledWith("/api/platform?scope=operations&boardId=board");
  });

  it("covers prototype, extension, community, and account operations", async () => {
    const values: unknown[] = [
      { links: [] }, { link: { id: "link" }, token: "secret", url: "https://kumo.test/?prototype=secret" }, { revoked: true },
      { extensions: [] }, { extension: { id: "kumo.test" } }, { installed: true, permissions: [] }, { enabled: false }, { uninstalled: true },
      { publications: [] }, { publication: { board_id: "board" } }, { reported: true },
      { profile: {} }, { revoked: true }, { deletion: { requested_at: "now", scheduled_for: "later" } },
    ];
    values.forEach((value) => vi.mocked(authenticatedFetch).mockResolvedValueOnce(value));
    await loadPrototypeLinks("board"); await createPrototypeLink("board", { deviceFrame: "phone", password: "secret" }); await revokePrototypeLink("board", "link");
    await loadExtensions(); await publishExtension({ id: "kumo.test", name: "Test", permissions: [], commands: [] }, "Description"); await installExtension("kumo.test", []); await toggleExtension("kumo.test", false); await uninstallExtension("kumo.test");
    await loadCommunity(); await publishCommunity("board", { description: "Board", tags: ["design"], remixAllowed: true }); await reportCommunity("board", "Reason");
    await exportAccountData(); await revokeAccountSessions(); await requestAccountDeletion();
    expect(authenticatedFetch).toHaveBeenCalledWith("/api/platform", expect.objectContaining({ body: JSON.stringify({ action: "create-prototype-link", boardId: "board", deviceFrame: "phone", password: "secret" }) }));
  });

  it("uses unauthenticated, token-scoped reads for presentation and version links", async () => {
    vi.mocked(publicFetch).mockResolvedValueOnce({ prototype: { boardId: "board" } }).mockResolvedValueOnce({ version: { id: "version" } });
    await expect(redeemPrototype("prototype-secret", "password")).resolves.toEqual({ boardId: "board" });
    await expect(getSharedBoardVersion("version", "version-secret")).resolves.toEqual({ id: "version" });
    expect(publicFetch).toHaveBeenNthCalledWith(1, "/api/platform", expect.objectContaining({ body: JSON.stringify({ action: "redeem-prototype", token: "prototype-secret", password: "password" }) }));
    expect(publicFetch).toHaveBeenNthCalledWith(2, "/api/versions?versionId=version&token=version-secret");
  });

  it("covers every workspace lifecycle and governance mutation", async () => {
    [
      { added: true }, { cancelled: true }, { transferred: true }, { left: true },
      { unpublished: true }, { boardId: "remix" }, { cancelled: true },
    ].forEach((value) => vi.mocked(authenticatedFetch).mockResolvedValueOnce(value));
    await inviteWorkspaceMember("workspace", "person@example.com", "guest");
    await cancelWorkspaceInvitation("workspace", "invite");
    await transferWorkspaceOwnership("workspace", "member");
    await leaveWorkspace("workspace");
    await unpublishCommunity("board");
    await remixCommunity("board");
    await cancelAccountDeletion();
    expect(authenticatedFetch).toHaveBeenCalledWith("/api/platform", expect.objectContaining({ body: expect.stringContaining("transfer-workspace-ownership") }));
  });

  it("covers all version and branch contracts, including optional branch scoping", async () => {
    const version = { id: "version", board_id: "board", kind: "checkpoint", created_at: "now" };
    const branch = { id: "branch", room_id: "branch:branch", status: "open" };
    [
      { versions: [version] }, { version: { ...version, document: {} } }, { version }, { version, skipped: false }, { version },
      { diff: [] }, { boardId: "copy" }, { token: "secret", url: "url" }, { restored: true },
      { branches: [branch] }, { branch }, { merged: true }, { archived: true }, { diff: [] }, { reviewed: true },
      { branch }, { restored: true }, { requested: ["reviewer"] }, { updated: true, diff: [] },
    ].forEach((value) => vi.mocked(authenticatedFetch).mockResolvedValueOnce(value));
    await listBoardVersions("board", "branch"); await getBoardVersion("board", "version", "branch");
    await createBoardCheckpoint("board", "Milestone", "Ready", "branch"); await createBoardAutosave("board", "branch");
    await renameBoardVersion("board", "version", "Renamed", "Description", "branch"); await compareBoardVersion("board", "version", "branch");
    await duplicateBoardVersion("board", "version", "Copy", "branch"); await shareBoardVersion("board", "version", "later", "branch"); await restoreBoardVersion("board", "version", "branch");
    await listDesignBranches("board"); await createDesignBranch("board", "Exploration"); await mergeDesignBranch("board", "branch", "Done");
    await archiveDesignBranch("board", "branch"); await diffDesignBranch("board", "branch"); await reviewDesignBranch("board", "branch", "approved", "Looks good");
    await renameDesignBranch("board", "branch", "Renamed"); await restoreDesignBranch("board", "branch"); await requestBranchReview("board", "branch", ["reviewer"], "Please review"); await updateBranchFromMain("board", "branch", { shape: "main" });
    expect(authenticatedFetch).toHaveBeenCalledWith("/api/versions?boardId=board&versionId=version&branchId=branch");
    expect(authenticatedFetch).toHaveBeenCalledWith("/api/branches", expect.objectContaining({ body: expect.stringContaining("update-from-main") }));
  });

  it("covers collaborator invitation, role, ownership, and acceptance contracts", async () => {
    [
      { collaborators: [] }, { plan: { boards: [], truncated: false } }, { plan: { boards: [], truncated: false }, invitations: [] },
      { uid: "person" }, { uid: "friend" }, undefined, { uid: "person", role: "viewer" }, { transferred: true }, { left: true },
      { cancelled: true }, { resent: true }, { accepted: true, boardId: "board" },
    ].forEach((value) => vi.mocked(authenticatedFetch).mockResolvedValueOnce(value));
    await listBoardCollaborators("board"); await getBoardSharePlan("board"); await getBoardSharingOverview("board");
    await inviteBoardCollaborator("board", "person@example.com", "editor", true); await inviteBoardFriend("board", "friend", "viewer", false);
    await removeBoardCollaborator("board", "person", true); await updateBoardCollaboratorRole("board", "person", "viewer", false);
    await transferBoardOwnership("board", "person"); await leaveSharedBoard("board"); await cancelBoardInvitation("board", "invite");
    await resendBoardInvitation("board", "invite"); await acceptBoardInvitation("secret");
    expect(authenticatedFetch).toHaveBeenCalledWith("/api/share-board", expect.objectContaining({ body: expect.stringContaining("transfer-owner") }));
  });
});
