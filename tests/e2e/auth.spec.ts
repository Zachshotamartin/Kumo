import { expect, test } from "@playwright/test";

test("authentication screen is usable", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /every board can lead somewhere/i })).toBeVisible();
  await expect(page.getByLabel("Animated Kumo mascot")).toBeVisible();
  await expect(page.getByLabel("Animated Kumo mascot")).toHaveCount(1);
  await expect(page.getByText("Kumo", { exact: true })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Sign in" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByLabel("Email")).toBeVisible();
  await expect(page.getByLabel("Password")).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
  await page.getByRole("tab", { name: "Create account" }).click();
  await expect(page.getByRole("heading", { name: "Start with a blank canvas" })).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    )
  ).toBe(0);
});
