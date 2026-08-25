import { assertLighthouseBudgets, assertLighthouseQuorum, lighthouseBudgetFailures, type LighthouseReport } from "./lighthouseBudgets";

const passingReport = (): LighthouseReport => ({
  categories: {
    performance: { score: 0.8 },
    accessibility: { score: 1 },
    "best-practices": { score: 0.95 },
    seo: { score: 1 },
  },
  audits: {
    "first-contentful-paint": { numericValue: 2000 },
    "largest-contentful-paint": { numericValue: 3000 },
    "cumulative-layout-shift": { numericValue: 0.05 },
    "total-blocking-time": { numericValue: 250 },
  },
});

describe("Lighthouse budgets", () => {
  it("accepts a report that meets every category and numeric budget", () => {
    expect(lighthouseBudgetFailures(passingReport())).toEqual([]);
    expect(assertLighthouseBudgets(passingReport())).toEqual({
      performance: 0.8,
      accessibility: 1,
      bestPractices: 0.95,
      seo: 1,
    });
  });

  it("reports low, missing, and null category scores", () => {
    const report = passingReport();
    report.categories.performance = { score: 0.5 };
    report.categories.accessibility = undefined;
    report.categories.seo = { score: null };
    expect(lighthouseBudgetFailures(report)).toEqual(expect.arrayContaining([
      "performance score 0.5 is below 0.75",
      "accessibility score missing is below 0.95",
      "seo score missing is below 0.9",
    ]));
  });

  it("reports slow, missing, and null numeric audits and throws the complete summary", () => {
    const report = passingReport();
    report.audits["first-contentful-paint"] = { numericValue: 3000 };
    report.audits["largest-contentful-paint"] = undefined;
    report.audits["cumulative-layout-shift"] = { numericValue: null };
    const failures = lighthouseBudgetFailures(report);
    expect(failures).toEqual(expect.arrayContaining([
      "first-contentful-paint 3000 exceeds 2500",
      "largest-contentful-paint missing exceeds 3500",
      "cumulative-layout-shift missing exceeds 0.1",
    ]));
    expect(() => assertLighthouseBudgets(report)).toThrow(`Lighthouse budgets failed:\n- ${failures.join("\n- ")}`);
  });

  it("requires a strict majority of Lighthouse samples to meet every budget", () => {
    const slowReport = passingReport();
    slowReport.audits["total-blocking-time"] = { numericValue: 700 };
    expect(assertLighthouseQuorum([passingReport(), slowReport, passingReport()])).toEqual({
      passing: 2,
      required: 2,
      total: 3,
    });
    expect(() => assertLighthouseQuorum([slowReport, passingReport(), slowReport]))
      .toThrow("Lighthouse budgets passed in 1/3 runs; 2 required.");
    expect(() => assertLighthouseQuorum([])).toThrow("Lighthouse quorum requires at least one report.");
  });
});
