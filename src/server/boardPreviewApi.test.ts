import type { VercelRequest, VercelResponse } from "@vercel/node";

const mocks = vi.hoisted(() => ({
  requireActor: vi.fn(),
  getBoardAccess: vi.fn(),
  getDocument: vi.fn(),
  serialize: vi.fn(),
  update: vi.fn(),
}));

vi.mock("../../server/api/_auth", () => ({ requireActor: mocks.requireActor }));
vi.mock("../../server/api/_boards", () => ({ getBoardAccess: mocks.getBoardAccess }));
vi.mock("../../server/api/_liveblocks", () => ({
  liveblocksAdmin: () => ({ getStorageDocument: mocks.getDocument }),
}));
vi.mock("../../server/api/_boardThumbnail", () => ({
  serializeBoardThumbnail: mocks.serialize,
  updateBoardThumbnail: mocks.update,
}));

import handler from "../../server/api/handlers/board-preview";

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

  it("returns the generated preview without waiting for storage caching", async () => {
    mocks.update.mockReturnValueOnce(new Promise(() => undefined));
    const result = response();
    await expect(handler(
      { method: "GET", query: { id: "board" }, headers: {} } as unknown as VercelRequest,
      result as unknown as VercelResponse
    )).resolves.toBe(result);
    expect(result.statusCode).toBe(200);
    expect(result.body).toBe("<svg>actual board</svg>");
  });

  it("contains asynchronous thumbnail-cache failures", async () => {
    mocks.update.mockRejectedValueOnce(new Error("cache unavailable"));
    const result = response();
    await handler({ method: "GET", query: { id: "board" }, headers: {} } as unknown as VercelRequest, result as unknown as VercelResponse);
    await Promise.resolve();
    expect(result.statusCode).toBe(200);
  });

  it("returns an empty-board preview when Liveblocks storage is not initialized", async () => {
    vi.useFakeTimers();
    try {
      mocks.getDocument.mockReturnValueOnce(new Promise(() => undefined));
      const result = response();
      const pending = handler(
        { method: "GET", query: { id: "board" }, headers: {} } as unknown as VercelRequest,
        result as unknown as VercelResponse
      );
      await vi.advanceTimersByTimeAsync(4_000);
      await pending;
      expect(result.statusCode).toBe(200);
      expect(mocks.serialize).toHaveBeenCalledWith({ backgroundColor: "#252629", nodes: {} });
    } finally {
      vi.useRealTimers();
    }
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

    const unsupported = response();
    await handler({ method: "POST", query: {}, headers: {} } as unknown as VercelRequest, unsupported as unknown as VercelResponse);
    expect(unsupported.statusCode).toBe(405);
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
