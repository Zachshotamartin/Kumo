import { boardLinkRows, syncBoardLinks } from "../../server/api/_boardLinks";
import {
  cloneAssetsToBoard,
  documentAssetIds,
  rewriteDocumentAssetIds,
} from "../../server/api/_assets";
import { getBoardAccess } from "../../server/api/_boards";
import { supabaseAdmin } from "../../server/api/_supabase";
import {
  collectShapeAssetIds,
  rewriteShapeAssetIds,
} from "../services/assetRepository";
import type { Shape } from "../classes/shape";

vi.mock("../../server/api/_supabase", () => ({ supabaseAdmin: vi.fn() }));
vi.mock("../../server/api/_boards", () => ({ getBoardAccess: vi.fn() }));
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
    expect(documentAssetIds([null, "text", { assetId: 4 }, { assetId: "asset-a" }])).toEqual(["asset-a"]);
    expect(rewriteDocumentAssetIds({ assetId: "unmapped", nested: null }, { other: "copy" })).toEqual({ assetId: "unmapped", nested: null });
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
    const unchanged = [shape("unmapped", "asset-c"), shape("plain")];
    expect(rewriteShapeAssetIds(unchanged, {})).toEqual(unchanged);
    expect(collectShapeAssetIds(unchanged)).toEqual(["asset-c"]);
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
    expect(boardLinkRows("source", null)).toEqual([]);
    expect(boardLinkRows("source", { nodes: "invalid" })).toEqual([]);
    expect(boardLinkRows("source", { nodes: { empty: null } })).toEqual([]);
  });

  it("synchronizes normalized board links and surfaces database failures", async () => {
    const rpc = vi.fn().mockResolvedValueOnce({ error: null }).mockResolvedValueOnce({ error: new Error("link sync failed") });
    vi.mocked(supabaseAdmin).mockReturnValue({ rpc } as never);
    await syncBoardLinks("source", { nodes: { link: { type: "board", boardId: "target" } } });
    expect(rpc).toHaveBeenCalledWith("sync_kumo_board_links", { p_source_board_id: "source", p_links: [{ target_board_id: "target", shape_id: "link" }] });
    await expect(syncBoardLinks("source", {})).rejects.toThrow("link sync failed");
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

  it("short-circuits empty clones and surfaces asset query failures", async () => {
    await expect(cloneAssetsToBoard({ actorUid: "actor", targetBoardId: "target", assetIds: [] }))
      .resolves.toEqual(new Map());
    vi.mocked(supabaseAdmin).mockReturnValue({
      from: () => ({ select: () => ({ in: vi.fn().mockResolvedValue({ data: null, error: new Error("assets offline") }) }) }),
    } as never);
    await expect(cloneAssetsToBoard({ actorUid: "actor", targetBoardId: "target", assetIds: ["asset"] }))
      .rejects.toThrow("assets offline");
    vi.mocked(supabaseAdmin).mockReturnValue({
      from: () => ({ select: () => ({ in: vi.fn().mockResolvedValue({ data: null, error: null }) }) }),
    } as never);
    await expect(cloneAssetsToBoard({ actorUid: "actor", targetBoardId: "target", assetIds: ["asset"] }))
      .rejects.toThrow("unavailable");
  });

  it("rejects assets from inaccessible boards", async () => {
    vi.mocked(getBoardAccess).mockResolvedValue(null);
    vi.mocked(supabaseAdmin).mockReturnValue({
      from: () => ({ select: () => ({ in: vi.fn().mockResolvedValue({ data: [{ id: "asset", board_id: "private", storage_key: "plainfile", mime_type: "image/png", byte_size: 1, width: null, height: null }], error: null }) }) }),
    } as never);
    await expect(cloneAssetsToBoard({ actorUid: "actor", targetBoardId: "target", assetIds: ["asset"] }))
      .rejects.toThrow("unavailable");
  });

  it("cleans copied storage when a later copy or database insert fails", async () => {
    const rows = [
      { id: "one", board_id: "source", storage_key: "source/plainfile", mime_type: "image/png", byte_size: 1, width: null, height: null },
      { id: "two", board_id: "source", storage_key: "source/image.bad!extension", mime_type: "image/png", byte_size: 2, width: null, height: null },
    ];
    vi.mocked(getBoardAccess).mockResolvedValue({ role: "viewer", board: {} } as never);
    const copy = vi.fn().mockResolvedValueOnce({ error: null }).mockResolvedValueOnce({ error: new Error("copy failed") });
    const remove = vi.fn().mockRejectedValue(new Error("cleanup failed"));
    vi.mocked(supabaseAdmin).mockReturnValue({
      from: () => ({ select: () => ({ in: vi.fn().mockResolvedValue({ data: rows, error: null }) }) }),
      storage: { from: () => ({ copy, remove }) },
    } as never);
    await expect(cloneAssetsToBoard({ actorUid: "actor", targetBoardId: "target", assetIds: ["one", "two"] }))
      .rejects.toThrow("copy failed");
    expect(remove).toHaveBeenCalledWith([expect.stringMatching(/^target\//)]);

    const insert = vi.fn().mockResolvedValue({ error: new Error("insert failed") });
    const successfulCopy = vi.fn().mockResolvedValue({ error: null });
    const successfulRemove = vi.fn().mockResolvedValue({ error: null });
    vi.mocked(supabaseAdmin).mockReturnValue({
      from: vi.fn()
        .mockReturnValueOnce({ select: () => ({ in: vi.fn().mockResolvedValue({ data: [rows[0]], error: null }) }) })
        .mockReturnValueOnce({ insert }),
      storage: { from: () => ({ copy: successfulCopy, remove: successfulRemove }) },
    } as never);
    await expect(cloneAssetsToBoard({ actorUid: "actor", targetBoardId: "target", assetIds: ["one"] }))
      .rejects.toThrow("insert failed");
    expect(successfulRemove).toHaveBeenCalledOnce();

    const failedFirstCopy = vi.fn().mockResolvedValue({ error: new Error("first copy failed") });
    const unusedRemove = vi.fn();
    vi.mocked(supabaseAdmin).mockReturnValue({
      from: () => ({ select: () => ({ in: vi.fn().mockResolvedValue({ data: [rows[0]], error: null }) }) }),
      storage: { from: () => ({ copy: failedFirstCopy, remove: unusedRemove }) },
    } as never);
    await expect(cloneAssetsToBoard({ actorUid: "actor", targetBoardId: "target", assetIds: ["one"] }))
      .rejects.toThrow("first copy failed");
    expect(unusedRemove).not.toHaveBeenCalled();
  });
});
