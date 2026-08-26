import { createHash } from "node:crypto";
import {
  DEFAULT_COVERAGE_POLICY,
  PRODUCT_STATE_KINDS,
  type CoveragePolicy,
  type CoverageResult,
  type ProductCriticality,
  type ProductFlow,
  type ProductViewport,
} from "../../src/platform/productCoverage.js";

const record = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const stringArray = <T extends string>(value: unknown, allowed?: readonly T[]): T[] => Array.isArray(value)
  ? [...new Set(value.filter((item): item is T => typeof item === "string" && (!allowed || allowed.includes(item as T))))]
  : [];
const integer = (value: unknown, fallback: number, minimum: number, maximum: number) => Number.isInteger(value) ? Math.min(maximum, Math.max(minimum, value as number)) : fallback;

export const normalizeCoveragePolicy = (value: unknown, fallback: CoveragePolicy = DEFAULT_COVERAGE_POLICY): CoveragePolicy => {
  const source = record(value);
  const viewports = ["mobile", "tablet", "desktop", "responsive"] as const;
  return {
    id: typeof source.id === "string" && source.id ? source.id : fallback.id,
    name: typeof source.name === "string" && source.name.trim() ? source.name.trim().slice(0, 120) : fallback.name,
    version: integer(source.version, fallback.version, 1, 1_000_000),
    requiredStates: source.requiredStates === undefined ? fallback.requiredStates : stringArray(source.requiredStates, PRODUCT_STATE_KINDS),
    requiredRoles: source.requiredRoles === undefined ? fallback.requiredRoles : stringArray<string>(source.requiredRoles).map((role) => role.trim()).filter(Boolean).slice(0, 32),
    requiredViewports: source.requiredViewports === undefined ? fallback.requiredViewports : stringArray<ProductViewport>(source.requiredViewports, viewports),
    terminalStates: source.terminalStates === undefined ? fallback.terminalStates : stringArray(source.terminalStates, PRODUCT_STATE_KINDS),
    requireMetadata: typeof source.requireMetadata === "boolean" ? source.requireMetadata : fallback.requireMetadata,
    requireRequirementRefs: typeof source.requireRequirementRefs === "boolean" ? source.requireRequirementRefs : fallback.requireRequirementRefs,
    enforceNoDeadEnds: typeof source.enforceNoDeadEnds === "boolean" ? source.enforceNoDeadEnds : fallback.enforceNoDeadEnds,
    enforceAccessibility: typeof source.enforceAccessibility === "boolean" ? source.enforceAccessibility : fallback.enforceAccessibility,
    enforceRecoveryPaths: typeof source.enforceRecoveryPaths === "boolean" ? source.enforceRecoveryPaths : fallback.enforceRecoveryPaths,
    minimumScore: integer(source.minimumScore, fallback.minimumScore, 0, 100),
    blockCriticalRegressions: typeof source.blockCriticalRegressions === "boolean" ? source.blockCriticalRegressions : fallback.blockCriticalRegressions,
    maxNodes: integer(source.maxNodes, fallback.maxNodes, 1, 25_000),
    maxEdges: integer(source.maxEdges, fallback.maxEdges, 1, 50_000),
  };
};

export const normalizeProductFlow = (value: unknown): ProductFlow | null => {
  const source = record(value);
  const id = typeof source.id === "string" ? source.id.trim().slice(0, 160) : "";
  const name = typeof source.name === "string" ? source.name.trim().slice(0, 120) : "";
  const startBoardId = typeof source.startBoardId === "string" ? source.startBoardId.trim() : "";
  const startFrameId = typeof source.startFrameId === "string" ? source.startFrameId.trim().slice(0, 200) : "";
  if (!id || !name || !startBoardId || !startFrameId) return null;
  const criticality = ["critical", "required", "optional"].includes(String(source.criticality)) ? source.criticality as ProductCriticality : "required";
  return { id, name, description: typeof source.description === "string" ? source.description.trim().slice(0, 2000) : "", startBoardId, startFrameId, criticality, ownerId: typeof source.ownerId === "string" ? source.ownerId : null, status: source.status === "archived" ? "archived" : "active" };
};

export const coverageRevisionKey = (inputs: Array<{ boardId: string; roomId: string; checksum: string }>) => createHash("sha256")
  .update(JSON.stringify([...inputs].sort((left, right) => left.boardId.localeCompare(right.boardId))))
  .digest("hex");

export const coverageResultIsBlocking = (
  result: Pick<CoverageResult, "score" | "criticalBlockers">,
  gate: { mode: "off" | "advisory" | "enforced"; minimumScore: number; blockCriticalRegressions: boolean },
  hasCriticalRegression = result.criticalBlockers > 0,
) => gate.mode === "enforced" && (result.score < gate.minimumScore || (gate.blockCriticalRegressions && hasCriticalRegression));
