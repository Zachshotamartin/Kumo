import { mkdir, writeFile } from "node:fs/promises";
import { launch } from "chrome-launcher";
import lighthouse from "lighthouse";
import { assertLighthouseBudgets } from "../src/server/lighthouseBudgets.ts";

const url = process.env.LHCI_URL || process.argv[2] || "http://127.0.0.1:4177";
const outputDirectory = ".lighthouseci";
const chrome = await launch({ chromeFlags: ["--headless", "--no-sandbox", "--disable-gpu"] });
try {
  const result = await lighthouse(url, {
    port: chrome.port,
    output: "json",
    logLevel: "error",
    onlyCategories: ["performance", "accessibility", "best-practices", "seo"],
  }, {
    extends: "lighthouse:default",
    settings: { formFactor: "desktop", screenEmulation: { mobile: false, width: 1350, height: 940, deviceScaleFactor: 1, disabled: false } },
  });
  if (!result) throw new Error("Lighthouse did not return a report.");
  await mkdir(outputDirectory, { recursive: true });
  await writeFile(`${outputDirectory}/report.json`, result.report);
  const summary = assertLighthouseBudgets(result.lhr);
  console.log(`Lighthouse budgets passed: performance ${summary.performance}, accessibility ${summary.accessibility}, best practices ${summary.bestPractices}, SEO ${summary.seo}.`);
} finally {
  await chrome.kill();
}
