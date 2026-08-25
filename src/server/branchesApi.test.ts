import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createHash } from "node:crypto";
import handler from "../../server/api/handlers/branches";

const mocks = vi.hoisted(() => ({
  requireActor: vi.fn(), getAccess: vi.fn(), from: vi.fn(), getDocument: vi.fn(),
  createRoom: vi.fn(), deleteRoom: vi.fn(), initialize: vi.fn(), deleteStorage: vi.fn(), broadcast: vi.fn(), syncLinks: vi.fn(), rpc: vi.fn(),
  sendPreferredPush: vi.fn(),
}));

vi.mock("../../server/api/_auth", () => ({ requireActor: mocks.requireActor }));
vi.mock("../../server/api/_boards", () => ({ getBoardAccess: mocks.getAccess }));
vi.mock("../../server/api/_supabase", () => ({ supabaseAdmin: () => ({ from: mocks.from, rpc: mocks.rpc }) }));
vi.mock("../../server/api/_boardLinks", () => ({ syncBoardLinks: mocks.syncLinks }));
vi.mock("../../server/api/_push", () => ({ sendPreferredPushToUser: mocks.sendPreferredPush }));
vi.mock("../../server/api/_liveblocks", () => ({
  boardDocumentFromJson: (document: unknown) => ({ normalized: document }),
  liveblocksAdmin: () => ({
    getStorageDocument: mocks.getDocument, createRoom: mocks.createRoom, deleteRoom: mocks.deleteRoom,
    initializeStorageDocument: mocks.initialize, deleteStorageDocument: mocks.deleteStorage,
    broadcastEvent: mocks.broadcast,
  }),
}));

const board = { id: "board", owner_id: "owner", title: "Board", visibility: "private", liveblocks_room_id: "board:board" };
const response = () => {
  const result = { statusCode: 0, body: undefined as unknown, status(code: number) { this.statusCode = code; return this; }, json(body: unknown) { this.body = body; return this; }, setHeader: vi.fn() };
  return result as unknown as VercelResponse & typeof result;
};
const request = (method: string, body: Record<string, unknown> = {}, query: Record<string, string> = {}) => ({ method, body, query, headers: { authorization: "Bearer token" } }) as unknown as VercelRequest;
const branchQuery = (data: unknown, error: unknown = null) => ({
  select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: vi.fn().mockResolvedValue({ data, error }) }) }) }),
});

