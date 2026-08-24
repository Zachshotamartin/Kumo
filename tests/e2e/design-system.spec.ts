import { expect, test } from "@playwright/test";

test("editor panel headings and ruler labels share consistent alignment", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/e2e.html");
  const addPage = page.getByRole("button", { name: "Add page" });
  const icon = addPage.locator("svg");
  const [buttonBox, iconBox] = await Promise.all([addPage.boundingBox(), icon.boundingBox()]);
  expect(buttonBox).not.toBeNull();
  expect(iconBox).not.toBeNull();
  expect(Math.abs((buttonBox!.x + buttonBox!.width / 2) - (iconBox!.x + iconBox!.width / 2))).toBeLessThanOrEqual(1);
  expect(Math.abs((buttonBox!.y + buttonBox!.height / 2) - (iconBox!.y + iconBox!.height / 2))).toBeLessThanOrEqual(1);

  const horizontalLabels = page.getByRole("button", { name: /Horizontal ruler/ }).locator("b");
  const fontSizes = await horizontalLabels.evaluateAll((labels) => labels.slice(0, 5).map((label) => parseFloat(getComputedStyle(label).fontSize)));
  expect(fontSizes.every((size) => size >= 11)).toBe(true);
});

test("share dialog keeps readable type, matched controls, and dismissible modal behavior", async ({ page }) => {
  await page.route("**/api/**", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(route.request().url().includes("friends")
      ? { friends: [], incoming: [], outgoing: [], blocked: [] }
      : route.request().method() === "GET" && route.request().url().includes("share-board")
        ? { plan: { truncated: false, boards: [] } }
        : { collaborators: [] }),
  }));
  await page.goto("/share-e2e.html");
  const dialog = page.getByRole("dialog", { name: "Share “Product map”" });
  await expect(dialog).toBeVisible();

  const importantText = dialog.locator("h2, h3, label, button, p, small, strong");
  const sizes = await importantText.evaluateAll((elements) => elements
    .filter((element) => getComputedStyle(element).display !== "none")
    .map((element) => parseFloat(getComputedStyle(element).fontSize)));
  expect(Math.min(...sizes)).toBeGreaterThanOrEqual(11);

  const email = page.getByPlaceholder("collaborator@example.com");
  const role = page.getByLabel("Role", { exact: true });
  const share = page.getByRole("button", { name: "Share", exact: true });
  const heights = await Promise.all([email, role, share].map(async (control) => (await control.boundingBox())!.height));
  expect(Math.max(...heights) - Math.min(...heights)).toBeLessThanOrEqual(1);

  await page.mouse.click(5, 5);
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Reopen sharing" })).toBeVisible();
});
