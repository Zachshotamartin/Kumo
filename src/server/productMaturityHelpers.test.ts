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
  });

  it("returns visual before/after payloads for additions, removals, and changes", () => {
    const diff = branchVisualDiff({ nodes: { removed: { id: "removed" }, changed: { id: "changed", x: 0 } } }, { nodes: { added: { id: "added", type: "ellipse" }, changed: { id: "changed", x: 2 } } });
    expect(diff).toEqual(expect.arrayContaining([
      expect.objectContaining({ shapeId: "removed", status: "removed", after: null }),
      expect.objectContaining({ shapeId: "added", status: "added", before: null }),
      expect.objectContaining({ shapeId: "changed", status: "changed" }),
    ]));
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
  });

  it("sanitizes extension permissions, rejects invalid manifests, and detects deep folder cycles", () => {
    expect(sanitizeExtensionManifest({ id: "kumo.example", name: " Example ", permissions: ["read-document", "danger"], commands: [{ id: "run" }] })).toMatchObject({ id: "kumo.example", name: "Example", permissions: ["read-document"] });
    expect(() => sanitizeExtensionManifest({ id: "bad id", name: "Bad", commands: [] })).toThrow("invalid");
    const folders = [{ id: "a", parent_id: null }, { id: "b", parent_id: "a" }, { id: "c", parent_id: "b" }];
    expect(folderMoveCreatesCycle(folders, "a", "c")).toBe(true);
    expect(folderMoveCreatesCycle(folders, "c", "a")).toBe(false);
  });

  it("summarizes retry and recovery health", () => {
    expect(summarizeConnectionTelemetry([
      { event: "ready", at: "1" }, { event: "lost", retryCount: 2, at: "2" }, { event: "restored", durationMs: 240, at: "3" },
    ])).toMatchObject({ eventCount: 3, retryCount: 2, recoveryRate: 1, averageRecoveryMs: 240, healthy: true });
    expect(summarizeConnectionTelemetry([{ event: "failed", at: "1" }]).healthy).toBe(false);
  });
});
