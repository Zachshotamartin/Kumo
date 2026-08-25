import {
  cleanProductName,
  diffLibraryPayload,
  documentNodes,
  extractLibraryAssets,
  mergeLibraryPayload,
} from "../../server/api/_product";

describe("product API document helpers", () => {
  const document = {
    backgroundColor: "#252629",
    nodes: {
      component: { id: "component", type: "frame", componentDefinition: true, name: "Button", zIndex: 1 },
      child: { id: "child", type: "text", parentId: "component", text: "Label", zIndex: 2 },
      resource: { id: "resource", type: "resource", resourceKind: "color-variable", zIndex: 3 },
      ordinary: { id: "ordinary", type: "rectangle", zIndex: 4 },
    },
  };

  it("reads document nodes and extracts component trees and resources", () => {
    expect(Object.keys(documentNodes(document))).toEqual(["component", "child", "resource", "ordinary"]);
    expect(documentNodes(null)).toEqual({});
    const assets = extractLibraryAssets(document);
    expect(assets.map((asset) => asset.id)).toEqual(["component", "child", "resource"]);
    expect(assets.every((asset) => asset.librarySourceId === asset.id)).toBe(true);
    expect(extractLibraryAssets({ nodes: {
      invalid: { type: "resource" },
      sourced: { id: "sourced", type: "resource", librarySourceId: "original" },
    } })).toEqual([expect.objectContaining({ id: "sourced", librarySourceId: "original" })]);
  });

  it("reports added, removed, changed, and unchanged assets", () => {
    const current = [
      { id: "local-a", librarySourceId: "a", name: "Same", zIndex: 1 },
      { id: "local-b", librarySourceId: "b", name: "Old" },
      { id: "local-c", librarySourceId: "c", name: "Removed" },
    ];
    const incoming = [
      { id: "source-a", librarySourceId: "a", name: "Same", zIndex: 99 },
      { id: "source-b", librarySourceId: "b", name: "New" },
      { id: "source-d", librarySourceId: "d", name: "Added" },
    ];
    expect(diffLibraryPayload(current, incoming)).toEqual([
      { sourceId: "a", status: "unchanged" },
      { sourceId: "b", status: "changed" },
      { sourceId: "c", status: "removed" },
      { sourceId: "d", status: "added" },
    ]);
  });

  it("updates imports in place, remaps parents, removes stale assets, and retains local nodes", () => {
    const current = {
      nodes: {
        local: { id: "local", type: "rectangle", zIndex: 9 },
        imported: { id: "imported", libraryId: "library", librarySourceId: "root", zIndex: 3 },
        stale: { id: "stale", libraryId: "library", librarySourceId: "stale", zIndex: 4 },
      },
    };
    const next = mergeLibraryPayload(current, [
      { id: "source-root", librarySourceId: "root", type: "frame" },
      { id: "source-child", librarySourceId: "child", type: "text", parentId: "source-root" },
    ], "library", 4);
    expect(next.nodes.local).toBeDefined();
    expect(next.nodes.stale).toBeUndefined();
    expect(next.nodes.imported).toMatchObject({ id: "imported", libraryVersion: 4, zIndex: 3 });
    const child = Object.values(next.nodes).find((node) => node.librarySourceId === "child")!;
    expect(child.parentId).toBe("imported");
  });

  it("merges sparse legacy library payloads with stable fallbacks", () => {
    expect(diffLibraryPayload([{ id: "same", name: "old" }], [{ id: "same", name: "new" }]))
      .toEqual([{ sourceId: "same", status: "changed" }]);
    const next = mergeLibraryPayload({ nodes: {
      imported: { id: "imported", libraryId: "library", zIndex: "legacy" },
      local: { id: "local", zIndex: "legacy" },
    } }, [
      { id: "imported", type: "frame" },
      { id: "child", type: "text", parentId: "external" },
    ], "library", 2);
    expect(next.nodes.imported).toMatchObject({ id: "imported", librarySourceId: "imported", zIndex: 1 });
    expect(Object.values(next.nodes)).toContainEqual(expect.objectContaining({ librarySourceId: "child", parentId: "external", zIndex: 2 }));
  });

  it("cleans external names without allowing empty or oversized values", () => {
    expect(cleanProductName("  Project  ", "Fallback")).toBe("Project");
    expect(cleanProductName("", "Fallback")).toBe("Fallback");
    expect(cleanProductName(42, "Fallback")).toBe("Fallback");
    expect(cleanProductName("x".repeat(140), "Fallback")).toHaveLength(120);
  });
});
