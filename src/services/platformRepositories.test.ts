import { authenticatedFetch } from "./apiClient";
import {
  archiveDesignBranch,
  createDesignBranch,
  listDesignBranches,
  mergeDesignBranch,
  type DesignBranch,
} from "./branchRepository";
import {
  getBoardSharePlan,
  inviteBoardCollaborator,
  listBoardCollaborators,
  removeBoardCollaborator,
  type BoardCollaborator,
} from "./collaboratorRepository";
import {
  createBoardCheckpoint,
  getBoardVersion,
  listBoardVersions,
  restoreBoardVersion,
  type BoardVersion,
  type BoardVersionDetail,
} from "./versionRepository";
import {
  applyLibrary,
  createFolder,
  createShareLink,
  createTemplate,
  instantiateTemplate,
  loadAccessRequests,
  loadLibraries,
  loadLibraryDiff,
  loadNotifications,
  loadProductGraph,
  loadShareLinks,
  loadTemplates,
  loadWorkspaceOverview,
  markNotificationRead,
  organizeBoard,
  publishLibrary,
  redeemShareLink,
  requestBoardAccess,
  resolveAccessRequest,
  revokeShareLink,
} from "./productRepository";

vi.mock("./apiClient", () => ({ authenticatedFetch: vi.fn() }));

