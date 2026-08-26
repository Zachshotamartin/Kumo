import { deleteAccountResources, purgeBoardResources, runLifecycleMaintenance } from "../../server/api/_lifecycle";

const mocks = vi.hoisted(() => ({
  database: null as unknown,
  deleteRoom: vi.fn(),
  getThreads: vi.fn(),
  deleteComment: vi.fn(),
  legacyRemove: vi.fn(),
  deleteUser: vi.fn(),
  digests: vi.fn(),
}));

vi.mock("../../server/api/_supabase", () => ({ supabaseAdmin: () => mocks.database }));
vi.mock("../../server/api/_liveblocks", () => ({ liveblocksAdmin: () => ({
  deleteRoom: mocks.deleteRoom, getThreads: mocks.getThreads, deleteComment: mocks.deleteComment,
}) }));
vi.mock("../../server/api/_firebaseAdmin", () => ({
  adminDatabase: () => ({ ref: () => ({ remove: mocks.legacyRemove }) }),
  privilegedAdminAuth: () => ({ deleteUser: mocks.deleteUser }),
}));
vi.mock("../../server/api/_push", () => ({ sendDueNotificationDigests: mocks.digests }));

interface QueryResult { data?: unknown; error?: unknown }

class FakeDatabase {
  queues = new Map<string, QueryResult[]>();
  calls: Array<{ table: string; operation: string; value?: unknown }> = [];
  removals: Array<{ bucket: string; keys: string[] }> = [];
  storageError: unknown = null;
  rpcResults: QueryResult[] = [];

  queue(table: string, operation: string, ...results: QueryResult[]) {
    this.queues.set(`${table}:${operation}`, results);
    return this;
  }

  take(table: string, operation: string): QueryResult {
    return this.queues.get(`${table}:${operation}`)?.shift() ?? { data: null, error: null };
  }

  from(table: string) {
    let operation = "select";
    let value: unknown;
    const query = {
      select: () => { operation = "select"; return query; },
      update: (next: unknown) => { operation = "update"; value = next; return query; },
      insert: (next: unknown) => { operation = "insert"; value = next; return query; },
      delete: () => { operation = "delete"; return query; },
      eq: () => query,
      in: () => query,
      not: () => query,
      lte: () => query,
      limit: () => query,
      maybeSingle: () => Promise.resolve(this.finish(table, operation, value)),
      then: (resolve: (result: QueryResult) => unknown, reject: (error: unknown) => unknown) =>
        Promise.resolve(this.finish(table, operation, value)).then(resolve, reject),
    };
    return query;
  }

  finish(table: string, operation: string, value?: unknown) {
    this.calls.push({ table, operation, value });
    return this.take(table, operation);
  }

  rpc(name: string) {
    this.calls.push({ table: name, operation: "rpc" });
    return Promise.resolve(this.rpcResults.shift() ?? { data: [], error: null });
  }

  storage = {
    from: (bucket: string) => ({
      remove: async (keys: string[]) => {
        this.removals.push({ bucket, keys });
        return { error: this.storageError };
      },
    }),
  };
}

const lifecycleBoard = (id = "board") => ({ id, liveblocks_room_id: `board:${id}`, legacy_rtdb_id: `legacy-${id}` });

