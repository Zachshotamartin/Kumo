import { mkdir, writeFile } from "node:fs/promises";
import { launch } from "chrome-launcher";
import lighthouse from "lighthouse";
import { assertLighthouseBudgets, assertLighthouseQuorum, lighthouseBudgetFailures } from "../src/server/lighthouseBudgets.ts";

const url = process.env.LHCI_URL || process.argv[2] || "http://127.0.0.1:4177";
const outputDirectory = ".lighthouseci";
const runCount = Number(process.env.LIGHTHOUSE_RUNS || 3);
if (!Number.isInteger(runCount) || runCount < 1 || runCount > 5) {
  throw new Error("LIGHTHOUSE_RUNS must be an integer from 1 through 5.");
}
const chrome = await launch({ chromeFlags: ["--headless", "--no-sandbox", "--disable-gpu"] });
try {
  await mkdir(outputDirectory, { recursive: true });
  const reports = [];
  for (let index = 0; index < runCount; index += 1) {
    const result = await lighthouse(url, {
      port: chrome.port,
      output: "json",
      logLevel: "error",
      onlyCategories: ["performance", "accessibility", "best-practices", "seo"],
    }, {
      extends: "lighthouse:default",
      settings: { formFactor: "desktop", screenEmulation: { mobile: false, width: 1350, height: 940, deviceScaleFactor: 1, disabled: false } },
    });
    if (!result) throw new Error(`Lighthouse did not return report ${index + 1}.`);
    reports.push(result.lhr);
    await writeFile(`${outputDirectory}/report-${index + 1}.json`, result.report);
    const failures = lighthouseBudgetFailures(result.lhr);
    console.log(`Lighthouse run ${index + 1}/${runCount}: performance ${result.lhr.categories.performance?.score ?? "missing"}, TBT ${result.lhr.audits["total-blocking-time"]?.numericValue ?? "missing"}ms${failures.length ? `; ${failures.join("; ")}` : "; passed"}.`);
  }
  const quorum = assertLighthouseQuorum(reports);
  const passingReports = reports.filter((report) => lighthouseBudgetFailures(report).length === 0);
  passingReports.sort((left, right) => (left.categories.performance?.score ?? 0) - (right.categories.performance?.score ?? 0));
  const representative = passingReports[Math.floor(passingReports.length / 2)];
  await writeFile(`${outputDirectory}/report.json`, JSON.stringify(representative, null, 2));
  const summary = assertLighthouseBudgets(representative);
  console.log(`Lighthouse quorum passed (${quorum.passing}/${quorum.total}): performance ${summary.performance}, accessibility ${summary.accessibility}, best practices ${summary.bestPractices}, SEO ${summary.seo}.`);
} finally {
  await chrome.kill();
}
