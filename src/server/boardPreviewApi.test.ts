import type { VercelRequest, VercelResponse } from "@vercel/node";

const mocks = vi.hoisted(() => ({
  requireActor: vi.fn(),
  getBoardAccess: vi.fn(),
  getDocument: vi.fn(),
  serialize: vi.fn(),
  update: vi.fn(),
}));

vi.mock("../../api/_auth", () => ({ requireActor: mocks.requireActor }));
vi.mock("../../api/_boards", () => ({ getBoardAccess: mocks.getBoardAccess }));
vi.mock("../../api/_liveblocks", () => ({
  liveblocksAdmin: () => ({ getStorageDocument: mocks.getDocument }),
}));
vi.mock("../../api/_boardThumbnail", () => ({
  serializeBoardThumbnail: mocks.serialize,
  updateBoardThumbnail: mocks.update,
}));

import handler from "../../api/board-preview";

const response = () => {
  const result = {
    statusCode: 200,
    body: null as unknown,
    headers: {} as Record<string, string>,
    status(code: number) { this.statusCode = code; return this; },
    json(body: unknown) { this.body = body; return this; },
    send(body: unknown) { this.body = body; return this; },
    setHeader(name: string, value: string) { this.headers[name] = value; return this; },
  };
  return result;
};

describe("board preview API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireActor.mockResolvedValue({ uid: "user" });
    mocks.getBoardAccess.mockResolvedValue({
      role: "owner",
      board: { id: "board", owner_id: "user", liveblocks_room_id: "board:board", thumbnail_asset_id: null },
    });
    mocks.getDocument.mockResolvedValue({ backgroundColor: "#252629", nodes: { shape: { type: "rectangle" } } });
    mocks.serialize.mockReturnValue("<svg>actual board</svg>");
    mocks.update.mockResolvedValue("asset");
  });

  it("authenticates access and returns the live board document as an SVG", async () => {
    const result = response();
    await handler({ method: "GET", query: { id: "board" }, headers: {} } as unknown as VercelRequest, result as unknown as VercelResponse);
    expect(result.statusCode).toBe(200);
    expect(result.headers["Content-Type"]).toContain("image/svg+xml");
    expect(result.body).toBe("<svg>actual board</svg>");
    expect(mocks.getDocument).toHaveBeenCalledWith("board:board", "json");
    expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ id: "board" }), expect.objectContaining({ nodes: expect.any(Object) }));
  });

  it("does not reveal inaccessible boards", async () => {
    mocks.getBoardAccess.mockResolvedValue(null);
    const result = response();
    await handler({ method: "GET", query: { id: "private" }, headers: {} } as unknown as VercelRequest, result as unknown as VercelResponse);
    expect(result.statusCode).toBe(404);
    expect(result.body).toEqual({ error: "Board not found." });
    expect(mocks.getDocument).not.toHaveBeenCalled();
  });

  it("requires both authentication and a board id", async () => {
    const missingId = response();
    await handler({ method: "GET", query: {}, headers: {} } as unknown as VercelRequest, missingId as unknown as VercelResponse);
    expect(missingId.statusCode).toBe(400);
    expect(missingId.body).toEqual({ error: "Board id is required." });

    mocks.requireActor.mockRejectedValueOnce(new Error("Authentication required."));
    const unauthenticated = response();
    await handler({ method: "GET", query: { id: "board" }, headers: {} } as unknown as VercelRequest, unauthenticated as unknown as VercelResponse);
    expect(unauthenticated.statusCode).toBe(401);
    expect(unauthenticated.body).toEqual({ error: "Authentication required." });
  });

  it("returns a safe server error when Liveblocks cannot provide the document", async () => {
    mocks.getDocument.mockRejectedValueOnce(new Error("Liveblocks unavailable"));
    const result = response();
    await handler({ method: "GET", query: { id: "board" }, headers: {} } as unknown as VercelRequest, result as unknown as VercelResponse);
    expect(result.statusCode).toBe(500);
    expect(result.body).toEqual({ error: "Liveblocks unavailable" });
    expect(mocks.serialize).not.toHaveBeenCalled();
  });
});
