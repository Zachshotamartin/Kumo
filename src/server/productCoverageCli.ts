import type { CoverageResult } from "../platform/productCoverage.js";
import { formatCoverageReport } from "./coverageReport.ts";

export interface CoverageCliOptions {
  baseUrl: string;
  boardId: string;
  token: string;
  branchId?: string;
  format: "json" | "junit" | "sarif";
  minimumScore?: number;
}

const integer = (value: string | undefined) => value !== undefined && /^\d+$/.test(value) ? Number(value) : undefined;

export const parseCoverageCliArguments = (args: string[], environment: Record<string, string | undefined>): CoverageCliOptions => {
  const values = new Map<string, string>();
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index]!;
    if (!argument.startsWith("--")) throw new Error(`Unknown argument: ${argument}`);
    const [key, inline] = argument.slice(2).split("=", 2) as [string, string?];
    const value = inline ?? args[++index];
    if (!value || value.startsWith("--")) throw new Error(`A value is required for --${key}.`);
    values.set(key, value);
  }
  const baseUrl = values.get("base-url") ?? environment.KUMO_BASE_URL ?? "";
  const boardId = values.get("board") ?? environment.COVERAGE_BOARD_ID ?? "";
  const token = values.get("token") ?? environment.KUMO_ID_TOKEN ?? "";
  const branchId = values.get("branch") ?? environment.COVERAGE_BRANCH_ID;
  const formatValue = values.get("format") ?? environment.COVERAGE_REPORT_FORMAT ?? "json";
  const format = ["json", "junit", "sarif"].includes(formatValue) ? formatValue as CoverageCliOptions["format"] : null;
  const minimumScore = integer(values.get("minimum-score") ?? environment.COVERAGE_MINIMUM_SCORE);
  if (!baseUrl || !boardId || !token) throw new Error("KUMO_BASE_URL, COVERAGE_BOARD_ID, and KUMO_ID_TOKEN are required.");
  if (!format) throw new Error("Coverage report format must be json, junit, or sarif.");
  if (minimumScore !== undefined && (minimumScore < 0 || minimumScore > 100)) throw new Error("Coverage minimum score must be between 0 and 100.");
  return { baseUrl: baseUrl.replace(/\/$/, ""), boardId, token, ...(branchId ? { branchId } : {}), format, ...(minimumScore !== undefined ? { minimumScore } : {}) };
};

export const coverageVerificationFailure = (result: CoverageResult, minimumScore = result.policy.minimumScore) => result.score < minimumScore
  ? `Product coverage is ${result.score}%; ${minimumScore}% is required.`
  : result.criticalBlockers > 0
    ? `Product coverage has ${result.criticalBlockers} critical blocker${result.criticalBlockers === 1 ? "" : "s"}.`
    : null;

export const fetchCoverageVerification = async (options: CoverageCliOptions, fetchImpl: typeof fetch = fetch) => {
  const response = await fetchImpl(`${options.baseUrl}/api/coverage`, {
    method: "POST",
    headers: { authorization: `Bearer ${options.token}`, "content-type": "application/json" },
    body: JSON.stringify({ action: "run", boardId: options.boardId, branchId: options.branchId, persist: true }),
  });
  if (!response.ok) {
    const detail = (await response.text()).trim();
    throw new Error(`Coverage analysis failed (${response.status})${detail ? `: ${detail}` : "."}`);
  }
  const payload = await response.json() as { result?: CoverageResult };
  if (!payload.result || typeof payload.result.score !== "number" || !Array.isArray(payload.result.findings)) throw new Error("Coverage API returned an invalid result.");
  return {
    result: payload.result,
    report: formatCoverageReport(payload.result, options.format),
    failure: coverageVerificationFailure(payload.result, options.minimumScore),
  };
};
