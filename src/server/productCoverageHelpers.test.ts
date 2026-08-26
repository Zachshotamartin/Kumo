import {
  coverageResultIsBlocking,
  coverageRevisionKey,
  normalizeCoveragePolicy,
  normalizeProductFlow,
} from "../../server/api/_coverage";
import { DEFAULT_COVERAGE_POLICY } from "../platform/productCoverage";

describe("coverage server contracts", () => {
  it("normalizes a complete policy and bounds untrusted values", () => {
    expect(normalizeCoveragePolicy({
      id: "policy", name: "  Strict  ", version: 2,
      requiredStates: ["default", "invalid"], requiredRoles: [" admin ", "", 4],
      requiredViewports: ["mobile", "watch"], terminalStates: ["success"],
      requireMetadata: false, requireRequirementRefs: true, enforceNoDeadEnds: false,
      enforceAccessibility: false, enforceRecoveryPaths: false, minimumScore: 500,
      blockCriticalRegressions: false, maxNodes: 100_000, maxEdges: -1,
    })).toEqual({
      id: "policy", name: "Strict", version: 2,
      requiredStates: ["default"], requiredRoles: ["admin"], requiredViewports: ["mobile"], terminalStates: ["success"],
      requireMetadata: false, requireRequirementRefs: true, enforceNoDeadEnds: false,
      enforceAccessibility: false, enforceRecoveryPaths: false, minimumScore: 100,
      blockCriticalRegressions: false, maxNodes: 25_000, maxEdges: 1,
    });
  });

  it("falls back for absent, malformed, and out-of-range policy fields", () => {
    expect(normalizeCoveragePolicy(null)).toEqual(DEFAULT_COVERAGE_POLICY);
    expect(normalizeCoveragePolicy({ id: "", name: "", version: 0.5, requiredStates: "bad", requiredRoles: "bad", requiredViewports: null, terminalStates: {}, minimumScore: "90", maxNodes: NaN, maxEdges: null })).toEqual({
      ...DEFAULT_COVERAGE_POLICY,
      requiredStates: [], requiredRoles: [], requiredViewports: [], terminalStates: [],
    });
  });

  it("accepts valid product flows and rejects every incomplete identity", () => {
    expect(normalizeProductFlow({ id: " flow ", name: " Checkout ", description: " desc ", startBoardId: " board ", startFrameId: " frame ", criticality: "critical", ownerId: "owner", status: "archived" })).toEqual({ id: "flow", name: "Checkout", description: "desc", startBoardId: "board", startFrameId: "frame", criticality: "critical", ownerId: "owner", status: "archived" });
    expect(normalizeProductFlow({ id: "flow", name: "Flow", startBoardId: "board", startFrameId: "frame", criticality: "invalid", ownerId: 4, status: "other" })).toMatchObject({ criticality: "required", ownerId: null, status: "active", description: "" });
    expect(normalizeProductFlow(null)).toBeNull();
    expect(normalizeProductFlow({ name: "Flow", startBoardId: "board", startFrameId: "frame" })).toBeNull();
    expect(normalizeProductFlow({ id: "flow", startBoardId: "board", startFrameId: "frame" })).toBeNull();
    expect(normalizeProductFlow({ id: "flow", name: "Flow", startFrameId: "frame" })).toBeNull();
    expect(normalizeProductFlow({ id: "flow", name: "Flow", startBoardId: "board" })).toBeNull();
  });

  it("produces an order-independent revision key", () => {
    const inputs = [{ boardId: "b", roomId: "room-b", checksum: "2" }, { boardId: "a", roomId: "room-a", checksum: "1" }];
    expect(coverageRevisionKey(inputs)).toMatch(/^[a-f0-9]{64}$/);
    expect(coverageRevisionKey(inputs)).toBe(coverageRevisionKey([...inputs].reverse()));
  });

  it("blocks only enforced gates with score or critical regressions", () => {
    expect(coverageResultIsBlocking({ score: 0, criticalBlockers: 5 }, { mode: "off", minimumScore: 90, blockCriticalRegressions: true })).toBe(false);
    expect(coverageResultIsBlocking({ score: 0, criticalBlockers: 5 }, { mode: "advisory", minimumScore: 90, blockCriticalRegressions: true })).toBe(false);
    expect(coverageResultIsBlocking({ score: 89, criticalBlockers: 0 }, { mode: "enforced", minimumScore: 90, blockCriticalRegressions: false })).toBe(true);
    expect(coverageResultIsBlocking({ score: 100, criticalBlockers: 1 }, { mode: "enforced", minimumScore: 90, blockCriticalRegressions: true })).toBe(true);
    expect(coverageResultIsBlocking({ score: 100, criticalBlockers: 1 }, { mode: "enforced", minimumScore: 90, blockCriticalRegressions: false })).toBe(false);
    expect(coverageResultIsBlocking({ score: 100, criticalBlockers: 0 }, { mode: "enforced", minimumScore: 90, blockCriticalRegressions: true }, false)).toBe(false);
  });
});
