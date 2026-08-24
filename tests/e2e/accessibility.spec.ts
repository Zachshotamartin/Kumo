import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { installSocialApiFixture } from "./socialFixture";

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

test("friends and profile dashboard has no serious automated accessibility violations", async ({ page }) => {
  await installSocialApiFixture(page);
  await page.goto("/social-e2e.html");
  await page.getByRole("button", { name: "Friends" }).click();
  await expect(page.getByRole("heading", { name: "People in your orbit." })).toBeVisible();
  const friendsResults = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  expect(seriousViolations(friendsResults.violations)).toEqual([]);

  await page.getByRole("button", { name: "Open your profile" }).click();
  await expect(page.getByRole("heading", { name: "Profile settings" })).toBeVisible();
  const profileResults = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  expect(seriousViolations(profileResults.violations)).toEqual([]);
});
