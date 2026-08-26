import { buildAccountExport } from "../../server/api/_accountExport";

const mocks = vi.hoisted(() => ({
  getDocument: vi.fn(),
  getThreads: vi.fn(),
  database: null as unknown,
}));

vi.mock("../../server/api/_liveblocks", () => ({
  liveblocksAdmin: () => ({ getStorageDocument: mocks.getDocument, getThreads: mocks.getThreads }),
}));
vi.mock("../../server/api/_supabase", () => ({ supabaseAdmin: () => mocks.database }));

interface Result { data: unknown; error: unknown }

class ExportDatabase {
  results = new Map<string, Result>();
  downloadError: unknown = null;
  downloaded: string[] = [];

  set(table: string, data: unknown, error: unknown = null) {
    this.results.set(table, { data, error });
    return this;
  }

  from(table: string) {
    const query = {
      select: () => query,
      eq: () => query,
      or: () => query,
      in: () => query,
      order: () => query,
      then: (resolve: (result: Result) => unknown, reject: (error: unknown) => unknown) =>
        Promise.resolve(this.results.get(table) ?? { data: [], error: null }).then(resolve, reject),
    };
    return query;
  }

  storage = {
    from: () => ({
      download: async (key: string) => {
        this.downloaded.push(key);
        return {
          data: { arrayBuffer: async () => Uint8Array.from([75, 117, 109, 111]).buffer },
          error: this.downloadError,
        };
      },
    }),
  };
}

const profile = {
  uid: "user", email: "user@example.com", emailVerified: true, displayName: "User",
  avatarUrl: null, username: "user-name", bio: "", discoverable: true,
  friendRequestPolicy: "everyone" as const,
};

const allTables = (database: ExportDatabase, value: unknown[] | null = []) => {
  for (const table of [
    "account_notifications", "friendships", "audit_events", "assets", "document_snapshots",
    "document_branches", "design_libraries", "design_library_subscriptions", "board_organization",
    "board_members", "workspace_members", "workspace_invitations", "board_templates", "community_publications",
    "community_reports", "design_library_versions", "workspaces", "notification_preferences",
    "board_notification_mutes", "saved_board_views", "account_sessions", "account_deletion_requests",
    "push_subscriptions", "installed_extensions", "performance_events", "board_invitations",
    "branch_reviews", "branch_conflicts", "board_links", "board_access_requests", "board_share_links",
    "prototype_share_links", "board_open_sessions", "workspace_folders", "workspace_fonts",
  ]) database.set(table, value);
  return database;
};

