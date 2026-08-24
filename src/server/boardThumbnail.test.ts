const mocks = vi.hoisted(() => ({
  existing: null as { id: string; created_at: string } | null,
  assets: [] as Array<{ id: string; storage_key: string }>,
  signed: [] as Array<{ path: string; signedUrl: string }>,
  upload: vi.fn(),
  upsertAsset: vi.fn(),
  updateBoard: vi.fn(),
}));

vi.mock("../../server/api/_supabase", () => ({
  supabaseAdmin: () => ({
    from: (table: string) => {
      if (table === "assets") {
        return {
          select: (columns: string) => columns === "id, created_at"
            ? { eq: () => ({ maybeSingle: vi.fn().mockResolvedValue({ data: mocks.existing, error: null }) }) }
            : { in: vi.fn().mockResolvedValue({ data: mocks.assets, error: null }) },
          upsert: (patch: unknown, options: unknown) => ({
            select: () => ({
              single: vi.fn().mockImplementation(async () => {
                mocks.upsertAsset(patch, options);
                return { data: { id: mocks.existing?.id ?? "asset-new" }, error: null };
              }),
            }),
          }),
        };
      }
      return {
        update: (patch: unknown) => ({
          eq: vi.fn().mockImplementation(async () => {
            mocks.updateBoard(patch);
            return { error: null };
          }),
        }),
      };
    },
    storage: {
      from: () => ({
        upload: mocks.upload,
        createSignedUrls: vi.fn().mockImplementation(async () => ({ data: mocks.signed, error: null })),
      }),
    },
  }),
}));

import {
  boardThumbnailUrls,
  serializeBoardThumbnail,
  thumbnailBounds,
  thumbnailDocument,
  updateBoardThumbnail,
} from "../../server/api/_boardThumbnail";

const document = {
  backgroundColor: "#202124",
  nodes: {
    frame: {
      type: "frame", name: "Frame", x1: 100, y1: 100, x2: 500, y2: 400,
      width: 400, height: 300, level: 0, zIndex: 1, backgroundColor: "#fff",
    },
    label: {
      type: "text", name: "Label", parentId: "frame", x1: 140, y1: 140, x2: 360, y2: 190,
      width: 220, height: 50, level: 0, zIndex: 2, text: "Connected board", color: "#17181a",
      fontSize: 24, backgroundImage: "https://untrusted.example/image.png",
    },
  },
};

describe("board thumbnail previews", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.existing = null;
    mocks.assets = [];
    mocks.signed = [];
    mocks.upload.mockResolvedValue({ error: null });
  });

  it("normalizes stored nodes and serializes a padded, correctly proportioned SVG", () => {
    const parsed = thumbnailDocument(document);
    expect(parsed.backgroundColor).toBe("#202124");
    expect(parsed.shapes).toHaveLength(2);
    expect(parsed.shapes.find((shape) => shape.id === "label")?.backgroundImage).toBeUndefined();
    const bounds = thumbnailBounds(parsed.shapes);
    expect(bounds.width / bounds.height).toBeCloseTo(1.55);

    const svg = serializeBoardThumbnail(document);
    expect(svg).toContain('role="img"');
    expect(svg).toContain("Connected board");
    expect(svg).toContain('fill="#202124"');
    expect(svg).not.toContain("untrusted.example");
  });

  it("uses a stable empty-board viewport", () => {
    expect(thumbnailBounds([])).toEqual({
      x: 0,
      y: 0,
      width: 1200,
      height: 1200 / 1.55,
    });
  });

  it("uploads a generated preview, records its asset, and links it to the board", async () => {
    await expect(updateBoardThumbnail({
      id: "board-1", owner_id: "owner", thumbnail_asset_id: null,
    }, document)).resolves.toBe("asset-new");
    expect(mocks.upload).toHaveBeenCalledWith(
      "board-1/thumbnail.svg",
      expect.any(Buffer),
      expect.objectContaining({ contentType: "image/svg+xml", upsert: true })
    );
    expect(mocks.upsertAsset).toHaveBeenCalledWith(
      expect.objectContaining({ board_id: "board-1", storage_key: "board-1/thumbnail.svg" }),
      { onConflict: "storage_key" }
    );
    expect(mocks.updateBoard).toHaveBeenCalledWith({ thumbnail_asset_id: "asset-new" });
  });

  it("throttles recent previews and refreshes older assets in place", async () => {
    mocks.existing = { id: "asset-existing", created_at: new Date().toISOString() };
    await expect(updateBoardThumbnail({
      id: "board-1", owner_id: "owner", thumbnail_asset_id: "asset-existing",
    }, document)).resolves.toBe("asset-existing");
    expect(mocks.upload).not.toHaveBeenCalled();

    mocks.existing = { id: "asset-existing", created_at: new Date(0).toISOString() };
    await updateBoardThumbnail({
      id: "board-1", owner_id: "owner", thumbnail_asset_id: "asset-existing",
    }, document);
    expect(mocks.upsertAsset).toHaveBeenCalledWith(
      expect.objectContaining({ byte_size: expect.any(Number) }),
      { onConflict: "storage_key" }
    );
  });

  it("returns signed preview URLs keyed by thumbnail asset id", async () => {
    mocks.assets = [{ id: "asset-1", storage_key: "board-1/thumbnail.svg" }];
    mocks.signed = [{ path: "board-1/thumbnail.svg", signedUrl: "https://signed.example/preview" }];
    await expect(boardThumbnailUrls([
      { thumbnail_asset_id: "asset-1" },
      { thumbnail_asset_id: null },
      { thumbnail_asset_id: "asset-1" },
    ])).resolves.toEqual(new Map([["asset-1", "https://signed.example/preview"]]));
  });
});
