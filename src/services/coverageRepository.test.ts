import { authenticatedFetch } from "./apiClient";
import {
  archiveProductFlow,
  compareCoverageRuns,
  coverageReportUrl,
  ingestCoverageTelemetry,
  loadCoverageOverview,
  loadCoverageTelemetry,
  previewProductCoverage,
  requestCoverageSuggestions,
  runProductCoverage,
  saveCoverageGate,
  saveCoveragePolicy,
  saveProductFlow,
  suppressCoverageFinding,
  unsuppressCoverageFinding,
} from "./coverageRepository";
import { DEFAULT_COVERAGE_POLICY, type CoverageResult, type ProductFlow } from "../platform/productCoverage";

vi.mock("./apiClient", () => ({ authenticatedFetch: vi.fn() }));

const result: CoverageResult = { policy: DEFAULT_COVERAGE_POLICY, score: 100, criticalBlockers: 0, suppressedCount: 0, generatedAt: "", stale: false, graph: { nodes: [], edges: [], flows: [] }, findings: [], categories: {}, flowScores: {} };
const flow: ProductFlow = { id: "flow", name: "Flow", description: "", startBoardId: "board", startFrameId: "frame", criticality: "critical", status: "active" };

describe("coverage repository", () => {
  beforeEach(() => vi.clearAllMocks());

  it("loads and normalizes overview collections", async () => {
    vi.mocked(authenticatedFetch).mockResolvedValue({ policy: DEFAULT_COVERAGE_POLICY, gate: { mode: "advisory", minimum_score: 90, block_critical_regressions: true } });
    await expect(loadCoverageOverview("board/id")).resolves.toMatchObject({ flows: [], suppressions: [], runs: [] });
    expect(authenticatedFetch).toHaveBeenCalledWith("/api/coverage?scope=overview&boardId=board%2Fid");
  });

  it("runs persisted and preview coverage with optional branches", async () => {
    vi.mocked(authenticatedFetch).mockResolvedValueOnce({ result, persisted: null }).mockResolvedValueOnce({ result }).mockResolvedValueOnce({ result });
    await expect(runProductCoverage("board", "branch", false)).resolves.toBe(result);
    expect(authenticatedFetch).toHaveBeenNthCalledWith(1, "/api/coverage", expect.objectContaining({ body: JSON.stringify({ action: "run", boardId: "board", branchId: "branch", persist: false }) }));
    await expect(previewProductCoverage("board", "branch/id")).resolves.toBe(result);
    expect(authenticatedFetch).toHaveBeenNthCalledWith(2, "/api/coverage?scope=run&boardId=board&branchId=branch%2Fid");
    await expect(previewProductCoverage("board")).resolves.toBe(result);
    expect(authenticatedFetch).toHaveBeenNthCalledWith(3, "/api/coverage?scope=run&boardId=board");
  });

  it("manages flows, policy, suppressions, gates, comparisons, suggestions, telemetry, and reports", async () => {
    vi.mocked(authenticatedFetch)
      .mockResolvedValueOnce({ flow })
      .mockResolvedValueOnce({ archived: true })
      .mockResolvedValueOnce({ policy: DEFAULT_COVERAGE_POLICY })
      .mockResolvedValueOnce({ suppressed: true })
      .mockResolvedValueOnce({ suppressed: false })
      .mockResolvedValueOnce({ gate: { mode: "enforced", minimum_score: 95, block_critical_regressions: true } })
      .mockResolvedValueOnce({ delta: { scoreDelta: 1 } })
      .mockResolvedValueOnce({ suggestions: [{ kind: "create-state" }] })
      .mockResolvedValueOnce({ telemetry: { neverObserved: [], notDesigned: [], failures: {}, abandonments: {} } })
      .mockResolvedValueOnce({ accepted: 1 });
    await expect(saveProductFlow("board", flow)).resolves.toBe(flow);
    await expect(archiveProductFlow("board", "flow")).resolves.toEqual({ archived: true });
    await expect(saveCoveragePolicy("board", DEFAULT_COVERAGE_POLICY)).resolves.toBe(DEFAULT_COVERAGE_POLICY);
    await expect(suppressCoverageFinding("board", "finding", "Not applicable", "2027-01-01")).resolves.toEqual({ suppressed: true });
    await expect(unsuppressCoverageFinding("board", "finding")).resolves.toEqual({ suppressed: false });
    await expect(saveCoverageGate("board", { mode: "enforced", minimumScore: 95, blockCriticalRegressions: true })).resolves.toMatchObject({ mode: "enforced" });
    await expect(compareCoverageRuns("board", "before", "after")).resolves.toMatchObject({ scoreDelta: 1 });
    await expect(requestCoverageSuggestions("board", null)).resolves.toEqual([{ kind: "create-state" }]);
    await expect(loadCoverageTelemetry("board", "branch")).resolves.toMatchObject({ failures: {} });
    await expect(ingestCoverageTelemetry("board", [{ screenKey: "Checkout", state: "error", outcome: "failure" }])).resolves.toEqual({ accepted: 1 });
    expect(coverageReportUrl("board/id", "sarif")).toBe("/api/coverage?scope=report&boardId=board%2Fid&format=sarif");
    expect(authenticatedFetch).toHaveBeenCalledTimes(10);
    expect(authenticatedFetch).toHaveBeenCalledWith("/api/coverage", expect.objectContaining({ method: "POST", body: JSON.stringify({ action: "suppress", boardId: "board", fingerprint: "finding", reason: "Not applicable", expiresAt: "2027-01-01" }) }));
  });
});
