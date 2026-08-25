import type { Shape } from "../classes/shape";

const mocks = vi.hoisted(() => ({
  existing: null as { id: string; created_at: string } | null,
  assets: [] as Array<{ id: string; storage_key: string }> | null,
  signed: [] as Array<{ path: string; signedUrl: string }> | null,
  createSignedUrls: vi.fn(),
  upload: vi.fn(),
  upsertAsset: vi.fn(),
  updateBoard: vi.fn(),
  existingError: null as Error | null,
  assetsError: null as Error | null,
  signedError: null as Error | null,
  upsertError: null as Error | null,
  boardError: null as Error | null,
}));

vi.mock("../../server/api/_supabase", () => ({
  supabaseAdmin: () => ({
    from: (table: string) => {
      if (table === "assets") {
        return {
          select: (columns: string) => columns === "id, created_at"
            ? { eq: () => ({ maybeSingle: vi.fn().mockImplementation(async () => ({ data: mocks.existing, error: mocks.existingError })) }) }
            : { in: vi.fn().mockImplementation(async () => ({ data: mocks.assets, error: mocks.assetsError })) },
          upsert: (patch: unknown, options: unknown) => ({
            select: () => ({
              single: vi.fn().mockImplementation(async () => {
                mocks.upsertAsset(patch, options);
                return { data: { id: mocks.existing?.id ?? "asset-new" }, error: mocks.upsertError };
              }),
            }),
          }),
        };
      }
      return {
        update: (patch: unknown) => ({
          eq: vi.fn().mockImplementation(async () => {
            mocks.updateBoard(patch);
            return { error: mocks.boardError };
          }),
        }),
      };
    },
    storage: {
      from: () => ({
        upload: mocks.upload,
        createSignedUrls: mocks.createSignedUrls,
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

const previewShape = (id: string): Shape => ({
  id, type: "rectangle", name: id, x1: 0, y1: 0, x2: 100, y2: 80,
  width: 100, height: 80, level: 0, zIndex: 1, parentId: null, backgroundColor: "#fff",
});

describe("board thumbnail previews", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.existing = null;
    mocks.assets = [];
    mocks.signed = [];
    mocks.existingError = null;
    mocks.assetsError = null;
    mocks.signedError = null;
    mocks.upsertError = null;
    mocks.boardError = null;
    mocks.upload.mockResolvedValue({ error: null });
    mocks.createSignedUrls.mockImplementation(async () => ({ data: mocks.signed, error: mocks.signedError }));
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

  it("sanitizes malformed documents, nested media, and coordinate defaults", () => {
    const parsed = thumbnailDocument({ backgroundColor: 42, nodes: {
      invalid: null,
      missingType: { x1: 1 },
      shape: {
        type: "image", x1: Number.NaN, y1: Number.POSITIVE_INFINITY, width: -20, height: Number.NaN,
        x2: Number.NaN, y2: Number.NaN, level: "bad", zIndex: "bad", backgroundImage: "data:image/png;base64,abc",
        shapes: [{ ...previewShape("nested"), backgroundImage: "https://unsafe" }],
        booleanChildren: [{ ...previewShape("boolean"), backgroundImage: "data:image/png;base64,safe" }],
      },
      invalidWidth: { type: "rectangle", width: "bad", height: 2 },
    } });
    expect(parsed.backgroundColor).toBe("#252629");
    expect(parsed.shapes).toHaveLength(2);
    expect(parsed.shapes[0]).toMatchObject({ x1: 0, y1: 0, width: 0, height: 1, x2: 0, y2: 1, level: 0, zIndex: 3, backgroundImage: "data:image/png;base64,abc" });
    expect(parsed.shapes[0]?.shapes?.[0]?.backgroundImage).toBeUndefined();
    expect(parsed.shapes[0]?.booleanChildren?.[0]?.backgroundImage).toContain("data:image");
    expect(thumbnailDocument(null)).toMatchObject({ backgroundColor: "#252629", shapes: [] });
  });

  it("uses a stable empty-board viewport", () => {
    expect(thumbnailBounds([])).toEqual({
      x: 0,
      y: 0,
      width: 1200,
      height: 1200 / 1.55,
    });
    expect(thumbnailBounds([{ ...previewShape("hidden"), hidden: true }, { ...previewShape("guide"), type: "guide" }, { ...previewShape("resource"), type: "resource" }])).toEqual({ x: 0, y: 0, width: 1200, height: 1200 / 1.55 });
    const wide = thumbnailBounds([{ ...previewShape("wide"), x2: 1000, width: 1000, height: 10, y2: 10 }]);
    expect(wide.height).toBeCloseTo(wide.width / 1.55);
  });

  it("includes routed connector detours in preview bounds", () => {
    const obstacle = { ...previewShape("obstacle"), x1: 70, x2: 110, y1: -40, y2: 130, width: 40, height: 170 };
    const connector = {
      ...previewShape("connector"), type: "connector", x1: 0, y1: 50, x2: 180, y2: 50, width: 180, height: 0,
      connectorRouting: "orthogonal" as const, connectorAvoidObstacles: true,
      connectorStart: { anchor: "auto" as const, x: 0, y: 50 }, connectorEnd: { anchor: "auto" as const, x: 180, y: 50 },
    };
    const bounds = thumbnailBounds([obstacle, connector]);
    expect(bounds.height).toBeGreaterThan(170);
    expect(serializeBoardThumbnail({ backgroundColor: "#252629", nodes: { obstacle, connector } })).toContain("<path");
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

  it("falls back to generated previews when signed thumbnail storage stalls", async () => {
    vi.useFakeTimers();
    try {
      mocks.assets = [{ id: "asset-1", storage_key: "board-1/thumbnail.svg" }];
      mocks.createSignedUrls.mockReturnValueOnce(new Promise(() => undefined));
      const pending = boardThumbnailUrls([{ thumbnail_asset_id: "asset-1" }]);
      await vi.advanceTimersByTimeAsync(2_500);
      await expect(pending).resolves.toEqual(new Map());
    } finally {
      vi.useRealTimers();
    }
  });

  it("surfaces thumbnail write failures at every persistence stage", async () => {
    const target = { id: "board", owner_id: "owner", thumbnail_asset_id: null };
    mocks.existingError = new Error("lookup failed");
    await expect(updateBoardThumbnail(target, document)).rejects.toThrow("lookup failed");
    mocks.existingError = null;
    mocks.upload.mockResolvedValueOnce({ error: new Error("upload failed") });
    await expect(updateBoardThumbnail(target, document)).rejects.toThrow("upload failed");
    mocks.upsertError = new Error("asset failed");
    await expect(updateBoardThumbnail(target, document)).rejects.toThrow("asset failed");
    mocks.upsertError = null;
    mocks.boardError = new Error("board failed");
    await expect(updateBoardThumbnail(target, document)).rejects.toThrow("board failed");
  });

  it("returns empty URL maps for missing ids, query errors, and incomplete signed rows", async () => {
    await expect(boardThumbnailUrls([{ thumbnail_asset_id: null }])).resolves.toEqual(new Map());
    mocks.assetsError = new Error("assets failed");
    await expect(boardThumbnailUrls([{ thumbnail_asset_id: "asset" }])).resolves.toEqual(new Map());
    mocks.assetsError = null;
    mocks.assets = [];
    await expect(boardThumbnailUrls([{ thumbnail_asset_id: "asset" }])).resolves.toEqual(new Map());
    mocks.assets = [{ id: "asset", storage_key: "board/thumbnail.svg" }];
    mocks.signedError = new Error("signing failed");
    await expect(boardThumbnailUrls([{ thumbnail_asset_id: "asset" }])).resolves.toEqual(new Map());
    mocks.signedError = null;
    mocks.signed = [{ path: "board/thumbnail.svg", signedUrl: "" }];
    await expect(boardThumbnailUrls([{ thumbnail_asset_id: "asset" }])).resolves.toEqual(new Map());
    mocks.signed = [{ path: "other", signedUrl: "https://signed/other" }];
    await expect(boardThumbnailUrls([{ thumbnail_asset_id: "asset" }])).resolves.toEqual(new Map());
    mocks.assets = null;
    mocks.signed = null;
    await expect(boardThumbnailUrls([{ thumbnail_asset_id: "asset" }])).resolves.toEqual(new Map());
    mocks.signed = [];
  });
});
