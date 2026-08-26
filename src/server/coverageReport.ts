import type { CoverageResult } from "../platform/productCoverage.js";

const xmlEscape = (value: string) => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&apos;");

export const formatCoverageReport = (result: CoverageResult, format: "json" | "junit" | "sarif"): string => {
  if (format === "json") return JSON.stringify(result, null, 2);
  const active = result.findings.filter((finding) => !finding.suppressed);
  if (format === "junit") return `<?xml version="1.0" encoding="UTF-8"?><testsuite name="Kumo product coverage" tests="${Math.max(1, active.length)}" failures="${active.length}">${active.length ? active.map((finding) => `<testcase classname="${finding.rule}" name="${xmlEscape(finding.fingerprint)}"><failure message="${xmlEscape(finding.message)}">${xmlEscape(finding.remediation)}</failure></testcase>`).join("") : "<testcase classname=\"coverage\" name=\"complete\"/>"}</testsuite>`;
  return JSON.stringify({
    version: "2.1.0",
    $schema: "https://json.schemastore.org/sarif-2.1.0.json",
    runs: [{
      tool: { driver: { name: "Kumo Product Coverage", rules: [...new Set(active.map((finding) => finding.rule))].map((rule) => ({ id: rule, name: rule })) } },
      results: active.map((finding) => ({ ruleId: finding.rule, level: finding.severity === "critical" || finding.severity === "error" ? "error" : finding.severity === "warning" ? "warning" : "note", message: { text: finding.message }, properties: { fingerprint: finding.fingerprint, boardId: finding.boardId, frameId: finding.frameId, remediation: finding.remediation } })),
    }],
  }, null, 2);
};
