import { DEFAULT_COVERAGE_POLICY, type CoverageResult } from "../platform/productCoverage";
import { coverageVerificationFailure, fetchCoverageVerification, parseCoverageCliArguments } from "./productCoverageCli";

const result = (score = 100, criticalBlockers = 0): CoverageResult => ({
  policy: DEFAULT_COVERAGE_POLICY, score, criticalBlockers, suppressedCount: 0,
  generatedAt: "2026-01-01", stale: false, graph: { nodes: [], edges: [], flows: [] }, findings: [], categories: {}, flowScores: {},
});

describe("product coverage verification CLI", () => {
  it("parses inline, positional, environment, branch, format, and score options", () => {
    expect(parseCoverageCliArguments([
      "--base-url=https://kumo.test/", "--board", "board", "--token=secret", "--branch", "branch", "--format", "sarif", "--minimum-score", "95",
    ], {})).toEqual({ baseUrl: "https://kumo.test", boardId: "board", token: "secret", branchId: "branch", format: "sarif", minimumScore: 95 });
    expect(parseCoverageCliArguments([], { KUMO_BASE_URL: "https://env.test", COVERAGE_BOARD_ID: "board", KUMO_ID_TOKEN: "token", COVERAGE_REPORT_FORMAT: "junit", COVERAGE_MINIMUM_SCORE: "0" })).toEqual({ baseUrl: "https://env.test", boardId: "board", token: "token", format: "junit", minimumScore: 0 });
  });

  it("rejects unknown, valueless, incomplete, invalid-format, and invalid-score input", () => {
    expect(() => parseCoverageCliArguments(["board"], {})).toThrow("Unknown argument");
    expect(() => parseCoverageCliArguments(["--board"], {})).toThrow("A value is required");
    expect(() => parseCoverageCliArguments(["--board", "--token", "secret"], {})).toThrow("A value is required");
    expect(() => parseCoverageCliArguments([], {})).toThrow("KUMO_BASE_URL");
    const base = { KUMO_BASE_URL: "https://test", COVERAGE_BOARD_ID: "board", KUMO_ID_TOKEN: "token" };
    expect(() => parseCoverageCliArguments([], { ...base, COVERAGE_REPORT_FORMAT: "xml" })).toThrow("json, junit, or sarif");
    expect(() => parseCoverageCliArguments([], { ...base, COVERAGE_MINIMUM_SCORE: "101" })).toThrow("between 0 and 100");
    expect(parseCoverageCliArguments([], { ...base, COVERAGE_MINIMUM_SCORE: "not-a-number" })).not.toHaveProperty("minimumScore");
  });

  it("explains score and singular/plural critical failures", () => {
    expect(coverageVerificationFailure(result(89), 90)).toBe("Product coverage is 89%; 90% is required.");
    expect(coverageVerificationFailure(result(100, 1))).toBe("Product coverage has 1 critical blocker.");
    expect(coverageVerificationFailure(result(100, 2))).toBe("Product coverage has 2 critical blockers.");
    expect(coverageVerificationFailure(result())).toBeNull();
  });

  it("runs, persists, formats, and evaluates a valid API result", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ result: result(95) }), { status: 200 }));
    const verification = await fetchCoverageVerification({ baseUrl: "https://kumo.test", boardId: "board", token: "secret", branchId: "branch", format: "json", minimumScore: 96 }, fetchImpl);
    expect(fetchImpl).toHaveBeenCalledWith("https://kumo.test/api/coverage", expect.objectContaining({ method: "POST", headers: expect.objectContaining({ authorization: "Bearer secret" }), body: JSON.stringify({ action: "run", boardId: "board", branchId: "branch", persist: true }) }));
    expect(JSON.parse(verification.report)).toMatchObject({ score: 95 });
    expect(verification.failure).toContain("96% is required");
  });

  it("distinguishes HTTP, empty HTTP, and malformed API failures", async () => {
    await expect(fetchCoverageVerification({ baseUrl: "https://test", boardId: "board", token: "token", format: "json" }, async () => new Response("denied", { status: 403 }))).rejects.toThrow("(403): denied");
    await expect(fetchCoverageVerification({ baseUrl: "https://test", boardId: "board", token: "token", format: "json" }, async () => new Response("", { status: 503 }))).rejects.toThrow("(503).");
    await expect(fetchCoverageVerification({ baseUrl: "https://test", boardId: "board", token: "token", format: "json" }, async () => new Response(JSON.stringify({ result: { score: "bad", findings: [] } }), { status: 200 }))).rejects.toThrow("invalid result");
    await expect(fetchCoverageVerification({ baseUrl: "https://test", boardId: "board", token: "token", format: "json" }, async () => new Response(JSON.stringify({}), { status: 200 }))).rejects.toThrow("invalid result");
  });
});
