interface LighthouseCategory {
  score: number | null;
}

interface LighthouseAudit {
  numericValue?: number | null;
}

export interface LighthouseReport {
  categories: Record<string, LighthouseCategory | undefined>;
  audits: Record<string, LighthouseAudit | undefined>;
}

const categoryMinimums = {
  performance: 0.75,
  accessibility: 0.95,
  "best-practices": 0.9,
  seo: 0.9,
};
const auditMaximums = {
  "first-contentful-paint": 2500,
  "largest-contentful-paint": 3500,
  "cumulative-layout-shift": 0.1,
  "total-blocking-time": 500,
};

export const lighthouseBudgetFailures = (report: LighthouseReport) => {
  const failures: string[] = [];
  for (const [category, minimum] of Object.entries(categoryMinimums)) {
    const score = report.categories[category]?.score;
    if (typeof score !== "number" || score < minimum) failures.push(`${category} score ${score ?? "missing"} is below ${minimum}`);
  }
  for (const [audit, maximum] of Object.entries(auditMaximums)) {
    const value = report.audits[audit]?.numericValue;
    if (typeof value !== "number" || value > maximum) failures.push(`${audit} ${value ?? "missing"} exceeds ${maximum}`);
  }
  return failures;
};

export const assertLighthouseBudgets = (report: LighthouseReport) => {
  const failures = lighthouseBudgetFailures(report);
  if (failures.length) throw new Error(`Lighthouse budgets failed:\n- ${failures.join("\n- ")}`);
  return {
    performance: report.categories.performance!.score!,
    accessibility: report.categories.accessibility!.score!,
    bestPractices: report.categories["best-practices"]!.score!,
    seo: report.categories.seo!.score!,
  };
};

export const assertLighthouseQuorum = (reports: readonly LighthouseReport[]) => {
  if (!reports.length) throw new Error("Lighthouse quorum requires at least one report.");
  const passing = reports.filter((report) => lighthouseBudgetFailures(report).length === 0).length;
  const required = Math.floor(reports.length / 2) + 1;
  if (passing < required) {
    throw new Error(`Lighthouse budgets passed in ${passing}/${reports.length} runs; ${required} required.`);
  }
  return { passing, required, total: reports.length };
};
