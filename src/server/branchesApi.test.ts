import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createHash } from "node:crypto";
import handler from "../../api/branches";

const mocks = vi.hoisted(() => ({
  requireActor: vi.fn(), getAccess: vi.fn(), from: vi.fn(), getDocument: vi.fn(),
  createRoom: vi.fn(), deleteRoom: vi.fn(), initialize: vi.fn(), deleteStorage: vi.fn(), broadcast: vi.fn(), syncLinks: vi.fn(), rpc: vi.fn(),
}));

vi.mock("../../api/_auth", () => ({ requireActor: mocks.requireActor }));
vi.mock("../../api/_boards", () => ({ getBoardAccess: mocks.getAccess }));
vi.mock("../../api/_supabase", () => ({ supabaseAdmin: () => ({ from: mocks.from, rpc: mocks.rpc }) }));
vi.mock("../../api/_boardLinks", () => ({ syncBoardLinks: mocks.syncLinks }));
vi.mock("../../api/_liveblocks", () => ({
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

describe("design branch API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireActor.mockResolvedValue({ uid: "owner", email: "owner@example.com" });
    mocks.getAccess.mockResolvedValue({ board, role: "owner" });
    mocks.getDocument.mockResolvedValue({ backgroundColor: "#252629", nodes: {} });
    mocks.createRoom.mockResolvedValue(undefined); mocks.deleteRoom.mockResolvedValue(undefined);
    mocks.initialize.mockResolvedValue(undefined); mocks.deleteStorage.mockResolvedValue(undefined);
    mocks.broadcast.mockResolvedValue(undefined); mocks.syncLinks.mockResolvedValue(undefined);
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
});
