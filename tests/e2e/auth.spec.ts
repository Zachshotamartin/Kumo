import { expect, test } from "@playwright/test";

test("authentication screen is usable", async ({ page }) => {
  await page.addInitScript(() => {
    const trackedWindow = window as Window & { __kumoAnimationStarts: number };
    trackedWindow.__kumoAnimationStarts = 0;
    document.addEventListener("kumo-animation-start", () => {
      trackedWindow.__kumoAnimationStarts += 1;
    });
  });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /every board can lead somewhere/i })).toBeVisible();
  await expect(page.getByLabel("Animated Kumo mascot")).toBeVisible();
  await expect(page.getByLabel("Animated Kumo mascot")).toHaveCount(1);
  await expect.poll(() => page.getByLabel("Animated Kumo mascot").evaluate((element) => {
    const logo = element as HTMLElement & {
      getConfig: () => { design: { legStyle: string; legs: unknown[] }; motion: { amount: number } };
    };
    const config = logo.getConfig();
    return {
      legStyle: config.design.legStyle,
      legCount: config.design.legs.length,
      motion: config.motion.amount,
    };
  })).toEqual({ legStyle: "paddle", legCount: 4, motion: 1 });
  await expect(page.getByText("Kumo", { exact: true })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Sign in" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByLabel("Email")).toBeVisible();
  await expect(page.getByLabel("Password", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
  await page.getByRole("tab", { name: "Create account" }).click();
  await expect(page.getByRole("heading", { name: "Start with a blank canvas" })).toBeVisible();
  await expect.poll(() => page.evaluate(() =>
    (window as Window & { __kumoAnimationStarts: number }).__kumoAnimationStarts
  )).toBe(1);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    )
  ).toBe(0);
});
