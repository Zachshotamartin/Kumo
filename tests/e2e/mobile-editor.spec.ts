import { expect, test } from "@playwright/test";

test.describe("mobile editor workflows", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/e2e.html");
    await expect(page.getByTestId("editor-regression-lab")).toBeVisible();
  });

  test("selects an object by touch without overflowing the application shell", async ({ page }) => {
    const rectangle = page.locator('[data-shape-id="e2e-text"]');
    const canvas = page.getByRole("application", { name: "Kumo design canvas" });
    const box = await rectangle.boundingBox();
    const canvasBox = await canvas.boundingBox();
    expect(box).not.toBeNull();
    expect(canvasBox).not.toBeNull();
    expect(canvasBox!.width).toBeGreaterThan(300);
    expect(canvasBox!.height).toBeGreaterThan(600);
    await canvas.tap({ position: {
      x: box!.x + box!.width / 2 - canvasBox!.x,
      y: box!.y + box!.height / 2 - canvasBox!.y,
    } });
    await expect(page.getByRole("group", { name: "Selection transform controls" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      await page.evaluate(() => document.documentElement.clientWidth)
    );
  });

  test("pinches the canvas instead of zooming the browser page", async ({ page }) => {
    const canvas = page.getByRole("application", { name: "Kumo design canvas" });
    const canvasBox = await canvas.boundingBox();
    const rectangle = page.locator('[data-shape-id="e2e-rectangle"]');
    const before = await rectangle.boundingBox();
    expect(canvasBox).not.toBeNull();
    expect(before).not.toBeNull();
    const centerX = canvasBox!.x + canvasBox!.width / 2;
    const centerY = canvasBox!.y + canvasBox!.height / 2;
    await canvas.dispatchEvent("pointerdown", { pointerId: 1, pointerType: "touch", isPrimary: true, clientX: centerX - 40, clientY: centerY });
    await canvas.dispatchEvent("pointerdown", { pointerId: 2, pointerType: "touch", isPrimary: false, clientX: centerX + 40, clientY: centerY });
    await canvas.dispatchEvent("pointermove", { pointerId: 2, pointerType: "touch", isPrimary: false, clientX: centerX + 140, clientY: centerY });
    await expect.poll(async () => (await rectangle.boundingBox())?.width ?? 0).toBeGreaterThan(before!.width * 1.8);
    await canvas.dispatchEvent("pointerup", { pointerId: 2, pointerType: "touch", isPrimary: false, clientX: centerX + 140, clientY: centerY });
    await canvas.dispatchEvent("pointerup", { pointerId: 1, pointerType: "touch", isPrimary: true, clientX: centerX - 40, clientY: centerY });
    expect(await page.evaluate(() => document.documentElement.style.zoom)).toBe("");
  });
});