describe("portable account export", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getDocument.mockImplementation(async (roomId: string) => ({ roomId, nodes: {} }));
    mocks.getThreads.mockImplementation(async ({ roomId }: { roomId: string }) => ({ data: [{
      id: `thread:${roomId}`,
      comments: roomId === "board:no-comments"
        ? [{ id: `other:${roomId}`, userId: "other" }]
        : [{ id: `mine:${roomId}`, userId: "user" }, { id: `other:${roomId}`, userId: "other" }],
    }] }));
  });

  it("exports full board, branch, asset, workspace, social, and community data", async () => {
    const database = allTables(new ExportDatabase())
      .set("boards", [{ id: "board", owner_id: "user", title: "Owned", visibility: "private", liveblocks_room_id: "board:one", thumbnail_asset_id: null, legacy_rtdb_id: null, created_at: new Date(0).toISOString(), updated_at: new Date(1).toISOString(), deleted_at: "2026-08-25T00:00:00Z" }])
      .set("assets", [{ id: "asset", storage_key: "board/asset.png" }])
      .set("document_snapshots", [{ id: "snapshot" }])
      .set("document_branches", [{ id: "branch", room_id: "branch:one" }])
      .set("design_libraries", [{ id: "library" }])
      .set("design_library_versions", [{ id: "version", library_id: "library" }])
      .set("account_notifications", [{ id: "notification" }])
      .set("board_members", [
        { board_id: "shared", user_id: "user", role: "viewer", boards: [{ id: "shared", liveblocks_room_id: "board:shared" }] },
        { board_id: "no-comments", user_id: "user", role: "viewer", boards: { id: "no-comments", liveblocks_room_id: "board:no-comments" } },
        { board_id: "board", user_id: "user", role: "owner", boards: { id: "board", liveblocks_room_id: "board:one" } },
        { board_id: "missing", user_id: "user", role: "viewer" },
      ])
      .set("workspace_members", [{ workspace_id: "workspace" }])
      .set("workspaces", [{ id: "workspace", owner_id: "user" }])
      .set("workspace_fonts", [{ id: "font", storage_key: "workspace/font.woff2", uploaded_by: "user" }])
      .set("branch_reviews", [{ branch_id: "branch", reviewer_id: "reviewer" }])
      .set("branch_conflicts", [{ branch_id: "branch", shape_id: "shape" }])
      .set("notification_preferences", [{ user_id: "user", digest: "daily" }])
      .set("saved_board_views", [{ id: "view", user_id: "user" }])
      .set("installed_extensions", [{ extension_id: "tokens.export" }]);
    mocks.database = database;

    const result = await buildAccountExport("user", profile);
    expect(result).toMatchObject({
      format: "kumo-account-export", version: 3, profile,
      boardDocuments: [{ boardId: "board", roomId: "board:one", comments: [{ id: "thread:board:one" }] }],
      assets: [{ id: "asset", encoding: "base64", data: "S3Vtbw==" }],
      branchDocuments: [{ branchId: "branch", roomId: "branch:one", comments: [{ id: "thread:branch:one" }] }],
      libraryVersions: [{ id: "version", library_id: "library" }],
      workspaceMemberships: [{ workspace_id: "workspace" }],
      boardMemberships: expect.any(Array),
      sharedAuthoredComments: [{ boardId: "shared", roomId: "board:shared", threads: [{
        threadId: "thread:board:shared", comments: [{ id: "mine:board:shared", userId: "user" }],
      }] }, { boardId: "no-comments", roomId: "board:no-comments", threads: [] }],
      notifications: [{ id: "notification" }],
      branchReviews: [{ branch_id: "branch", reviewer_id: "reviewer" }],
      branchConflicts: [{ branch_id: "branch", shape_id: "shape" }],
      ownedWorkspaces: [{ id: "workspace", owner_id: "user" }],
      uploadedWorkspaceFonts: [{ id: "font", encoding: "base64", data: "S3Vtbw==" }],
      notificationPreferences: [{ user_id: "user", digest: "daily" }],
      savedViews: [{ id: "view", user_id: "user" }],
      installedExtensions: [{ extension_id: "tokens.export" }],
    });
    expect(result.exportedAt).toEqual(expect.any(String));
    expect(result.boardMemberships).toEqual(expect.arrayContaining([expect.objectContaining({ board_id: "shared", user_id: "user", role: "viewer" })]));
    expect(database.downloaded).toEqual(["board/asset.png", "workspace/font.woff2"]);
    expect(mocks.getDocument).toHaveBeenCalledTimes(2);
    expect(mocks.getThreads).toHaveBeenCalledTimes(4);
  });

  it("returns complete empty sections without board-dependent queries", async () => {
    const database = allTables(new ExportDatabase(), null);
    database.set("boards", null);
    database.set("document_snapshots", undefined).set("document_branches", undefined).set("assets", undefined);
    mocks.database = database;
    const result = await buildAccountExport("user", profile);
    expect(result).toMatchObject({
      boards: [], boardDocuments: [], assets: [], snapshots: [], branches: [], branchDocuments: [],
      libraries: [], libraryVersions: [], notifications: [], friendships: [], auditEvents: [],
      organization: [], workspaceMemberships: [], workspaceInvitations: [], templates: [],
      boardMemberships: [],
      sharedAuthoredComments: [], branchReviews: [], branchConflicts: [], boardLinks: [],
      boardInvitations: [], boardAccessRequestsMade: [], boardAccessRequestsReceived: [],
      boardShareLinks: [], prototypeShareLinks: [], boardOpenSessions: [], ownedWorkspaces: [],
      ownedWorkspaceFolders: [], createdWorkspaceFolders: [], uploadedWorkspaceFonts: [],
      notificationPreferences: [], notificationMutes: [], savedViews: [], accountSessions: [],
      accountDeletionRequests: [], pushSubscriptions: [], installedExtensions: [], performanceEvents: [],
      communityPublications: [], communityReports: [],
    });
    expect(database.downloaded).toEqual([]);
  });

  it("normalizes null board-owned collections for an existing board", async () => {
    const database = allTables(new ExportDatabase())
      .set("boards", [{ id: "board", owner_id: "user", title: "Owned", visibility: "private", liveblocks_room_id: "board:one", thumbnail_asset_id: null, legacy_rtdb_id: null, created_at: new Date(0).toISOString(), updated_at: new Date(1).toISOString(), deleted_at: null }])
      .set("assets", null)
      .set("document_snapshots", null)
      .set("document_branches", null);
    mocks.database = database;
    await expect(buildAccountExport("user", profile)).resolves.toMatchObject({
      assets: [], snapshots: [], branches: [], branchDocuments: [],
    });
  });

  it("surfaces relational and portable-asset failures", async () => {
    const database = allTables(new ExportDatabase()).set("friendships", null, new Error("friends failed"));
    mocks.database = database;
    await expect(buildAccountExport("user", profile)).rejects.toThrow("friends failed");

    const assetDatabase = allTables(new ExportDatabase())
      .set("boards", [{ id: "board", owner_id: "user", title: "Owned", visibility: "private", liveblocks_room_id: "board:one", thumbnail_asset_id: null, legacy_rtdb_id: null, created_at: new Date(0).toISOString(), updated_at: new Date(1).toISOString(), deleted_at: null }])
      .set("assets", [{ storage_key: "broken" }]);
    assetDatabase.downloadError = new Error("download failed");
    mocks.database = assetDatabase;
    await expect(buildAccountExport("user", profile)).rejects.toThrow("download failed");
  });
});
