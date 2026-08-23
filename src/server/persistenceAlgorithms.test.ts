import { boardLinkRows } from "../../api/_boardLinks";
import {
  cloneAssetsToBoard,
  documentAssetIds,
  rewriteDocumentAssetIds,
} from "../../api/_assets";
import { getBoardAccess } from "../../api/_boards";
import { supabaseAdmin } from "../../api/_supabase";
import {
  collectShapeAssetIds,
  rewriteShapeAssetIds,
} from "../services/assetRepository";
import type { Shape } from "../classes/shape";

vi.mock("../../api/_supabase", () => ({ supabaseAdmin: vi.fn() }));
vi.mock("../../api/_boards", () => ({ getBoardAccess: vi.fn() }));
vi.mock("../services/apiClient", () => ({ authenticatedFetch: vi.fn() }));

const shape = (id: string, assetId?: string, children?: Shape[]): Shape => ({
  id,
  type: "image",
  x1: 0,
  y1: 0,
  x2: 20,
  y2: 20,
  width: 20,
  height: 20,
  level: 0,
  zIndex: 1,
  assetId,
  backgroundImage: assetId ? "signed-source-url" : undefined,
  shapes: children,
});

describe("persistence algorithms", () => {
  beforeEach(() => vi.clearAllMocks());

  it("extracts and rewrites every nested document asset reference", () => {
    const document = {
      nodes: {
        one: { assetId: "asset-a", backgroundImage: "old" },
        parent: { shapes: [{ assetId: "asset-b", backgroundImage: "old" }] },
      },
    };
    expect(documentAssetIds(document)).toEqual(["asset-a", "asset-b"]);
    const rewritten = rewriteDocumentAssetIds(
      document,
      new Map([["asset-a", "copy-a"], ["asset-b", "copy-b"]])
    ) as typeof document;
    expect(rewritten.nodes.one).toEqual({ assetId: "copy-a" });
    expect(rewritten.nodes.parent.shapes[0]).toEqual({ assetId: "copy-b" });
    expect(document.nodes.one.assetId).toBe("asset-a");
  });

  it("rewrites cross-board clipboard assets without retaining source URLs", () => {
    const child = shape("child", "asset-b");
    const clipboard = [shape("parent", "asset-a", [child])];
    expect(collectShapeAssetIds(clipboard)).toEqual(["asset-a", "asset-b"]);
    const rewritten = rewriteShapeAssetIds(clipboard, {
      "asset-a": "copy-a",
      "asset-b": "copy-b",
    });
    expect(rewritten[0]).toMatchObject({ assetId: "copy-a", backgroundImage: undefined });
    expect(rewritten[0]!.shapes?.[0]).toMatchObject({
      assetId: "copy-b",
      backgroundImage: undefined,
    });
  });

  it("derives only valid non-self Kumo board links", () => {
    const rows = boardLinkRows("source", {
      nodes: {
        valid: { type: "board", boardId: "target" },
        self: { type: "board", boardId: "source" },
        rectangle: { type: "rectangle", boardId: "ignored" },
        empty: { type: "board", boardId: null },
      },
    });
    expect(rows).toEqual([{
      source_board_id: "source",
      target_board_id: "target",
      shape_id: "valid",
    }]);
  });

  it("copies authorized assets into target-board storage and records new ownership", async () => {
    const copy = vi.fn().mockResolvedValue({ error: null });
    const remove = vi.fn().mockResolvedValue({ error: null });
    const insert = vi.fn().mockResolvedValue({ error: null });
    vi.mocked(getBoardAccess).mockResolvedValue({ role: "viewer", board: {} } as never);
    vi.mocked(supabaseAdmin).mockReturnValue({
      from: vi.fn()
        .mockReturnValueOnce({
          select: () => ({ in: vi.fn().mockResolvedValue({
            data: [{
              id: "asset-a", board_id: "source", storage_key: "source/image.png",
              mime_type: "image/png", byte_size: 4, width: 10, height: 10,
            }],
            error: null,
          }) }),
        })
        .mockReturnValueOnce({ insert }),
      storage: { from: () => ({ copy, remove }) },
    } as never);
    const replacements = await cloneAssetsToBoard({
      actorUid: "actor", targetBoardId: "target", assetIds: ["asset-a", "asset-a"],
    });
    expect(replacements.get("asset-a")).toEqual(expect.any(String));
    expect(copy).toHaveBeenCalledWith("source/image.png", expect.stringMatching(/^target\/.*\.png$/));
    expect(insert).toHaveBeenCalledWith([expect.objectContaining({
      board_id: "target", uploader_id: "actor", storage_key: expect.stringMatching(/^target\//),
    })]);
  });

  it("rejects unavailable assets before copying storage", async () => {
    vi.mocked(supabaseAdmin).mockReturnValue({
      from: () => ({ select: () => ({ in: vi.fn().mockResolvedValue({ data: [], error: null }) }) }),
    } as never);
    await expect(cloneAssetsToBoard({ actorUid: "actor", targetBoardId: "target", assetIds: ["missing"] }))
      .rejects.toThrow("unavailable");
    expect(getBoardAccess).not.toHaveBeenCalled();
  });
});
