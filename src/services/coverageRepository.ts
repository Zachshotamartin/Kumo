import type {
  CoverageDelta,
  CoverageDraftSuggestion,
  CoveragePolicy,
  CoverageResult,
  CoverageSuppression,
  ProductFlow,
} from "../platform/productCoverage";
import { authenticatedFetch } from "./apiClient";

export interface CoverageRunSummary {
  id: string;
  branch_id: string | null;
  policy_version: number;
  revision_key: string;
  root_checksum: string;
  score: number;
  critical_blockers: number;
  status: "complete" | "failed";
  created_at: string;
}

export interface CoverageGate {
  mode: "off" | "advisory" | "enforced";
  minimum_score: number;
  block_critical_regressions: boolean;
  updated_at?: string;
}

export interface CoverageOverview {
  flows: ProductFlow[];
  policy: CoveragePolicy;
  suppressions: CoverageSuppression[];
  runs: CoverageRunSummary[];
  gate: CoverageGate;
  permissions: { managePolicy: boolean; manageGate: boolean };
}

const post = <T>(body: Record<string, unknown>) => authenticatedFetch<T>("/api/coverage", { method: "POST", body: JSON.stringify(body) });

export const loadCoverageOverview = (boardId: string) => authenticatedFetch<CoverageOverview>(`/api/coverage?scope=overview&boardId=${encodeURIComponent(boardId)}`).then((result) => ({ ...result, flows: result.flows ?? [], suppressions: result.suppressions ?? [], runs: result.runs ?? [], permissions: result.permissions ?? { managePolicy: false, manageGate: false } }));
export const runProductCoverage = (boardId: string, branchId?: string | null, persist = true) => post<{ result: CoverageResult; persisted: { runId: string; revisionKey: string; rootChecksum: string } | null }>({ action: "run", boardId, branchId, persist }).then((response) => response.result);
export const previewProductCoverage = (boardId: string, branchId?: string | null) => authenticatedFetch<{ result: CoverageResult }>(`/api/coverage?scope=run&boardId=${encodeURIComponent(boardId)}${branchId ? `&branchId=${encodeURIComponent(branchId)}` : ""}`).then((response) => response.result);
export const saveProductFlow = (boardId: string, flow: ProductFlow) => post<{ flow: ProductFlow }>({ action: "save-flow", boardId, flow }).then((response) => response.flow);
export const archiveProductFlow = (boardId: string, flowId: string) => post<{ archived: true }>({ action: "archive-flow", boardId, flowId });
export const saveCoveragePolicy = (boardId: string, policy: CoveragePolicy) => post<{ policy: CoveragePolicy }>({ action: "save-policy", boardId, policy }).then((response) => response.policy);
export const suppressCoverageFinding = (boardId: string, fingerprint: string, reason: string, expiresAt?: string | null) => post<{ suppressed: true }>({ action: "suppress", boardId, fingerprint, reason, expiresAt });
export const unsuppressCoverageFinding = (boardId: string, fingerprint: string) => post<{ suppressed: false }>({ action: "unsuppress", boardId, fingerprint });
export const saveCoverageGate = (boardId: string, gate: { mode: CoverageGate["mode"]; minimumScore: number; blockCriticalRegressions: boolean }) => post<{ gate: CoverageGate }>({ action: "save-gate", boardId, ...gate }).then((response) => response.gate);
export const compareCoverageRuns = (boardId: string, beforeRunId: string, afterRunId: string) => post<{ delta: CoverageDelta }>({ action: "compare", boardId, beforeRunId, afterRunId }).then((response) => response.delta);
export const requestCoverageSuggestions = (boardId: string, branchId?: string | null) => post<{ suggestions: CoverageDraftSuggestion[] }>({ action: "suggest", boardId, branchId }).then((response) => response.suggestions);
export const loadCoverageTelemetry = (boardId: string, branchId?: string | null) => post<{ telemetry: { neverObserved: string[]; notDesigned: string[]; failures: Record<string, number>; abandonments: Record<string, number> } }>({ action: "telemetry-analysis", boardId, branchId }).then((response) => response.telemetry);
export const ingestCoverageTelemetry = (boardId: string, events: Array<{ screenKey: string; state: string; role?: string; viewport?: string; outcome: string; durationMs?: number }>) => post<{ accepted: number }>({ action: "telemetry", boardId, events });

export const coverageReportUrl = (boardId: string, format: "json" | "junit" | "sarif") => `/api/coverage?scope=report&boardId=${encodeURIComponent(boardId)}&format=${format}`;