describe("reliability lifecycle maintenance", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.deleteRoom.mockReset().mockResolvedValue(undefined);
    mocks.legacyRemove.mockReset().mockResolvedValue(undefined);
    mocks.deleteUser.mockReset().mockResolvedValue(undefined);
    mocks.getThreads.mockReset().mockResolvedValue({ data: [] });
    mocks.deleteComment.mockReset().mockResolvedValue(undefined);
    mocks.digests.mockReset().mockResolvedValue({ users: 2, delivered: 3 });
  });

  it("purges all board storage, branch rooms, legacy data, and the database row", async () => {
    const database = new FakeDatabase()
      .queue("assets", "select", { data: [{ storage_key: "asset" }, { storage_key: "asset" }, { storage_key: "" }], error: null })
      .queue("document_branches", "select", { data: [{ room_id: "branch:one" }, { room_id: "branch:two" }, { room_id: "branch:three" }, { room_id: "branch:four" }], error: null })
      .queue("boards", "delete", { error: null });
    mocks.deleteRoom
      .mockRejectedValueOnce({ status: 404 })
      .mockRejectedValueOnce({ status: 500, statusCode: 404 })
      .mockRejectedValueOnce({ status: 500, statusCode: 500, code: "auth/user-not-found" })
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined);

    await purgeBoardResources(lifecycleBoard(), database as never);
    expect(database.removals).toEqual([{ bucket: "board-assets", keys: ["asset"] }]);
    expect(mocks.deleteRoom).toHaveBeenCalledTimes(5);
    expect(mocks.legacyRemove).toHaveBeenCalled();
    expect(database.calls).toContainEqual(expect.objectContaining({ table: "boards", operation: "delete" }));
  });

  it("does not hide real room, storage, lookup, or board deletion failures", async () => {
    const lookup = new FakeDatabase()
      .queue("assets", "select", { data: null, error: new Error("assets failed") })
      .queue("document_branches", "select", { data: [], error: null });
    await expect(purgeBoardResources(lifecycleBoard(), lookup as never)).rejects.toThrow("assets failed");

    const branches = new FakeDatabase()
      .queue("assets", "select", { data: [], error: null })
      .queue("document_branches", "select", { data: null, error: new Error("branches failed") });
    await expect(purgeBoardResources(lifecycleBoard(), branches as never)).rejects.toThrow("branches failed");

    const storage = new FakeDatabase()
      .queue("assets", "select", { data: [{ storage_key: "asset" }], error: null })
      .queue("document_branches", "select", { data: [], error: null });
    storage.storageError = new Error("storage failed");
    await expect(purgeBoardResources(lifecycleBoard(), storage as never)).rejects.toThrow("storage failed");

    const room = new FakeDatabase()
      .queue("assets", "select", { data: [], error: null })
      .queue("document_branches", "select", { data: [], error: null });
    mocks.deleteRoom.mockRejectedValueOnce(null);
    await expect(purgeBoardResources(lifecycleBoard(), room as never)).rejects.toBeNull();
    mocks.deleteRoom.mockRejectedValueOnce(new Error("room failed"));
    await expect(purgeBoardResources(lifecycleBoard(), room as never)).rejects.toThrow("room failed");

    const deletion = new FakeDatabase()
      .queue("assets", "select", { data: [], error: null })
      .queue("document_branches", "select", { data: [], error: null })
      .queue("boards", "delete", { error: new Error("delete failed") });
    await expect(purgeBoardResources({ ...lifecycleBoard(), legacy_rtdb_id: null }, deletion as never)).rejects.toThrow("delete failed");
  });

  it("deletes a complete account while preserving resources owned by surviving boards and workspaces", async () => {
    const database = new FakeDatabase()
      .queue("profiles", "select", { data: { avatar_storage_key: "avatar" }, error: null })
      .queue("boards", "select", { data: [], error: null })
      .queue("board_members", "select", { data: [], error: null })
      .queue("profiles", "delete", { error: null });
    await deleteAccountResources({ user_id: "user", attempt_count: 1 }, database as never);
    expect(database.removals).toEqual([
      { bucket: "profile-avatars", keys: ["avatar"] },
    ]);
    expect(mocks.deleteUser).toHaveBeenCalledWith("user");
  });

  it("purges owned boards and accepts null relational collections during account deletion", async () => {
    const database = new FakeDatabase()
      .queue("profiles", "select", { data: null, error: null })
      .queue("boards", "select", { data: [lifecycleBoard("owned")], error: null })
      .queue("assets", "select", { data: null, error: null }, { data: null, error: null })
      .queue("document_branches", "select", { data: null, error: null })
      .queue("boards", "delete", { error: null })
      .queue("board_members", "select", { data: null, error: null })
      .queue("profiles", "delete", { error: null });
    await deleteAccountResources({ user_id: "user", attempt_count: 1 }, database as never);
    expect(mocks.deleteRoom).toHaveBeenCalledWith("board:owned");
  });

  it("accepts a null owned-board collection during account deletion", async () => {
    const database = new FakeDatabase()
      .queue("profiles", "select", { data: null, error: null })
      .queue("boards", "select", { data: null, error: null })
      .queue("board_members", "select", { data: null, error: null })
      .queue("profiles", "delete", { error: null });
    await expect(deleteAccountResources({ user_id: "user", attempt_count: 1 }, database as never)).resolves.toBeUndefined();
  });

  it.each([
    ["profile lookup", "profiles", "select"],
    ["owned board lookup", "boards", "select"],
    ["comment membership lookup", "board_members", "select"],
  ])("surfaces a %s error during account deletion", async (_label, failingTable, failingOperation) => {
    const database = new FakeDatabase()
      .queue("profiles", "select", { data: null, error: failingTable === "profiles" ? new Error("failed") : null })
      .queue("boards", "select", { data: [], error: failingTable === "boards" ? new Error("failed") : null })
      .queue("board_members", "select", { data: [], error: failingTable === "board_members" ? new Error("failed") : null });
    await expect(deleteAccountResources({ user_id: "user", attempt_count: 1 }, database as never)).rejects.toThrow("failed");
    expect(failingOperation).toBe("select");
  });

  it("surfaces auth and profile deletion errors while tolerating a missing identity", async () => {
    const base = () => new FakeDatabase()
      .queue("profiles", "select", { data: null, error: null })
      .queue("boards", "select", { data: [], error: null })
      .queue("board_members", "select", { data: [], error: null });

    const authDelete = base();
    mocks.deleteUser.mockRejectedValueOnce(new Error("auth delete"));
    await expect(deleteAccountResources({ user_id: "user", attempt_count: 1 }, authDelete as never)).rejects.toThrow("auth delete");

    const missingIdentity = base().queue("profiles", "delete", { error: new Error("profile delete") });
    mocks.deleteUser.mockRejectedValueOnce({ code: "auth/user-not-found" });
    await expect(deleteAccountResources({ user_id: "user", attempt_count: 1 }, missingIdentity as never)).rejects.toThrow("profile delete");
  });

  it("removes the departing user's comments from surviving board and branch rooms", async () => {
    const database = new FakeDatabase()
      .queue("profiles", "select", { data: null, error: null })
      .queue("boards", "select", { data: [], error: null }, { data: [{ liveblocks_room_id: "board:shared" }], error: null })
      .queue("board_members", "select", { data: [{ board_id: "shared" }], error: null })
      .queue("document_branches", "select", { data: [{ room_id: "branch:shared" }], error: null })
      .queue("profiles", "delete", { error: null });
    mocks.getThreads.mockResolvedValue({ data: [{ id: "thread", comments: [
      { id: "mine", userId: "user" }, { id: "theirs", userId: "other" },
    ] }] });
    await deleteAccountResources({ user_id: "user", attempt_count: 1 }, database as never);
    expect(mocks.getThreads).toHaveBeenCalledTimes(2);
    expect(mocks.deleteComment).toHaveBeenCalledTimes(2);
    expect(mocks.deleteComment).toHaveBeenCalledWith(expect.objectContaining({ threadId: "thread", commentId: "mine" }));
  });

  it("surfaces surviving-room lookup failures and distinguishes missing comment resources", async () => {
    const base = () => new FakeDatabase()
      .queue("profiles", "select", { data: null, error: null })
      .queue("boards", "select", { data: [], error: null }, { data: null, error: null })
      .queue("board_members", "select", { data: [{ board_id: "shared" }], error: null })
      .queue("document_branches", "select", { data: null, error: null })
      .queue("profiles", "delete", { error: null });

    const boardFailure = base();
    boardFailure.queue("boards", "select", { data: [], error: null }, { data: null, error: new Error("shared boards failed") });
    await expect(deleteAccountResources({ user_id: "user", attempt_count: 1 }, boardFailure as never)).rejects.toThrow("shared boards failed");

    const branchFailure = base();
    branchFailure.queue("document_branches", "select", { data: null, error: new Error("shared branches failed") });
    await expect(deleteAccountResources({ user_id: "user", attempt_count: 1 }, branchFailure as never)).rejects.toThrow("shared branches failed");

    const commentFailure = base();
    commentFailure.queue("boards", "select", { data: [], error: null }, { data: [{ liveblocks_room_id: "board:shared" }], error: null });
    mocks.getThreads.mockResolvedValueOnce({ data: [{ id: "thread", comments: [{ id: "mine", userId: "user" }] }] });
    mocks.deleteComment.mockRejectedValueOnce({ status: 404 });
    await expect(deleteAccountResources({ user_id: "user", attempt_count: 1 }, commentFailure as never)).resolves.toBeUndefined();

    const realCommentFailure = base();
    realCommentFailure.queue("boards", "select", { data: [], error: null }, { data: [{ liveblocks_room_id: "board:shared" }], error: null });
    mocks.getThreads.mockResolvedValueOnce({ data: [{ id: "thread", comments: [{ id: "mine", userId: "user" }] }] });
    mocks.deleteComment.mockRejectedValueOnce(new Error("comment delete failed"));
    await expect(deleteAccountResources({ user_id: "user", attempt_count: 1 }, realCommentFailure as never)).rejects.toThrow("comment delete failed");

    const missingRoom = base();
    missingRoom.queue("boards", "select", { data: [], error: null }, { data: [{ liveblocks_room_id: "board:shared" }], error: null });
    mocks.getThreads.mockRejectedValueOnce({ statusCode: 404 });
    await expect(deleteAccountResources({ user_id: "user", attempt_count: 1 }, missingRoom as never)).resolves.toBeUndefined();

    const realRoomFailure = base();
    realRoomFailure.queue("boards", "select", { data: [], error: null }, { data: [{ liveblocks_room_id: "board:shared" }], error: null });
    mocks.getThreads.mockRejectedValueOnce(new Error("threads failed"));
    await expect(deleteAccountResources({ user_id: "user", attempt_count: 1 }, realRoomFailure as never)).rejects.toThrow("threads failed");

    const nullBoards = base();
    nullBoards.queue("boards", "select", { data: [], error: null }, { data: null, error: null });
    nullBoards.queue("document_branches", "select", { data: [{ room_id: "branch:shared" }], error: null });
    mocks.getThreads.mockResolvedValueOnce({ data: [] });
    await expect(deleteAccountResources({ user_id: "user", attempt_count: 1 }, nullBoards as never)).resolves.toBeUndefined();
  });

  it("runs successful account, board, and notification maintenance end to end", async () => {
    const board = lifecycleBoard("expired");
    const database = new FakeDatabase()
      .queue("profiles", "select", { data: null, error: null })
      .queue("boards", "select", { data: [], error: null })
      .queue("assets", "select", { data: [], error: null }, { data: [], error: null })
      .queue("board_members", "select", { data: [], error: null })
      .queue("profiles", "delete", { error: null })
      .queue("document_branches", "select", { data: [], error: null })
      .queue("boards", "delete", { error: null });
    database.rpcResults = [
      { data: [{ user_id: "user", attempt_count: 1 }], error: null },
      { data: [board], error: null },
    ];
    mocks.database = database;
    expect(await runLifecycleMaintenance(new Date("2026-08-25T12:00:00Z"))).toEqual({
      accountsClaimed: 1, accountsDeleted: 1, accountFailures: 0,
      boardsPurged: 1, boardFailures: 0, storageCleanups: 0, storageCleanupFailures: 0,
      digestUsers: 2, digestDeliveries: 3,
    });
  });

  it("retries durable storage cleanup jobs and records cleanup failures", async () => {
    const success = new FakeDatabase().queue("storage_cleanup_jobs", "delete", { error: null });
    success.rpcResults = [
      { data: [], error: null },
      { data: [], error: null },
      { data: [{ id: "cleanup", bucket: "profile-avatars", storage_key: "old-avatar" }], error: null },
    ];
    mocks.database = success;
    await expect(runLifecycleMaintenance()).resolves.toMatchObject({ storageCleanups: 1, storageCleanupFailures: 0 });
    expect(success.removals).toContainEqual({ bucket: "profile-avatars", keys: ["old-avatar"] });

    const failure = new FakeDatabase().queue("storage_cleanup_jobs", "update", { error: null });
    failure.storageError = "storage offline";
    failure.rpcResults = [
      { data: [], error: null },
      { data: [], error: null },
      { data: [{ id: "cleanup", bucket: "profile-avatars", storage_key: "old-avatar" }], error: null },
    ];
    mocks.database = failure;
    await expect(runLifecycleMaintenance(new Date("2026-08-25T12:00:00Z"))).resolves.toMatchObject({ storageCleanups: 0, storageCleanupFailures: 1 });
    expect(failure.calls).toContainEqual(expect.objectContaining({
      table: "storage_cleanup_jobs",
      operation: "update",
      value: expect.objectContaining({ next_attempt_at: "2026-08-25T12:30:00.000Z", last_error: "Unknown storage cleanup failure" }),
    }));

    const deleteFailure = new FakeDatabase()
      .queue("storage_cleanup_jobs", "delete", { error: new Error("job delete failed") })
      .queue("storage_cleanup_jobs", "update", { error: null });
    deleteFailure.rpcResults = [
      { data: [], error: null }, { data: [], error: null },
      { data: [{ id: "cleanup", bucket: "profile-avatars", storage_key: "already-removed" }], error: null },
    ];
    mocks.database = deleteFailure;
    await expect(runLifecycleMaintenance()).resolves.toMatchObject({ storageCleanupFailures: 1 });
    expect(deleteFailure.calls).toContainEqual(expect.objectContaining({
      table: "storage_cleanup_jobs", operation: "update", value: expect.objectContaining({ last_error: "job delete failed" }),
    }));
  });

  it("surfaces storage cleanup claim failures", async () => {
    const database = new FakeDatabase();
    database.rpcResults = [
      { data: [], error: null },
      { data: [], error: null },
      { data: null, error: new Error("cleanup claim failed") },
    ];
    mocks.database = database;
    await expect(runLifecycleMaintenance()).rejects.toThrow("cleanup claim failed");
  });

  it("records both Error and non-Error maintenance failures without stopping the batch", async () => {
    const database = new FakeDatabase()
      .queue("profiles", "select", { data: null, error: new Error("first") }, { data: null, error: "second" })
      .queue("account_deletion_requests", "update", { error: null }, { error: null })
      .queue("assets", "select", { data: null, error: new Error("board one") }, { data: null, error: "board two" })
      .queue("document_branches", "select", { data: [], error: null }, { data: [], error: null })
      .queue("audit_events", "insert", { error: null }, { error: null });
    database.rpcResults = [
      { data: [{ user_id: "one", attempt_count: 1 }, { user_id: "two", attempt_count: 2 }], error: null },
      { data: [lifecycleBoard("one"), lifecycleBoard("two")], error: null },
    ];
    mocks.database = database;
    const result = await runLifecycleMaintenance();
    expect(result).toMatchObject({ accountsClaimed: 2, accountsDeleted: 0, accountFailures: 2, boardsPurged: 0, boardFailures: 2 });
    expect(database.calls.filter((call) => call.table === "account_deletion_requests")).toHaveLength(2);
    expect(database.calls.filter((call) => call.table === "audit_events")).toHaveLength(2);
  });

  it("surfaces claim and expired-board query failures", async () => {
    const claimFailure = new FakeDatabase();
    claimFailure.rpcResults = [{ data: null, error: new Error("claim failed") }];
    mocks.database = claimFailure;
    await expect(runLifecycleMaintenance()).rejects.toThrow("claim failed");

    const boardFailure = new FakeDatabase();
    boardFailure.rpcResults = [{ data: null, error: null }, { data: null, error: new Error("expired failed") }];
    mocks.database = boardFailure;
    await expect(runLifecycleMaintenance()).rejects.toThrow("expired failed");

    const nullCollections = new FakeDatabase();
    nullCollections.rpcResults = [{ data: null, error: null }, { data: null, error: null }, { data: null, error: null }];
    mocks.database = nullCollections;
    await expect(runLifecycleMaintenance()).resolves.toMatchObject({ accountsClaimed: 0, boardsPurged: 0 });
  });
});
