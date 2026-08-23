import type { VercelRequest, VercelResponse } from "@vercel/node";
import handler from "../../api/branches";

const mocks = vi.hoisted(() => ({
  requireActor: vi.fn(), getAccess: vi.fn(), from: vi.fn(), getDocument: vi.fn(),
  createRoom: vi.fn(), deleteRoom: vi.fn(), initialize: vi.fn(), deleteStorage: vi.fn(), broadcast: vi.fn(), syncLinks: vi.fn(),
}));

vi.mock("../../api/_auth", () => ({ requireActor: mocks.requireActor }));
vi.mock("../../api/_boards", () => ({ getBoardAccess: mocks.getAccess }));
vi.mock("../../api/_supabase", () => ({ supabaseAdmin: () => ({ from: mocks.from }) }));
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
    expect(created.statusCode).toBe(201);
  });

  it("creates a recovery point and atomically merges a branch into main", async () => {
    const branch = { id: "branch", board_id: "board", name: "Exploration", room_id: "branch:branch", status: "open" };
    mocks.getDocument.mockImplementation(async (room: string) => room === "branch:branch" ? { backgroundColor: "#fff", nodes: { new: {} } } : { backgroundColor: "#000", nodes: {} });
    mocks.from.mockImplementation((table: string) => {
      if (table === "document_branches") return {
        select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: vi.fn().mockResolvedValue({ data: branch, error: null }) }) }) }),
        update: () => ({ eq: vi.fn().mockResolvedValue({ error: null }) }),
      };
      if (table === "document_snapshots") return { insert: () => ({ select: () => ({ single: vi.fn().mockResolvedValue({ data: { id: "checkpoint" }, error: null }) }) }) };
      if (table === "boards") return { update: () => ({ eq: vi.fn().mockResolvedValue({ error: null }) }) };
      return { insert: vi.fn().mockResolvedValue({ error: null }) };
    });
    const reply = response();
    await handler(request("POST", { action: "merge", boardId: "board", branchId: "branch" }), reply);
    expect(mocks.deleteStorage).toHaveBeenCalledWith("board:board");
    expect(mocks.initialize).toHaveBeenCalledWith("board:board", { normalized: expect.objectContaining({ nodes: { new: {} } }) });
    expect(mocks.syncLinks).toHaveBeenCalled();
    expect(mocks.broadcast).toHaveBeenCalledWith("board:board", { type: "DOCUMENT_RESTORED", actorId: "owner" });
    expect(reply.body).toMatchObject({ merged: true, checkpointId: "checkpoint" });
  });
});
