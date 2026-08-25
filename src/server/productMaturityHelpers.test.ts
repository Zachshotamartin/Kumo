import { branchVisualDiff, threeWayMergeDocuments } from "../../server/api/_branchMerge";
import { folderMoveCreatesCycle, hashPassword, sanitizeExtensionManifest, summarizeConnectionTelemetry, verifyPassword } from "../../server/api/_platform";
import { hashSecret, verifySecret } from "../../server/api/_security";

describe("product maturity helpers", () => {
  it("three-way merges independent changes and exposes resolvable conflicts", () => {
    const base = { schemaVersion: 4, backgroundColor: "#000", nodes: { a: { id: "a", x: 0 }, b: { id: "b", x: 0 } }, textCharacters: {} };
    const main = { ...base, backgroundColor: "#111", nodes: { ...base.nodes, a: { id: "a", x: 10 } } };
    const branch = { ...base, backgroundColor: "#222", nodes: { ...base.nodes, b: { id: "b", x: 20 } } };
    const unresolved = threeWayMergeDocuments(base, main, branch);
    expect(unresolved.document.nodes).toEqual({ a: { id: "a", x: 10 }, b: { id: "b", x: 20 } });
    expect(unresolved.conflicts).toEqual([expect.objectContaining({ shapeId: "__background__" })]);
    expect(threeWayMergeDocuments(base, main, branch, { __background__: "branch" }).document.backgroundColor).toBe("#222");
    expect(threeWayMergeDocuments(base, main, branch, { __background__: "main" }).document.backgroundColor).toBe("#111");
  });

  it("merges additions, deletions, text records, and every background resolution", () => {
    const base = { schemaVersion: "2", backgroundColor: "base", nodes: { same: 1, mainDelete: 1, branchDelete: 1, conflict: 1 }, textCharacters: { a: { value: "A" } } };
    const main = { schemaVersion: 6, backgroundColor: "main", nodes: { same: 1, branchDelete: 1, conflict: 2, mainOnly: 2 }, textCharacters: { a: { value: "A" }, b: { value: "B" } } };
    const branch = { schemaVersion: 5, backgroundColor: "base", nodes: { same: 1, mainDelete: 1, conflict: 3, branchOnly: 3 }, textCharacters: { a: { value: "A" } } };
    const resolvedMain = threeWayMergeDocuments(base, main, branch, { conflict: "main" });
    expect(resolvedMain.document).toMatchObject({ schemaVersion: 6, backgroundColor: "main", nodes: { same: 1, conflict: 2, mainOnly: 2, branchOnly: 3 }, textCharacters: { a: { value: "A" }, b: { value: "B" } } });
    const resolvedBranch = threeWayMergeDocuments(base, main, branch, { conflict: "branch" });
    expect(resolvedBranch.document.nodes).toMatchObject({ conflict: 3 });

    expect(threeWayMergeDocuments({ backgroundColor: "base" }, { backgroundColor: "base" }, { backgroundColor: "branch" }).document.backgroundColor).toBe("branch");
    expect(threeWayMergeDocuments({}, {}, {}).document.backgroundColor).toBe("#252629");
    expect(threeWayMergeDocuments(null, [], "bad").document.nodes).toEqual({});
  });

  it("drops records selected as deleted and preserves unresolved conflicts", () => {
    const base = { nodes: { deletedBoth: 1, deletedMain: 1, deletedBranch: 1, conflict: 1 } };
    const main = { nodes: { deletedBranch: 2, conflict: 2 } };
    const branch = { nodes: { deletedMain: 3, conflict: 3 } };
    const result = threeWayMergeDocuments(base, main, branch, { conflict: "main", deletedMain: "main", deletedBranch: "branch" });
    expect(result.document.nodes).toEqual({ conflict: 2 });
    expect(threeWayMergeDocuments(base, main, branch).conflicts.map((item) => item.shapeId)).toEqual(expect.arrayContaining(["deletedMain", "deletedBranch", "conflict"]));
  });

  it("returns visual before/after payloads for additions, removals, and changes", () => {
    const diff = branchVisualDiff({ nodes: { removed: { id: "removed" }, changed: { id: "changed", x: 0 } } }, { nodes: { added: { id: "added", type: "ellipse" }, changed: { id: "changed", x: 2 } } });
    expect(diff).toEqual(expect.arrayContaining([
      expect.objectContaining({ shapeId: "removed", status: "removed", after: null }),
      expect.objectContaining({ shapeId: "added", status: "added", before: null }),
      expect.objectContaining({ shapeId: "changed", status: "changed" }),
    ]));
    expect(branchVisualDiff({ nodes: { same: { id: "same" } } }, { nodes: { same: { id: "same" } } })).toEqual([]);
    expect(branchVisualDiff(null, { nodes: {
      named: { name: "Named" }, typed: { type: "frame" }, fallback: {},
    } }).map((item) => item.name)).toEqual(["Named", "frame", "fallback"]);
    expect(branchVisualDiff({ nodes: { beforeNamed: { name: "Before" }, beforeTyped: { type: "text" } } }, { nodes: {} }).map((item) => item.name)).toEqual(["Before", "text"]);
  });

  it("hashes secrets and passwords without storing the original value", () => {
    const digest = hashSecret("secret");
    expect(digest).toMatch(/^[a-f0-9]{64}$/);
    expect(verifySecret("secret", digest)).toBe(true);
    expect(verifySecret("wrong", digest)).toBe(false);
    const password = hashPassword("prototype-pass");
    expect(password).not.toContain("prototype-pass");
    expect(verifyPassword("prototype-pass", password)).toBe(true);
    expect(verifyPassword("wrong", password)).toBe(false);
    expect(verifyPassword("anything", null)).toBe(true);
    expect(verifyPassword("anything", "broken")).toBe(false);
    expect(verifyPassword("anything", "salt:00")).toBe(false);
  });

  it("sanitizes extension permissions, rejects invalid manifests, and detects deep folder cycles", () => {
    expect(sanitizeExtensionManifest({ id: "kumo.example", name: " Example ", permissions: ["read-document", "danger"], commands: [{ id: "run" }] })).toMatchObject({ id: "kumo.example", name: "Example", permissions: ["read-document"] });
    expect(() => sanitizeExtensionManifest({ id: "bad id", name: "Bad", commands: [] })).toThrow("invalid");
    expect(() => sanitizeExtensionManifest(null)).toThrow("invalid");
    expect(() => sanitizeExtensionManifest({ id: 2, name: 3, permissions: "read", commands: "run" })).toThrow("invalid");
    expect(() => sanitizeExtensionManifest({ id: "kumo.duplicate", name: "Duplicate", permissions: ["storage", "storage"], commands: [{ id: "run" }, null] })).toThrow("unique");
    const folders = [{ id: "a", parent_id: null }, { id: "b", parent_id: "a" }, { id: "c", parent_id: "b" }];
    expect(folderMoveCreatesCycle(folders, "a", "c")).toBe(true);
    expect(folderMoveCreatesCycle(folders, "c", "a")).toBe(false);
    expect(folderMoveCreatesCycle(folders, "a", null)).toBe(false);
    expect(folderMoveCreatesCycle(folders, "a", "a")).toBe(true);
  });

  it("summarizes retry and recovery health", () => {
    expect(summarizeConnectionTelemetry([
      { event: "ready", at: "1" }, { event: "lost", retryCount: 2, at: "2" }, { event: "restored", durationMs: 240, at: "3" },
    ])).toMatchObject({ eventCount: 3, retryCount: 2, recoveryRate: 1, averageRecoveryMs: 240, healthy: true });
    expect(summarizeConnectionTelemetry([{ event: "failed", at: "1" }]).healthy).toBe(false);
  });
});