describe("collaboration platform repositories", () => {
  beforeEach(() => vi.clearAllMocks());

  it("lists board collaborators with an encoded board id", async () => {
    const collaborator: BoardCollaborator = { id: "user", email: "a@example.com", name: "Ada", avatar: "", role: "editor" };
    vi.mocked(authenticatedFetch).mockResolvedValue({ collaborators: [collaborator] });
    await expect(listBoardCollaborators("board / one")).resolves.toEqual([collaborator]);
    expect(authenticatedFetch).toHaveBeenCalledWith("/api/collaborators?boardId=board%20%2F%20one");
  });

  it("loads a linked-board share plan and sends explicit propagation choices", async () => {
    const plan = { boards: [], truncated: false };
    const result = { uid: "user", email: "a@example.com", role: "viewer", sharedBoards: [], unavailableBoards: [] };
    vi.mocked(authenticatedFetch)
      .mockResolvedValueOnce({ plan })
      .mockResolvedValueOnce(result)
      .mockResolvedValueOnce(undefined);
    await expect(getBoardSharePlan("board / one")).resolves.toEqual(plan);
    await expect(inviteBoardCollaborator("board", "a@example.com", "viewer", true)).resolves.toEqual(result);
    await expect(removeBoardCollaborator("board", "user", false)).resolves.toBeUndefined();
    expect(authenticatedFetch).toHaveBeenNthCalledWith(1, "/api/share-board?boardId=board%20%2F%20one");
    expect(authenticatedFetch).toHaveBeenNthCalledWith(2, "/api/share-board", expect.objectContaining({
      body: JSON.stringify({ boardId: "board", action: "invite", email: "a@example.com", role: "viewer", includeLinkedBoards: true }),
    }));
    expect(authenticatedFetch).toHaveBeenNthCalledWith(3, "/api/share-board", expect.objectContaining({
      body: JSON.stringify({ boardId: "board", action: "remove", memberUid: "user", includeLinkedBoards: false }),
    }));
  });

  it("lists, creates, merges, and archives isolated design branches", async () => {
    const branch: DesignBranch = {
      id: "branch", board_id: "board", name: "Exploration", room_id: "branch:branch", created_by: "user",
      status: "open", created_at: "2026-08-23T00:00:00.000Z", updated_at: "2026-08-23T00:00:00.000Z", merged_at: null,
    };
    vi.mocked(authenticatedFetch)
      .mockResolvedValueOnce({ branches: [branch] })
      .mockResolvedValueOnce({ branch })
      .mockResolvedValueOnce({ merged: true, checkpointId: "checkpoint", revision: 42 })
      .mockResolvedValueOnce({ archived: true });
    await expect(listDesignBranches("board one")).resolves.toEqual([branch]);
    await expect(createDesignBranch("board", "Exploration")).resolves.toEqual(branch);
    await expect(mergeDesignBranch("board", "branch")).resolves.toEqual({ merged: true, checkpointId: "checkpoint", revision: 42 });
    await expect(archiveDesignBranch("board", "branch")).resolves.toEqual({ archived: true });
    expect(authenticatedFetch).toHaveBeenNthCalledWith(2, "/api/branches", {
      method: "POST", body: JSON.stringify({ action: "create", boardId: "board", name: "Exploration" }),
    });
  });

  it("lists, previews, checkpoints, and restores board versions", async () => {
    const version: BoardVersion = {
      id: "version", board_id: "board", name: "Review", description: "Ready", created_by: "user",
      kind: "checkpoint", created_at: "2026-08-23T00:00:00.000Z",
    };
    const detail: BoardVersionDetail = { ...version, document: { backgroundColor: "#252629", nodes: {} } };
    vi.mocked(authenticatedFetch)
      .mockResolvedValueOnce({ versions: [version] })
      .mockResolvedValueOnce({ version: detail })
      .mockResolvedValueOnce({ version })
      .mockResolvedValueOnce({ restored: true, versionId: version.id, beforeRestoreId: "recovery", revision: 84 });
    await expect(listBoardVersions("board / one", "branch / one")).resolves.toEqual([version]);
    await expect(getBoardVersion("board / one", "version / one", "branch / one")).resolves.toEqual(detail);
    await expect(createBoardCheckpoint("board", "Review", "Ready", "branch / one")).resolves.toEqual(version);
    await expect(restoreBoardVersion("board", version.id, "branch / one")).resolves.toEqual({ restored: true, versionId: version.id, beforeRestoreId: "recovery", revision: 84 });
    expect(authenticatedFetch).toHaveBeenNthCalledWith(1, "/api/versions?boardId=board%20%2F%20one&branchId=branch%20%2F%20one");
    expect(authenticatedFetch).toHaveBeenNthCalledWith(2, "/api/versions?boardId=board%20%2F%20one&versionId=version%20%2F%20one&branchId=branch%20%2F%20one");
    expect(authenticatedFetch).toHaveBeenNthCalledWith(3, "/api/versions", expect.objectContaining({ body: JSON.stringify({ action: "checkpoint", boardId: "board", name: "Review", description: "Ready", branchId: "branch / one" }) }));
  });

  it("covers the product graph, workspace, inbox, libraries, templates, access, and governed sharing API", async () => {
    const graph = { sourceId: "board", nodes: [], edges: [], incoming: [] };
    const workspace = { workspace: { workspace_id: "workspace", role: "owner", workspaces: { id: "workspace", name: "Workspace", owner_id: "user" } }, folders: [], organization: [] };
    const responses: unknown[] = [
      { graph }, workspace, { notifications: [] }, { updated: true },
      { libraries: [], subscriptions: [] }, { libraryId: "library", version: 1, assetCount: 2 },
      { version: 2, diff: [] }, { applied: true, version: 2, diff: [] },
      { templates: [] }, { template: { id: "template" } }, { boardId: "new-board" },
      { folder: { id: "folder" } }, { organization: { board_id: "board" } },
      { request: { id: "request", status: "pending" } }, { link: { id: "link" }, token: "secret" },
      { boardId: "board", role: "viewer" }, { links: [] }, { revoked: true },
      { requests: [] }, { resolved: true, status: "approved" },
    ];
    responses.forEach((value) => vi.mocked(authenticatedFetch).mockResolvedValueOnce(value));

    await expect(loadProductGraph("board / one")).resolves.toEqual(graph);
    await expect(loadWorkspaceOverview()).resolves.toEqual(workspace);
    await expect(loadNotifications()).resolves.toEqual([]);
    await markNotificationRead("notice");
    await loadLibraries("board");
    await publishLibrary("board", { name: "Library", description: "Design", visibility: "public", versionDescription: "Initial" });
    await loadLibraryDiff("board", "library");
    await applyLibrary("board", "library");
    await loadTemplates();
    await createTemplate("board", "Template", "Description", "private");
    await instantiateTemplate("template", "Copy");
    await createFolder("Folder", null);
    await organizeBoard("favorite-board", "board", { favorite: true });
    await requestBoardAccess("board", "viewer", "Please");
    await createShareLink("board", { role: "viewer", allowedDomain: "example.com" });
    await redeemShareLink("secret");
    await loadShareLinks("board");
    await revokeShareLink("link");
    await loadAccessRequests("board");
    await resolveAccessRequest("request", "approved");

    expect(authenticatedFetch).toHaveBeenNthCalledWith(1, "/api/product?scope=graph&boardId=board%20%2F%20one");
    expect(authenticatedFetch).toHaveBeenNthCalledWith(4, "/api/product", expect.objectContaining({ body: JSON.stringify({ action: "mark-notification", id: "notice" }) }));
    expect(authenticatedFetch).toHaveBeenNthCalledWith(15, "/api/product", expect.objectContaining({ body: JSON.stringify({ action: "create-share-link", boardId: "board", role: "viewer", allowedDomain: "example.com" }) }));
    expect(authenticatedFetch).toHaveBeenNthCalledWith(17, "/api/product?scope=share-links&boardId=board");
  });
});
