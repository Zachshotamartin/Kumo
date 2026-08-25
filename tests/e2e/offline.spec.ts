import { expect, test } from "@playwright/test";

test("the application shell reloads after the network goes offline", async ({ page, context, browserName }) => {
  test.skip(browserName !== "chromium", "Offline service-worker behavior is verified in Chromium.");
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /every board can lead somewhere/i })).toBeVisible();
  await page.evaluate(async () => {
    await navigator.serviceWorker.register("/sw.js", { scope: "/" });
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await expect(page.getByRole("heading", { name: /every board can lead somewhere/i })).toBeVisible();
  await context.setOffline(true);
  try {
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: /every board can lead somewhere/i })).toBeVisible();
    await expect(page.getByLabel("Email")).toBeVisible();
  } finally {
    await context.setOffline(false);
  }
});