describe("design branch API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireActor.mockResolvedValue({ uid: "owner", email: "owner@example.com" });
    mocks.getAccess.mockResolvedValue({ board, role: "owner" });
    mocks.getDocument.mockResolvedValue({ backgroundColor: "#252629", nodes: {} });
    mocks.createRoom.mockResolvedValue(undefined); mocks.deleteRoom.mockResolvedValue(undefined);
    mocks.initialize.mockResolvedValue(undefined); mocks.deleteStorage.mockResolvedValue(undefined);
    mocks.broadcast.mockResolvedValue(undefined); mocks.syncLinks.mockResolvedValue(undefined);
    mocks.sendPreferredPush.mockResolvedValue({ delivered: 1, subscriptions: 1, skipped: false });
    mocks.rpc.mockImplementation(async (name: string) => ({
      data: name === "acquire_kumo_document_lease"
        ? true
        : name === "create_kumo_branch_record"
          ? { id: "branch", board_id: "board", name: "Exploration", room_id: "branch:branch", status: "open" }
          : null,
      error: null,
    }));
  });

  it("lists and creates isolated branch rooms", async () => {
    const inserted = { id: "branch", board_id: "board", name: "Exploration", room_id: "branch:branch", status: "open" };
    mocks.from.mockImplementation((table: string) => {
      if (table === "document_branches") return {
        select: () => ({ eq: () => ({ order: vi.fn().mockResolvedValue({ data: [inserted], error: null }) }) }),
        insert: () => ({ select: () => ({ single: vi.fn().mockResolvedValue({ data: inserted, error: null }) }) }),
        update: () => ({ eq: vi.fn().mockResolvedValue({ error: null }) }),
      };
      return { insert: vi.fn().mockResolvedValue({ error: null }) };
    });
    const list = response();
    await handler(request("GET", {}, { boardId: "board" }), list);
    expect(list.body).toEqual({ branches: [inserted] });
    const created = response();
    await handler(request("POST", { action: "create", boardId: "board", name: "Exploration" }), created);
    expect(mocks.createRoom).toHaveBeenCalledWith(expect.stringMatching(/^branch:/), expect.objectContaining({ metadata: expect.objectContaining({ boardId: "board" }) }));
    expect(mocks.initialize).toHaveBeenCalledWith(expect.stringMatching(/^branch:/), { normalized: expect.any(Object) });
    expect(mocks.rpc).toHaveBeenCalledWith("create_kumo_branch_record", expect.objectContaining({
      p_board_id: "board",
      p_name: "Exploration",
      p_actor_id: "owner",
    }));
    expect(created.statusCode).toBe(201);
  });

  it("removes the Liveblocks room when atomic branch creation fails", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: new Error("audit insert failed") });
    const reply = response();
    await handler(request("POST", { action: "create", boardId: "board", name: "Exploration" }), reply);
    expect(reply.statusCode).toBe(500);
    expect(mocks.deleteRoom).toHaveBeenCalledWith(expect.stringMatching(/^branch:/));
    expect(reply.body).toEqual({ error: "audit insert failed" });
  });

  it("creates a recovery point and atomically merges a branch into main", async () => {
    const current = { backgroundColor: "#000", nodes: {} };
    const branch = { id: "branch", board_id: "board", name: "Exploration", room_id: "branch:branch", status: "open", base_checksum: createHash("sha256").update(JSON.stringify(current)).digest("hex") };
    mocks.getDocument.mockImplementation(async (room: string) => room === "branch:branch" ? { backgroundColor: "#fff", nodes: { new: {} } } : current);
    mocks.from.mockImplementation((table: string) => {
      if (table === "document_branches") return {
        select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: vi.fn().mockResolvedValue({ data: branch, error: null }) }) }) }),
      };
      if (table === "branch_reviews") return { select: () => ({ eq: vi.fn().mockResolvedValue({ data: [], error: null }) }) };
      if (table === "document_snapshots") return { insert: () => ({ select: () => ({ single: vi.fn().mockResolvedValue({ data: { id: "checkpoint" }, error: null }) }) }) };
      return { insert: vi.fn().mockResolvedValue({ error: null }) };
    });
    const reply = response();
    await handler(request("POST", { action: "merge", boardId: "board", branchId: "branch" }), reply);
    expect(mocks.deleteStorage).toHaveBeenCalledWith("board:board");
    expect(mocks.initialize).toHaveBeenCalledWith("board:board", { normalized: expect.objectContaining({ nodes: { new: {} } }) });
    expect(mocks.syncLinks).toHaveBeenCalled();
    expect(mocks.rpc).toHaveBeenCalledWith("acquire_kumo_document_lease", expect.objectContaining({ p_room_id: "board:board" }));
    expect(mocks.rpc).toHaveBeenCalledWith("complete_kumo_branch_merge", expect.objectContaining({ p_branch_id: "branch" }));
    expect(mocks.rpc).toHaveBeenCalledWith("release_kumo_document_lease", expect.objectContaining({ p_room_id: "board:board" }));
    expect(mocks.broadcast).toHaveBeenCalledWith("board:board", expect.objectContaining({ type: "DOCUMENT_RESTORED", actorId: "owner", revision: expect.any(Number) }));
    expect(reply.body).toMatchObject({ merged: true, checkpointId: "checkpoint" });
  });

  it("refuses to overwrite main when it diverged from the branch base", async () => {
    const branch = { id: "branch", board_id: "board", name: "Old", room_id: "branch:branch", status: "open", base_checksum: "stale" };
    mocks.from.mockImplementation((table: string) => table === "document_branches" ? {
      select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: vi.fn().mockResolvedValue({ data: branch, error: null }) }) }) }),
    } : {});
    const reply = response();
    await handler(request("POST", { action: "merge", boardId: "board", branchId: "branch" }), reply);
    expect(reply.statusCode).toBe(409);
    expect(reply.body).toMatchObject({ code: "BRANCH_BASE_DIVERGED" });
    expect(mocks.deleteStorage).not.toHaveBeenCalled();
  });

  it("restores main and its links when the transactional database commit fails", async () => {
    const current = { backgroundColor: "#000", nodes: { current: {} } };
    const next = { backgroundColor: "#fff", nodes: { branch: {} } };
    const branch = { id: "branch", board_id: "board", name: "Exploration", room_id: "branch:branch", status: "open", base_checksum: createHash("sha256").update(JSON.stringify(current)).digest("hex") };
    mocks.getDocument.mockImplementation(async (room: string) => room === "branch:branch" ? next : current);
    mocks.rpc.mockImplementation(async (name: string) => ({
      data: name === "acquire_kumo_document_lease" ? true : null,
      error: name === "complete_kumo_branch_merge" ? new Error("database unavailable") : null,
    }));
    mocks.from.mockImplementation((table: string) => {
      if (table === "document_branches") return { select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: vi.fn().mockResolvedValue({ data: branch, error: null }) }) }) }) };
      if (table === "branch_reviews") return { select: () => ({ eq: vi.fn().mockResolvedValue({ data: [], error: null }) }) };
      if (table === "document_snapshots") return { insert: () => ({ select: () => ({ single: vi.fn().mockResolvedValue({ data: { id: "checkpoint" }, error: null }) }) }) };
      return {};
    });
    const reply = response();
    await handler(request("POST", { action: "merge", boardId: "board", branchId: "branch" }), reply);
    expect(reply.statusCode).toBe(500);
    expect(mocks.initialize).toHaveBeenNthCalledWith(1, "board:board", { normalized: next });
    expect(mocks.initialize).toHaveBeenNthCalledWith(2, "board:board", { normalized: current });
    expect(mocks.syncLinks).toHaveBeenLastCalledWith("board", current);
    expect(mocks.broadcast).not.toHaveBeenCalled();
  });

  it("rejects concurrent document mutations before touching Liveblocks storage", async () => {
    const current = { backgroundColor: "#000", nodes: {} };
    const branch = { id: "branch", board_id: "board", name: "Exploration", room_id: "branch:branch", status: "open", base_checksum: createHash("sha256").update(JSON.stringify(current)).digest("hex") };
    mocks.getDocument.mockResolvedValue(current);
    mocks.rpc.mockImplementation(async (name: string) => ({ data: name === "acquire_kumo_document_lease" ? false : null, error: null }));
    mocks.from.mockImplementation((table: string) => table === "document_branches" ? {
      select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: vi.fn().mockResolvedValue({ data: branch, error: null }) }) }) }),
    } : {});
    const reply = response();
    await handler(request("POST", { action: "merge", boardId: "board", branchId: "branch" }), reply);
    expect(reply.statusCode).toBe(409);
    expect(mocks.deleteStorage).not.toHaveBeenCalled();
  });

  it("records reviews against the branch checksum and blocks unresolved requested changes", async () => {
    const current = { backgroundColor: "#000", nodes: {} };
    const next = { backgroundColor: "#fff", nodes: { branch: { id: "branch" } } };
    const nextChecksum = createHash("sha256").update(JSON.stringify(next)).digest("hex");
    const branch = { id: "branch", board_id: "board", name: "Exploration", room_id: "branch:branch", status: "open", base_checksum: createHash("sha256").update(JSON.stringify(current)).digest("hex") };
    const upsert = vi.fn().mockResolvedValue({ error: null });
    mocks.getDocument.mockImplementation(async (room: string) => room === "branch:branch" ? next : current);
    mocks.from.mockImplementation((table: string) => {
      if (table === "document_branches") return { select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: vi.fn().mockResolvedValue({ data: branch, error: null }) }) }) }) };
      if (table === "branch_reviews") return {
        upsert,
        select: () => ({ eq: vi.fn().mockResolvedValue({ data: [{ reviewer_id: "reviewer", status: "changes-requested", reviewed_checksum: nextChecksum }], error: null }) }),
      };
      return {};
    });

    const reviewed = response();
    await handler(request("POST", { action: "review", boardId: "board", branchId: "branch", status: "changes-requested", note: "Fix alignment" }), reviewed);
    expect(reviewed.statusCode).toBe(200);
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({ reviewed_checksum: nextChecksum, note: "Fix alignment" }), expect.any(Object));

    const merge = response();
    await handler(request("POST", { action: "merge", boardId: "board", branchId: "branch" }), merge);
    expect(merge.statusCode).toBe(409);
    expect(merge.body).toMatchObject({ code: "BRANCH_CHANGES_REQUESTED", reviewers: ["reviewer"] });
    expect(mocks.deleteStorage).not.toHaveBeenCalled();
  });

  it("reports added, removed, and changed shapes in a branch diff", async () => {
    const branch = { id: "branch", board_id: "board", room_id: "branch:branch", status: "open" };
    mocks.getDocument.mockImplementation(async (room: string) => room === "branch:branch"
      ? {
          nodes: {
            same: { id: "same", type: "rectangle" },
            changed: { id: "changed", type: "rectangle", name: "Updated" },
            added: { id: "added", type: "ellipse" },
          },
        }
      : {
          nodes: {
            same: { id: "same", type: "rectangle" },
            changed: { id: "changed", type: "rectangle", name: "Original" },
            removed: { id: "removed", name: "Removed label" },
          },
        });
    mocks.from.mockImplementation((table: string) => table === "document_branches" ? {
      select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: vi.fn().mockResolvedValue({ data: branch, error: null }) }) }) }),
    } : {});

    const reply = response();
    await handler(request("POST", { action: "diff", boardId: "board", branchId: "branch" }), reply);
    expect(reply.statusCode).toBe(200);
    expect(reply.body).toEqual({
      diff: expect.arrayContaining([
        expect.objectContaining({ shapeId: "changed", status: "changed", name: "Updated" }),
        expect.objectContaining({ shapeId: "added", status: "added", name: "ellipse" }),
        expect.objectContaining({ shapeId: "removed", status: "removed", name: "Removed label" }),
      ]),
    });
    expect((reply.body as { diff: unknown[] }).diff).toHaveLength(3);
  });

  it("delivers preference-aware push when requesting branch reviews", async () => {
    const branch = { id: "branch", board_id: "board", name: "Exploration", room_id: "branch:branch", status: "open" };
    mocks.from.mockImplementation((table: string) => {
      if (table === "document_branches") return { select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: vi.fn().mockResolvedValue({ data: branch, error: null }) }) }) }) };
      if (table === "profiles") return { select: () => ({ or: vi.fn().mockResolvedValue({ data: [{ firebase_uid: "reviewer", email: "reviewer@example.com" }], error: null }) }) };
      if (table === "branch_reviews") return { upsert: vi.fn().mockResolvedValue({ error: null }) };
      if (table === "account_notifications") return { insert: vi.fn().mockResolvedValue({ error: null }) };
      return {};
    });
    const reply = response();
    await handler(request("POST", { action: "request-review", boardId: "board", branchId: "branch", reviewers: ["reviewer@example.com"], note: "Please check spacing" }), reply);
    expect(reply.body).toEqual({ requested: ["reviewer"] });
    expect(mocks.sendPreferredPush).toHaveBeenCalledWith("reviewer", "branch_reviews", expect.objectContaining({ title: "Review requested: Exploration" }));
  });

  it("validates review, archive, and unknown branch actions", async () => {
    let branch = { id: "branch", board_id: "board", room_id: "branch:branch", status: "open" };
    const updateEq = vi.fn().mockResolvedValue({ error: null });
    mocks.from.mockImplementation((table: string) => table === "document_branches" ? {
      select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: vi.fn().mockImplementation(async () => ({ data: branch, error: null })) }) }) }),
      update: () => ({ eq: updateEq }),
    } : {});

    const invalidReview = response();
    await handler(request("POST", { action: "review", status: "pending", boardId: "board", branchId: "branch" }), invalidReview);
    expect(invalidReview.statusCode).toBe(400);

    const archived = response();
    await handler(request("POST", { action: "archive", boardId: "board", branchId: "branch" }), archived);
    expect(archived.statusCode).toBe(200);
    expect(updateEq).toHaveBeenCalledWith("id", "branch");

    branch = { ...branch, status: "archived" };
    const alreadyArchived = response();
    await handler(request("POST", { action: "archive", boardId: "board", branchId: "branch" }), alreadyArchived);
    expect(alreadyArchived.statusCode).toBe(409);

    const unknown = response();
    await handler(request("POST", { action: "duplicate", boardId: "board", branchId: "branch" }), unknown);
    expect(unknown.statusCode).toBe(400);
  });

  it("enforces board, access, branch, and method boundaries", async () => {
    const missingBoard = response();
    await handler(request("GET"), missingBoard);
    expect(missingBoard.statusCode).toBe(400);

    mocks.getAccess.mockResolvedValueOnce(null);
    const missingAccess = response();
    await handler(request("GET", {}, { boardId: "board" }), missingAccess);
    expect(missingAccess.statusCode).toBe(404);

    mocks.getAccess.mockResolvedValueOnce({ board, role: "viewer" });
    const readOnly = response();
    await handler(request("POST", { action: "create", boardId: "board", name: "Nope" }), readOnly);
    expect(readOnly.statusCode).toBe(403);

    mocks.from.mockImplementation((table: string) => table === "document_branches" ? {
      select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) }) }) }),
    } : {});
    const missingBranch = response();
    await handler(request("POST", { action: "diff", boardId: "board", branchId: "missing" }), missingBranch);
    expect(missingBranch.statusCode).toBe(404);

    const method = response();
    await handler(request("DELETE", { boardId: "board" }), method);
    expect(method.statusCode).toBe(405);
  });

  it("allows a merge after requested changes become stale", async () => {
    const current = { backgroundColor: "#000", nodes: {} };
    const next = { backgroundColor: "#fff", nodes: { branch: { id: "branch" } } };
    const branch = {
      id: "branch", board_id: "board", name: "Exploration", room_id: "branch:branch", status: "open",
      base_checksum: createHash("sha256").update(JSON.stringify(current)).digest("hex"),
    };
    mocks.getDocument.mockImplementation(async (room: string) => room === "branch:branch" ? next : current);
    mocks.from.mockImplementation((table: string) => {
      if (table === "document_branches") return {
        select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: vi.fn().mockResolvedValue({ data: branch, error: null }) }) }) }),
      };
      if (table === "branch_reviews") return {
        select: () => ({ eq: vi.fn().mockResolvedValue({
          data: [{ reviewer_id: "reviewer", status: "changes-requested", reviewed_checksum: "old-checksum" }], error: null,
        }) }),
      };
      if (table === "document_snapshots") return {
        insert: () => ({ select: () => ({ single: vi.fn().mockResolvedValue({ data: { id: "checkpoint" }, error: null }) }) }),
      };
      return {};
    });

    const reply = response();
    await handler(request("POST", { action: "merge", boardId: "board", branchId: "branch" }), reply);
    expect(reply.statusCode).toBe(200);
    expect(reply.body).toMatchObject({ merged: true });
  });

  it("handles empty lists, list failures, and default create validation", async () => {
    mocks.from.mockReturnValueOnce({
      select: () => ({ eq: () => ({ order: vi.fn().mockResolvedValue({ data: null, error: null }) }) }),
    });
    const empty = response();
    await handler(request("GET", {}, { boardId: "board" }), empty);
    expect(empty.body).toEqual({ branches: [] });

    mocks.from.mockReturnValueOnce({
      select: () => ({ eq: () => ({ order: vi.fn().mockResolvedValue({ data: null, error: new Error("list failed") }) }) }),
    });
    const listError = response();
    await handler(request("GET", {}, { boardId: "board" }), listError);
    expect(listError.statusCode).toBe(500);

    for (const name of [undefined, 42, "   "]) {
      const invalid = response();
      await handler(request("POST", { boardId: "board", name }), invalid);
      expect(invalid.statusCode).toBe(400);
    }

    const malformedBoard = response();
    await handler(request("POST", { boardId: 42, name: "Branch" }), malformedBoard);
    expect(malformedBoard.statusCode).toBe(400);
  });

  it("cleans up every failed branch-creation stage", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: null });
    mocks.deleteRoom.mockRejectedValueOnce(new Error("cleanup failed"));
    const missingRecord = response();
    await handler(request("POST", { action: "create", boardId: "board", name: "Branch" }), missingRecord);
    expect(missingRecord.body).toEqual({ error: "The branch record could not be created." });

    mocks.from.mockReturnValueOnce({ update: () => ({ eq: vi.fn().mockResolvedValue({ error: new Error("base failed") }) }) });
    const baseError = response();
    await handler(request("POST", { action: "create", boardId: "board", name: "Branch" }), baseError);
    expect(baseError.statusCode).toBe(500);
  });

  it("validates branch lookup, rename, and restore transitions", async () => {
    mocks.from.mockReturnValueOnce(branchQuery(null, new Error("branch lookup failed")));
    const lookupError = response();
    await handler(request("POST", { action: "diff", boardId: "board", branchId: 42 }), lookupError);
    expect(lookupError.statusCode).toBe(500);

    const open = { id: "branch", board_id: "board", name: "Old", room_id: "branch:branch", status: "open" };
    mocks.from.mockReturnValueOnce(branchQuery(open));
    const invalidRename = response();
    await handler(request("POST", { action: "rename", boardId: "board", branchId: "branch", name: 42 }), invalidRename);
    expect(invalidRename.statusCode).toBe(400);

    mocks.from.mockImplementationOnce(() => branchQuery(open)).mockImplementationOnce(() => ({
      update: () => ({ eq: () => ({ select: () => ({ single: vi.fn().mockResolvedValue({ data: null, error: new Error("rename failed") }) }) }) }),
    }));
    const renameError = response();
    await handler(request("POST", { action: "rename", boardId: "board", branchId: "branch", name: "New" }), renameError);
    expect(renameError.statusCode).toBe(500);

    mocks.from.mockImplementationOnce(() => branchQuery(open)).mockImplementationOnce(() => ({
      update: () => ({ eq: () => ({ select: () => ({ single: vi.fn().mockResolvedValue({ data: { ...open, name: "New" }, error: null }) }) }) }),
    }));
    const renamed = response();
    await handler(request("POST", { action: "rename", boardId: "board", branchId: "branch", name: " New " }), renamed);
    expect(renamed.statusCode).toBe(200);

    mocks.from.mockReturnValueOnce(branchQuery(open));
    const openRestore = response();
    await handler(request("POST", { action: "restore", boardId: "board", branchId: "branch" }), openRestore);
    expect(openRestore.statusCode).toBe(409);

    const archived = { ...open, status: "archived" };
    mocks.from.mockImplementationOnce(() => branchQuery(archived)).mockImplementationOnce(() => ({
      update: () => ({ eq: vi.fn().mockResolvedValue({ error: new Error("restore failed") }) }),
    }));
    const restoreError = response();
    await handler(request("POST", { action: "restore", boardId: "board", branchId: "branch" }), restoreError);
    expect(restoreError.statusCode).toBe(500);

    mocks.from.mockImplementationOnce(() => branchQuery(archived)).mockImplementationOnce(() => ({
      update: () => ({ eq: vi.fn().mockResolvedValue({ error: null }) }),
    }));
    const restored = response();
    await handler(request("POST", { action: "restore", boardId: "board", branchId: "branch" }), restored);
    expect(restored.body).toEqual({ restored: true, branchId: "branch" });
  });

  it("validates review requests and propagates notification failures", async () => {
    const branch = { id: "branch", board_id: "board", name: "Review", room_id: "branch:branch", status: "open" };
    for (const reviewers of ["reviewer", [42, "   "]]) {
      mocks.from.mockReturnValueOnce(branchQuery(branch));
      const invalid = response();
      await handler(request("POST", { action: "request-review", boardId: "board", branchId: "branch", reviewers }), invalid);
      expect(invalid.statusCode).toBe(400);
    }

    mocks.from.mockImplementationOnce(() => branchQuery(branch)).mockImplementationOnce(() => ({
      select: () => ({ or: vi.fn().mockResolvedValue({ data: null, error: new Error("profiles failed") }) }),
    }));
    const profileError = response();
    await handler(request("POST", { action: "request-review", boardId: "board", branchId: "branch", reviewers: ["reviewer"] }), profileError);
    expect(profileError.statusCode).toBe(500);

    mocks.from.mockImplementationOnce(() => branchQuery(branch)).mockImplementationOnce(() => ({
      select: () => ({ or: vi.fn().mockResolvedValue({ data: [{ firebase_uid: "owner" }], error: null }) }),
    }));
    const selfOnly = response();
    await handler(request("POST", { action: "request-review", boardId: "board", branchId: "branch", reviewers: ["owner"] }), selfOnly);
    expect(selfOnly.statusCode).toBe(400);

    mocks.from.mockImplementationOnce(() => branchQuery(branch)).mockImplementationOnce(() => ({
      select: () => ({ or: vi.fn().mockResolvedValue({ data: null, error: null }) }),
    }));
    const noProfiles = response();
    await handler(request("POST", { action: "request-review", boardId: "board", branchId: "branch", reviewers: ["missing"] }), noProfiles);
    expect(noProfiles.statusCode).toBe(400);

    const reviewer = { firebase_uid: "reviewer", email: "reviewer@example.com" };
    mocks.from.mockImplementationOnce(() => branchQuery(branch))
      .mockImplementationOnce(() => ({ select: () => ({ or: vi.fn().mockResolvedValue({ data: [reviewer], error: null }) }) }))
      .mockImplementationOnce(() => ({ upsert: vi.fn().mockResolvedValue({ error: new Error("review rows failed") }) }));
    const reviewRowsError = response();
    await handler(request("POST", { action: "request-review", boardId: "board", branchId: "branch", reviewers: ["reviewer"], note: null }), reviewRowsError);
    expect(reviewRowsError.statusCode).toBe(500);

    mocks.from.mockImplementationOnce(() => branchQuery(branch))
      .mockImplementationOnce(() => ({ select: () => ({ or: vi.fn().mockResolvedValue({ data: [reviewer], error: null }) }) }))
      .mockImplementationOnce(() => ({ upsert: vi.fn().mockResolvedValue({ error: null }) }))
      .mockImplementationOnce(() => ({ insert: vi.fn().mockResolvedValue({ error: new Error("notice failed") }) }));
    const noticeError = response();
    await handler(request("POST", { action: "request-review", boardId: "board", branchId: "branch", reviewers: ["reviewer"] }), noticeError);
    expect(noticeError.statusCode).toBe(500);

    mocks.from.mockImplementationOnce(() => branchQuery(branch))
      .mockImplementationOnce(() => ({ select: () => ({ or: vi.fn().mockResolvedValue({ data: [reviewer], error: null }) }) }))
      .mockImplementationOnce(() => ({ upsert: vi.fn().mockResolvedValue({ error: null }) }))
      .mockImplementationOnce(() => ({ insert: vi.fn().mockResolvedValue({ error: null }) }));
    mocks.sendPreferredPush.mockRejectedValueOnce(new Error("push failed"));
    const pushFailure = response();
    await handler(request("POST", { action: "request-review", boardId: "board", branchId: "branch", reviewers: ["reviewer"] }), pushFailure);
    expect(pushFailure.statusCode).toBe(200);
  });

  it("updates an open branch from main and exposes merge conflicts", async () => {
    const base = {
      nodes: {
        changed: { id: "changed", x: 0 },
        deletedMain: { id: "deletedMain", x: 0 },
        deletedBranch: { id: "deletedBranch", x: 0 },
      },
    };
    const main = {
      nodes: {
        changed: { id: "changed", x: 1 },
        deletedBranch: { id: "deletedBranch", x: 1 },
        addedBoth: { id: "addedBoth", x: 1 },
      },
    };
    const branchDocument = {
      nodes: {
        changed: { id: "changed", x: 2 },
        deletedMain: { id: "deletedMain", x: 2 },
        addedBoth: { id: "addedBoth", x: 2 },
      },
    };
    const open = { id: "branch", board_id: "board", room_id: "branch:branch", status: "open", base_document: base };
    const archived = { ...open, status: "archived" };

    mocks.from.mockReturnValueOnce(branchQuery(archived));
    const closed = response();
    await handler(request("POST", { action: "update-from-main", boardId: "board", branchId: "branch" }), closed);
    expect(closed.statusCode).toBe(409);

    mocks.getDocument.mockImplementation(async (room: string) => room === "branch:branch" ? branchDocument : main);
    mocks.from.mockImplementationOnce(() => branchQuery(open)).mockImplementationOnce(() => ({
      delete: () => ({ eq: vi.fn().mockResolvedValue({ error: new Error("clear failed") }) }),
    }));
    const clearError = response();
    await handler(request("POST", { action: "update-from-main", boardId: "board", branchId: "branch", resolutions: 42 }), clearError);
    expect(clearError.statusCode).toBe(500);

    mocks.from.mockImplementationOnce(() => branchQuery(open))
      .mockImplementationOnce(() => ({ delete: () => ({ eq: vi.fn().mockResolvedValue({ error: null }) }) }))
      .mockImplementationOnce(() => ({ insert: vi.fn().mockResolvedValue({ error: new Error("conflicts failed") }) }));
    const conflictWriteError = response();
    await handler(request("POST", { action: "update-from-main", boardId: "board", branchId: "branch" }), conflictWriteError);
    expect(conflictWriteError.statusCode).toBe(500);

    mocks.from.mockImplementationOnce(() => branchQuery(open))
      .mockImplementationOnce(() => ({ delete: () => ({ eq: vi.fn().mockResolvedValue({ error: null }) }) }))
      .mockImplementationOnce(() => ({ insert: vi.fn().mockResolvedValue({ error: null }) }));
    const conflicts = response();
    await handler(request("POST", { action: "update-from-main", boardId: "board", branchId: "branch" }), conflicts);
    expect(conflicts).toMatchObject({ statusCode: 409, body: { code: "BRANCH_CONFLICTS" } });

    const branchWithoutBase = { ...open, base_document: null };
    const branchOnly = { nodes: { ...main.nodes, branchOnly: { id: "branchOnly" } } };
    mocks.getDocument.mockImplementation(async (room: string) => room === "branch:branch" ? branchOnly : main);
    mocks.from.mockImplementationOnce(() => branchQuery(branchWithoutBase))
      .mockImplementationOnce(() => ({ delete: () => ({ eq: vi.fn().mockResolvedValue({ error: null }) }) }))
      .mockImplementationOnce(() => ({ update: () => ({ eq: vi.fn().mockResolvedValue({ error: new Error("branch update failed") }) }) }));
    const updateError = response();
    await handler(request("POST", { action: "update-from-main", boardId: "board", branchId: "branch", resolutions: { changed: "main" } }), updateError);
    expect(updateError.statusCode).toBe(500);

    mocks.from.mockImplementationOnce(() => branchQuery(branchWithoutBase))
      .mockImplementationOnce(() => ({ delete: () => ({ eq: vi.fn().mockResolvedValue({ error: null }) }) }))
      .mockImplementationOnce(() => ({ update: () => ({ eq: vi.fn().mockResolvedValue({ error: null }) }) }));
    const updated = response();
    await handler(request("POST", { action: "update-from-main", boardId: "board", branchId: "branch", resolutions: { changed: "branch" } }), updated);
    expect(updated).toMatchObject({ statusCode: 200, body: { updated: true, branchId: "branch" } });
  });

  it("covers review, archive, and merge failure boundaries", async () => {
    const current = { nodes: {} };
    const branchDocument = { nodes: { new: { id: "new" } } };
    const open = {
      id: "branch", board_id: "board", name: "Branch", room_id: "branch:branch", status: "open",
      base_checksum: createHash("sha256").update(JSON.stringify(current)).digest("hex"),
    };
    mocks.getDocument.mockImplementation(async (room: string) => room === "branch:branch" ? branchDocument : current);

    mocks.from.mockImplementationOnce(() => branchQuery(open)).mockImplementationOnce(() => ({
      upsert: vi.fn().mockResolvedValue({ error: new Error("review failed") }),
    }));
    const reviewError = response();
    await handler(request("POST", { action: "review", boardId: "board", branchId: "branch", status: "approved", note: null }), reviewError);
    expect(reviewError.statusCode).toBe(500);

    mocks.from.mockImplementationOnce(() => branchQuery(open)).mockImplementationOnce(() => ({
      upsert: vi.fn().mockResolvedValue({ error: null }),
    }));
    const approved = response();
    await handler(request("POST", { action: "review", boardId: "board", branchId: "branch", status: "approved" }), approved);
    expect(approved.body).toEqual({ reviewed: true, status: "approved" });

    mocks.from.mockImplementationOnce(() => branchQuery(open)).mockImplementationOnce(() => ({
      update: () => ({ eq: vi.fn().mockResolvedValue({ error: new Error("archive failed") }) }),
    }));
    const archiveError = response();
    await handler(request("POST", { action: "archive", boardId: "board", branchId: "branch" }), archiveError);
    expect(archiveError.statusCode).toBe(500);

    mocks.from.mockReturnValueOnce(branchQuery({ ...open, status: "archived" }));
    const closedMerge = response();
    await handler(request("POST", { action: "merge", boardId: "board", branchId: "branch" }), closedMerge);
    expect(closedMerge.statusCode).toBe(409);

    mocks.from.mockImplementation((table: string) => table === "document_branches"
      ? branchQuery(open)
      : table === "branch_reviews"
        ? { select: () => ({ eq: vi.fn().mockResolvedValue({ data: null, error: new Error("reviews failed") }) }) }
        : {});
    const reviewListError = response();
    await handler(request("POST", { action: "merge", boardId: "board", branchId: "branch" }), reviewListError);
    expect(reviewListError.statusCode).toBe(500);

    mocks.from.mockImplementation((table: string) => table === "document_branches"
      ? branchQuery(open)
      : table === "branch_reviews"
        ? { select: () => ({ eq: vi.fn().mockResolvedValue({ data: [{ reviewer_id: "reviewer", status: "changes-requested", reviewed_checksum: null }], error: null }) }) }
        : {});
    const blocking = response();
    await handler(request("POST", { action: "merge", boardId: "board", branchId: "branch" }), blocking);
    expect(blocking).toMatchObject({ statusCode: 409, body: { code: "BRANCH_CHANGES_REQUESTED" } });

    mocks.from.mockImplementation((table: string) => table === "document_branches"
      ? branchQuery(open)
      : table === "branch_reviews"
        ? { select: () => ({ eq: vi.fn().mockResolvedValue({ data: null, error: null }) }) }
        : table === "document_snapshots"
          ? { insert: () => ({ select: () => ({ single: vi.fn().mockResolvedValue({ data: null, error: new Error("checkpoint failed") }) }) }) }
          : {});
    const checkpointError = response();
    await handler(request("POST", { action: "merge", boardId: "board", branchId: "branch" }), checkpointError);
    expect(checkpointError.statusCode).toBe(500);
  });

  it("persists merge descriptions, tolerates broadcast failure, and maps auth errors", async () => {
    const current = { nodes: {} };
    const next = { nodes: { new: { id: "new" } } };
    const branch = {
      id: "branch", board_id: "board", name: "Branch", room_id: "branch:branch", status: "open",
      base_checksum: createHash("sha256").update(JSON.stringify(current)).digest("hex"),
    };
    mocks.getDocument.mockImplementation(async (room: string) => room === "branch:branch" ? next : current);
    const database = (descriptionError: Error | null) => (table: string) => {
      if (table === "document_branches") return {
        ...branchQuery(branch),
        update: () => ({ eq: vi.fn().mockResolvedValue({ error: descriptionError }) }),
      };
      if (table === "branch_reviews") return { select: () => ({ eq: vi.fn().mockResolvedValue({ data: [], error: null }) }) };
      if (table === "document_snapshots") return { insert: () => ({ select: () => ({ single: vi.fn().mockResolvedValue({ data: { id: "checkpoint" }, error: null }) }) }) };
      return {};
    };

    mocks.from.mockImplementation(database(new Error("description failed")));
    const descriptionError = response();
    await handler(request("POST", { action: "merge", boardId: "board", branchId: "branch", description: "Release candidate" }), descriptionError);
    expect(descriptionError.statusCode).toBe(500);

    mocks.from.mockImplementation(database(null));
    mocks.broadcast.mockRejectedValueOnce(new Error("broadcast failed"));
    const merged = response();
    await handler(request("POST", { action: "merge", boardId: "board", branchId: "branch", description: "Release candidate" }), merged);
    expect(merged.statusCode).toBe(200);

    mocks.requireActor.mockRejectedValueOnce(new Error("Authentication required."));
    const unauthenticated = response();
    await handler(request("GET", {}, { boardId: "board" }), unauthenticated);
    expect(unauthenticated.statusCode).toBe(401);
  });
});
