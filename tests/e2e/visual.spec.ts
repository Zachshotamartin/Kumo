import { expect, test, type Page } from "@playwright/test";

const stabilize = async (page: Page) => {
  await page.addStyleTag({ content: `
    *, *::before, *::after { animation: none !important; caret-color: transparent !important; transition: none !important; }
  ` });
};

test.beforeEach(async ({ page }, testInfo) => {
  test.skip(!["chromium", "mobile-chromium"].includes(testInfo.project.name), "Visual baselines use Chromium rendering.");
  await page.emulateMedia({ reducedMotion: "reduce" });
});

test("landing page visual baseline", async ({ page }, testInfo) => {
  await page.goto("/");
  await stabilize(page);
  await expect(page.getByRole("heading", { name: /every board can lead somewhere/i })).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeEnabled();
  await expect(page).toHaveScreenshot(`landing-${testInfo.project.name}.png`, {
    animations: "disabled",
    fullPage: true,
    mask: [page.getByLabel("Animated Kumo mascot")],
    maxDiffPixelRatio: 0.015,
  });
});

test("editor visual baseline", async ({ page }, testInfo) => {
  await page.goto("/e2e.html");
  await stabilize(page);
  await expect(page.getByTestId("editor-regression-lab")).toBeVisible();
  await expect(page).toHaveScreenshot(`editor-${testInfo.project.name}.png`, {
    animations: "disabled",
    fullPage: true,
    maxDiffPixelRatio: 0.015,
  });
});
