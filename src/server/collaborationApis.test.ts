import type { VercelRequest, VercelResponse } from "@vercel/node";
import collaboratorsHandler from "../../api/collaborators";
import versionsHandler from "../../api/versions";

const mocks = vi.hoisted(() => ({
  actor: { uid: "owner", email: "owner@example.com" },
  requireActor: vi.fn(),
  getAccess: vi.fn(),
  from: vi.fn(),
  getDocument: vi.fn(),
  deleteDocument: vi.fn(),
  initializeDocument: vi.fn(),
  broadcast: vi.fn(),
  syncLinks: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock("../../api/_auth", () => ({ requireActor: mocks.requireActor }));
vi.mock("../../api/_boards", () => ({ getBoardAccess: mocks.getAccess }));
vi.mock("../../api/_supabase", () => ({ supabaseAdmin: () => ({ from: mocks.from, rpc: mocks.rpc }) }));
vi.mock("../../api/_boardLinks", () => ({ syncBoardLinks: mocks.syncLinks }));
vi.mock("../../api/_liveblocks", () => ({
  boardDocumentFromJson: (document: unknown) => ({ normalized: document }),
  liveblocksAdmin: () => ({
    getStorageDocument: mocks.getDocument,
    deleteStorageDocument: mocks.deleteDocument,
    initializeStorageDocument: mocks.initializeDocument,
    broadcastEvent: mocks.broadcast,
  }),
}));

const board = {
  id: "board",
  owner_id: "owner",
  title: "Board",
  visibility: "private",
  liveblocks_room_id: "board:board",
  legacy_rtdb_id: null,
  created_at: new Date(0).toISOString(),
  updated_at: new Date(1).toISOString(),
  deleted_at: null,
};

const response = () => {
  const result = {
    statusCode: 0,
    body: undefined as unknown,
    status(code: number) { this.statusCode = code; return this; },
    json(body: unknown) { this.body = body; return this; },
    setHeader: vi.fn(),
  };
  return result as unknown as VercelResponse & typeof result;
};

const request = (
  method: string,
  body: Record<string, unknown> = {},
  query: Record<string, string> = {}
) => ({ method, body, query, headers: { authorization: "Bearer token" } }) as unknown as VercelRequest;

const queryChain = <T,>(result: T) => {
  const chain = {
    eq: vi.fn(() => chain),
    order: vi.fn(() => chain),
    limit: vi.fn(() => Promise.resolve(result)),
    maybeSingle: vi.fn(() => Promise.resolve(result)),
    single: vi.fn(() => Promise.resolve(result)),
  };
  return chain;
};

describe("collaborator and version APIs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireActor.mockResolvedValue(mocks.actor);
    mocks.getAccess.mockResolvedValue({ board, role: "owner" });
    mocks.getDocument.mockResolvedValue({ backgroundColor: "#252629", nodes: { current: { id: "current" } } });
    mocks.deleteDocument.mockResolvedValue(undefined);
    mocks.initializeDocument.mockResolvedValue(undefined);
    mocks.broadcast.mockResolvedValue(undefined);
    mocks.syncLinks.mockResolvedValue(undefined);
    mocks.rpc.mockImplementation(async (name: string) => ({
      data: name === "acquire_kumo_document_lease" ? true : null,
      error: null,
    }));
  });

  it("returns named board collaborators with their roles", async () => {
    mocks.from.mockImplementation((table: string) => {
      if (table === "board_members") return {
        select: () => ({ eq: vi.fn().mockResolvedValue({
          data: [{ user_id: "owner", role: "owner" }, { user_id: "editor", role: "editor" }],
          error: null,
        }) }),
      };
      return {
        select: () => ({ in: vi.fn().mockResolvedValue({
          data: [
            { firebase_uid: "editor", email: "editor@example.com", display_name: "Editor", avatar_url: null },
            { firebase_uid: "owner", email: "owner@example.com", display_name: "Owner", avatar_url: "avatar" },
          ],
          error: null,
        }) }),
      };
    });
    const reply = response();
    await collaboratorsHandler(request("GET", {}, { boardId: "board" }), reply);
    expect(reply.statusCode).toBe(200);
    expect(reply.body).toEqual({ collaborators: [
      expect.objectContaining({ id: "editor", role: "editor", name: "Editor" }),
      expect.objectContaining({ id: "owner", role: "owner", avatar: "avatar" }),
    ] });
  });

  it("does not disclose member emails to authenticated public non-members", async () => {
    mocks.requireActor.mockResolvedValueOnce({ uid: "stranger", email: "stranger@example.com" });
    mocks.getAccess.mockResolvedValueOnce({ board: { ...board, visibility: "public" }, role: "viewer" });
    mocks.from.mockImplementation((table: string) => table === "board_members" ? {
      select: () => ({ eq: vi.fn().mockResolvedValue({ data: [{ user_id: "owner", role: "owner" }], error: null }) }),
    } : {
      select: () => ({ in: vi.fn().mockResolvedValue({ data: [{ firebase_uid: "owner", email: "owner@example.com", display_name: "Owner", avatar_url: null }], error: null }) }),
    });
    const reply = response();
    await collaboratorsHandler(request("GET", {}, { boardId: "board" }), reply);
    expect(reply.body).toEqual({ collaborators: [expect.objectContaining({ id: "owner", email: "" })] });
  });

  it("lists versions and resolves creator names", async () => {
    const version = {
      id: "version",
      board_id: "board",
      name: "Ready",
      description: null,
      created_by: "owner",
      kind: "checkpoint",
      created_at: new Date().toISOString(),
      checksum: "sum",
    };
    mocks.from.mockImplementation((table: string) => {
      if (table === "document_snapshots") return {
        select: () => queryChain({ data: [version], error: null }),
      };
      if (table === "profiles") return {
        select: () => ({ in: vi.fn().mockResolvedValue({
          data: [{ firebase_uid: "owner", display_name: "Owner" }], error: null,
        }) }),
      };
      return {};
    });
    const reply = response();
    await versionsHandler(request("GET", {}, { boardId: "board" }), reply);
    expect(reply.body).toEqual({ versions: [expect.objectContaining({ creatorName: "Owner", name: "Ready" })] });
  });

  it("creates a named checkpoint with the current collaborative document", async () => {
    const inserted = {
      id: "checkpoint",
      board_id: "board",
      name: "Review",
      description: "Milestone",
      created_by: "owner",
      kind: "checkpoint",
      created_at: new Date().toISOString(),
      checksum: "sum",
    };
    const insert = vi.fn((payload: Record<string, unknown>) => ({
      select: () => ({ single: vi.fn().mockResolvedValue({ data: { ...inserted, ...payload }, error: null }) }),
    }));
    mocks.from.mockImplementation((table: string) => table === "document_snapshots"
      ? { insert }
      : { insert: vi.fn().mockResolvedValue({ error: null }) });
    const reply = response();
    await versionsHandler(request("POST", {
      action: "checkpoint", boardId: "board", name: "Review", description: "Milestone",
    }), reply);
    expect(reply.statusCode).toBe(201);
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({
      name: "Review",
      description: "Milestone",
      document: expect.objectContaining({ nodes: expect.any(Object) }),
      kind: "checkpoint",
    }));
  });

  it("saves the current state, restores the target, and broadcasts the change", async () => {
    const target = { id: "target", document: { backgroundColor: "#fff", nodes: { restored: { id: "restored" } } } };
    mocks.from.mockImplementation((table: string) => {
      if (table === "document_snapshots") return {
        select: () => queryChain({ data: target, error: null }),
        insert: () => ({ select: () => ({ single: vi.fn().mockResolvedValue({ data: { id: "before" }, error: null }) }) }),
      };
      return { insert: vi.fn().mockResolvedValue({ error: null }) };
    });
    const reply = response();
    await versionsHandler(request("POST", { action: "restore", boardId: "board", versionId: "target" }), reply);
    expect(mocks.deleteDocument).toHaveBeenCalledWith("board:board");
    expect(mocks.initializeDocument).toHaveBeenCalledWith("board:board", { normalized: target.document });
    expect(mocks.syncLinks).toHaveBeenCalledWith("board", target.document);
    expect(mocks.rpc).toHaveBeenCalledWith("acquire_kumo_document_lease", expect.objectContaining({ p_room_id: "board:board" }));
    expect(mocks.rpc).toHaveBeenCalledWith("complete_kumo_version_restore", expect.objectContaining({ p_room_id: "board:board" }));
    expect(mocks.rpc).toHaveBeenCalledWith("release_kumo_document_lease", expect.objectContaining({ p_room_id: "board:board" }));
    expect(mocks.broadcast).toHaveBeenCalledWith("board:board", expect.objectContaining({ type: "DOCUMENT_RESTORED", actorId: "owner", revision: expect.any(Number) }));
    expect(reply.body).toMatchObject({ restored: true, beforeRestoreId: "before" });
  });

  it("isolates branch checkpoints and restores from main-board history", async () => {
    const target = { id: "target", document: { backgroundColor: "#fff", nodes: {} } };
    mocks.from.mockImplementation((table: string) => {
      if (table === "document_branches") return { select: () => queryChain({ data: { room_id: "branch:one", status: "open" }, error: null }) };
      if (table === "document_snapshots") return {
        select: () => queryChain({ data: target, error: null }),
        insert: () => ({ select: () => ({ single: vi.fn().mockResolvedValue({ data: { id: "before" }, error: null }) }) }),
      };
      return { insert: vi.fn().mockResolvedValue({ error: null }) };
    });
    const reply = response();
    await versionsHandler(request("POST", { action: "restore", boardId: "board", branchId: "one", versionId: "target" }), reply);
    expect(mocks.getDocument).toHaveBeenCalledWith("branch:one", "json");
    expect(mocks.deleteDocument).toHaveBeenCalledWith("branch:one");
    expect(mocks.syncLinks).not.toHaveBeenCalled();
    expect(mocks.rpc).toHaveBeenCalledWith("complete_kumo_version_restore", expect.objectContaining({ p_room_id: "branch:one" }));
  });

  it("rolls storage and derived links back when version finalization fails", async () => {
    const current = { backgroundColor: "#000", nodes: { current: {} } };
    const target = { id: "target", document: { backgroundColor: "#fff", nodes: { restored: {} } } };
    mocks.getDocument.mockResolvedValue(current);
    mocks.rpc.mockImplementation(async (name: string) => ({
      data: name === "acquire_kumo_document_lease" ? true : null,
      error: name === "complete_kumo_version_restore" ? new Error("commit failed") : null,
    }));
    mocks.from.mockImplementation((table: string) => table === "document_snapshots" ? {
      select: () => queryChain({ data: target, error: null }),
      insert: () => ({ select: () => ({ single: vi.fn().mockResolvedValue({ data: { id: "before" }, error: null }) }) }),
    } : { insert: vi.fn().mockResolvedValue({ error: null }) });
    const reply = response();
    await versionsHandler(request("POST", { action: "restore", boardId: "board", versionId: "target" }), reply);
    expect(reply.statusCode).toBe(500);
    expect(mocks.initializeDocument).toHaveBeenNthCalledWith(1, "board:board", { normalized: target.document });
    expect(mocks.initializeDocument).toHaveBeenNthCalledWith(2, "board:board", { normalized: current });
    expect(mocks.syncLinks).toHaveBeenLastCalledWith("board", current);
  });

  it("allows viewers to inspect history but not mutate it", async () => {
    mocks.getAccess.mockResolvedValueOnce({ board, role: "viewer" });
    const reply = response();
    await versionsHandler(request("POST", { action: "checkpoint", boardId: "board", name: "No" }), reply);
    expect(reply.statusCode).toBe(403);
  });
});
