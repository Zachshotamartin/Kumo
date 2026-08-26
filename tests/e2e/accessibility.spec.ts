import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { installSocialApiFixture } from "./socialFixture";

const wcagTags = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const analyze = (page: Parameters<typeof AxeBuilder>[0]["page"]) => new AxeBuilder({ page }).withTags(wcagTags).analyze();

test("authentication screen has no WCAG 2.2 A/AA violations", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /every board can lead somewhere/i })).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeEnabled();
  const results = await analyze(page);
  expect(results.violations).toEqual([]);
});

test("editor shell has no WCAG 2.2 A/AA violations", async ({ page }) => {
  await page.goto("/e2e.html");
  await expect(page.getByTestId("editor-regression-lab")).toBeVisible();
  const results = await analyze(page);
  expect(results.violations).toEqual([]);
});

test("friends and profile dashboard has no WCAG 2.2 A/AA violations", async ({ page }) => {
  await installSocialApiFixture(page);
  await page.goto("/social-e2e.html");
  await page.getByRole("button", { name: "Friends" }).click();
  await expect(page.getByRole("heading", { name: "People in your orbit." })).toBeVisible();
  const friendsResults = await analyze(page);
  expect(friendsResults.violations).toEqual([]);

  await page.getByRole("button", { name: "Open your profile" }).click();
  await expect(page.getByRole("heading", { name: "Profile settings" })).toBeVisible();
  const profileResults = await analyze(page);
  expect(profileResults.violations).toEqual([]);
});

test("authentication tabs and fields are keyboard operable with visible focus", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeEnabled();
  await page.getByRole("tab", { name: "Sign in" }).focus();
  await expect(page.getByRole("tab", { name: "Sign in" })).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("tab", { name: "Create account" })).toBeFocused();
  await expect(page.getByRole("tab", { name: "Create account" })).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("ArrowLeft");
  await expect(page.getByRole("tab", { name: "Sign in" })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByLabel("Email")).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByLabel("Password", { exact: true })).toBeFocused();
  // WebKit follows the host macOS preference for whether Tab stops on buttons,
  // so exercise the button's browser-independent focus treatment directly.
  await page.getByRole("button", { name: "Sign in", exact: true }).focus();
  await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeFocused();
  await expect(page.getByRole("button", { name: "Sign in", exact: true })).not.toHaveCSS("box-shadow", "none");
});

test("dashboard navigation and settings have no WCAG 2.2 A/AA violations", async ({ page }) => {
  await installSocialApiFixture(page);
  await page.goto("/social-e2e.html");
  await expect(page.getByRole("button", { name: "Open settings" })).toBeVisible();
  const dashboardResults = await analyze(page);
  expect(dashboardResults.violations).toEqual([]);
  await page.getByRole("button", { name: "Open settings" }).click();
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
  const settingsResults = await analyze(page);
  expect(settingsResults.violations).toEqual([]);
});
