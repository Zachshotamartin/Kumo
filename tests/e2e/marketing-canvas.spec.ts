import { expect, test } from "@playwright/test";

test("landing mini canvas draws below editable modeled copy and resets cleanly", async ({ page }) => {
  await page.goto("/");

  const surface = page.getByRole("button", { name: /Kumo sketch canvas/i });
  const drawingLayer = page.locator("[data-layer='drawings']");
  const objectLayer = page.locator("[data-layer='marketing-objects']");
  const headlineObject = page.locator("[data-shape-id='marketing-headline']");
  await expect(page.getByRole("toolbar", { name: "Landing canvas tools" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Reset canvas" }).locator("svg")).toBeVisible();
  await expect(page.locator("[data-model-type='text']")).toHaveCount(9);
  await expect(headlineObject).toHaveAttribute("data-model-type", "text");
  await expect.poll(async () => ({
    drawings: Number(await drawingLayer.evaluate((element) => getComputedStyle(element).zIndex)),
    objects: Number(await objectLayer.evaluate((element) => getComputedStyle(element).zIndex)),
  })).toEqual({ drawings: 1, objects: 3 });

  await page.getByRole("button", { name: "Rectangle (R)" }).click();
  const surfaceBox = await surface.boundingBox();
  expect(surfaceBox).not.toBeNull();
  if (!surfaceBox) return;
  await page.mouse.move(surfaceBox.x + surfaceBox.width * 0.34, surfaceBox.y + surfaceBox.height * 0.32);
  await page.mouse.down();
  await page.mouse.move(surfaceBox.x + surfaceBox.width * 0.49, surfaceBox.y + surfaceBox.height * 0.48, { steps: 5 });
  await page.mouse.up();
  await expect(page.locator("[data-shape-type='rectangle']")).toHaveCount(1);

  await page.getByRole("button", { name: "Pen (P)" }).click();
  for (const [startY, endY] of [[0.30, 0.20], [0.20, 0.30]]) {
    await page.mouse.move(surfaceBox.x + surfaceBox.width * 0.35, surfaceBox.y + surfaceBox.height * startY);
    await page.mouse.down();
    await page.mouse.move(
      surfaceBox.x + surfaceBox.width * 0.45,
      surfaceBox.y + surfaceBox.height * endY,
      { steps: 4 }
    );
    await page.mouse.up();
  }
  const vectorPaths = page.locator("[data-shape-type='vector'] path");
  await expect(vectorPaths).toHaveCount(2);
  const slopes = await vectorPaths.evaluateAll((paths) => paths.map((path) => {
    const coordinates = (path.getAttribute("d")?.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);
    return (coordinates[3]! - coordinates[1]!) / (coordinates[2]! - coordinates[0]!);
  }));
  expect(slopes[0]).toBeLessThan(0);
  expect(slopes[1]).toBeGreaterThan(0);

  await page.getByRole("button", { name: "Select (V)" }).click();
  const initialX = Number(await headlineObject.getAttribute("data-shape-x"));
  const headlineBox = await headlineObject.boundingBox();
  expect(headlineBox).not.toBeNull();
  if (!headlineBox) return;
  await page.mouse.move(headlineBox.x + 20, headlineBox.y + 20);
  await page.mouse.down();
  await page.mouse.move(headlineBox.x + 60, headlineBox.y + 42, { steps: 4 });
  await page.mouse.up();
  const selectionHighlight = headlineObject.locator("[data-selection-highlight='true']");
  await expect(selectionHighlight).toBeVisible();
  await expect.poll(() => selectionHighlight.evaluate((element) => getComputedStyle(element).borderStyle))
    .toBe("solid");
  await expect.poll(async () => Number(await headlineObject.getAttribute("data-shape-x")))
    .toBeGreaterThan(initialX);

  await headlineObject.focus();
  await headlineObject.press("Enter");
  const textEditor = headlineObject.getByRole("textbox", { name: "Edit text" });
  await expect.poll(() => textEditor.evaluate((element) => {
    const editor = element as HTMLTextAreaElement;
    return {
      start: editor.selectionStart,
      allSelected: editor.selectionEnd === editor.value.length,
    };
  })).toEqual({ start: 0, allSelected: true });
  await textEditor.fill("Move ideas into view.");
  await textEditor.blur();
  await expect(page.getByRole("heading", { name: "Move ideas into view." })).toBeVisible();

  await page.getByRole("button", { name: "Reset canvas" }).click();
  await expect(page.locator("[data-shape-type='rectangle']")).toHaveCount(0);
  await expect(page.locator("[data-shape-type='vector']")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Every board can lead somewhere." })).toBeVisible();
  await expect(page.locator("[data-shape-id='marketing-headline']")).toHaveAttribute("data-shape-x", "60");
});
