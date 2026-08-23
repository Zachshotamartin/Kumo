import { authenticatedFetch } from "./apiClient";
import {
  archiveDesignBranch,
  createDesignBranch,
  listDesignBranches,
  mergeDesignBranch,
  type DesignBranch,
} from "./branchRepository";
import { listBoardCollaborators, type BoardCollaborator } from "./collaboratorRepository";
import {
  createBoardCheckpoint,
  getBoardVersion,
  listBoardVersions,
  restoreBoardVersion,
  type BoardVersion,
  type BoardVersionDetail,
} from "./versionRepository";

vi.mock("./apiClient", () => ({ authenticatedFetch: vi.fn() }));

describe("collaboration platform repositories", () => {
  beforeEach(() => vi.clearAllMocks());

  it("lists board collaborators with an encoded board id", async () => {
    const collaborator: BoardCollaborator = { id: "user", email: "a@example.com", name: "Ada", avatar: "", role: "editor" };
    vi.mocked(authenticatedFetch).mockResolvedValue({ collaborators: [collaborator] });
    await expect(listBoardCollaborators("board / one")).resolves.toEqual([collaborator]);
    expect(authenticatedFetch).toHaveBeenCalledWith("/api/collaborators?boardId=board%20%2F%20one");
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
});
