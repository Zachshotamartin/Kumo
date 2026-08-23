import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const seriousViolations = (violations: Awaited<ReturnType<AxeBuilder["analyze"]>>["violations"]) =>
  violations.filter((violation) => violation.impact === "serious" || violation.impact === "critical");

test("authentication screen has no serious automated accessibility violations", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /every board can lead somewhere/i })).toBeVisible();
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  expect(seriousViolations(results.violations)).toEqual([]);
});

test("editor shell has no serious automated accessibility violations", async ({ page }) => {
  await page.goto("/e2e.html");
  await expect(page.getByTestId("editor-regression-lab")).toBeVisible();
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  expect(seriousViolations(results.violations)).toEqual([]);
});
