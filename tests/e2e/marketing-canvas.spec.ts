import { expect, test, type Page } from "@playwright/test";

const rectangle = async (page: Page, x: number, y: number) => {
  await page.getByRole("button", { name: "Rectangle (R)" }).click();
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 100, y + 70, { steps: 5 });
  await page.mouse.up();
};
const drag = async (page: Page, from: { x: number; y: number }, to: { x: number; y: number }) => {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 8 });
  await page.mouse.up();
};

test("landing canvas uses production resize, marquee, grouping, clipboard, and history", async ({ page }) => {
  await page.goto("/");
  const canvas = page.getByRole("application", { name: "Kumo design canvas" });
  const shapes = page.locator("[data-shape-type='rectangle']");
  await expect(canvas).toBeVisible();
  const bounds = (await canvas.boundingBox())!;
  const x = bounds.x + 140, y = bounds.y + 150;
  await rectangle(page, x, y);
  await expect(shapes).toHaveCount(1);
  const original = (await shapes.first().boundingBox())!;
  const corner = (await page.getByRole("button", { name: "Resize from bottom right", exact: true }).boundingBox())!;
  await drag(page, { x: corner.x + corner.width / 2, y: corner.y + corner.height / 2 }, { x: corner.x + corner.width / 2 + 55, y: corner.y + corner.height / 2 + 35 });
  await expect.poll(async () => (await shapes.first().boundingBox())!.width).toBeGreaterThan(original.width + 45);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect.poll(async () => (await shapes.first().boundingBox())!.width).toBeCloseTo(original.width, 0);
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await expect.poll(async () => (await shapes.first().boundingBox())!.width).toBeGreaterThan(original.width + 45);
  await rectangle(page, x + 220, y + 15);
  await page.getByRole("button", { name: "Select (V)" }).click();
  await drag(page, { x: x - 20, y: y - 20 }, { x: x + 335, y: y + 125 });
  await canvas.press("ControlOrMeta+g");
  const groupIds = await shapes.evaluateAll((items) => items.map((item) => item.getAttribute("data-group-id")));
  expect(groupIds[0]).toBeTruthy();
  expect(groupIds[1]).toBe(groupIds[0]);
  await canvas.press("ControlOrMeta+c");
  await canvas.press("ControlOrMeta+v");
  await expect(shapes).toHaveCount(4);
  await canvas.press("Delete");
  await expect(shapes).toHaveCount(2);
  await canvas.press("ControlOrMeta+z");
  await expect(shapes).toHaveCount(4);
  await page.getByRole("button", { name: "Reset canvas" }).click();
  await expect(shapes).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Undo", exact: true })).toBeDisabled();
});

test("landing copy uses the editor's text editing and shortcuts stay out of the login form", async ({ page }) => {
  await page.goto("/");
  const canvas = page.getByRole("application", { name: "Kumo design canvas" });
  const headline = page.getByRole("heading", { level: 1, name: "Every board can lead somewhere." });
  const bounds = (await headline.boundingBox())!;
  await page.mouse.dblclick(bounds.x + 35, bounds.y + 20);
  const text = canvas.getByRole("textbox", { name: "Edit text" });
  await expect(text).toBeFocused();
  await text.fill("Move ideas into view.");
  await text.press("Escape");
  await expect(page.getByRole("heading", { name: "Move ideas into view." })).toBeVisible();
  await page.getByLabel("Email", { exact: true }).fill("test@example.com");
  await page.getByLabel("Email", { exact: true }).press("ControlOrMeta+a");
  await page.getByLabel("Email", { exact: true }).press("Backspace");
  await expect(page.getByRole("heading", { name: "Move ideas into view." })).toBeVisible();
  await page.getByRole("button", { name: "Reset canvas" }).click();
  await expect(page.getByRole("heading", { name: "Every board can lead somewhere." })).toBeVisible();
  // The decoration is behind the entire isolated canvas, including the mascot.
  const layers = await page.getByLabel("Animated Kumo mascot").evaluate((mascot) => {
    const canvasRoot = mascot.closest('[class*="marketingCanvas"]')!;
    return { canvas: Number(getComputedStyle(canvasRoot).zIndex), decoration: Number(getComputedStyle(canvasRoot.parentElement!, "::after").zIndex) };
  });
  expect(layers.canvas).toBeGreaterThan(layers.decoration);
});
