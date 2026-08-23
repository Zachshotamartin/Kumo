import { expect, test } from "@playwright/test";

test.describe("editor regression workflows", () => {
  test.skip(({ isMobile }) => Boolean(isMobile), "Precise pointer workflows run in the desktop project.");

  test.beforeEach(async ({ page }) => {
    await page.goto("/e2e.html");
    await expect(page.getByTestId("editor-regression-lab")).toBeVisible();
  });

  test("selects, edits, and styles text without losing native highlighting", async ({ page }) => {
    await page.getByText("Select part of this text", { exact: true }).dblclick();

    const editor = page.getByRole("textbox", { name: "Edit text" });
    await expect(editor).toBeVisible();
    await expect(editor).toBeFocused();
    await expect(editor).toHaveCSS("user-select", "text");
    await expect(editor).toHaveValue("Select part of this text");

    const editorBox = await editor.boundingBox();
    expect(editorBox).not.toBeNull();
    const shapePosition = await page.locator('[data-shape-id="e2e-text"]').getAttribute("style");
    await editor.press("ArrowLeft");
    await page.mouse.move(editorBox!.x + 12, editorBox!.y + editorBox!.height / 2);
    await page.mouse.down();
    await page.mouse.move(editorBox!.x + 150, editorBox!.y + editorBox!.height / 2, { steps: 8 });
    await page.mouse.up();
    await expect.poll(() => editor.evaluate((element: HTMLTextAreaElement) =>
      element.selectionEnd - element.selectionStart
    )).toBeGreaterThan(0);
    await expect(page.locator('[data-shape-id="e2e-text"]')).toHaveAttribute("style", shapePosition!);

    await editor.evaluate((element: HTMLTextAreaElement) => element.setSelectionRange(7, 11));
    await expect.poll(() => editor.evaluate((element: HTMLTextAreaElement) => ({
      start: element.selectionStart,
      end: element.selectionEnd,
    }))).toEqual({ start: 7, end: 11 });
    await page.keyboard.type("a section");
    await expect(editor).toHaveValue("Select a section of this text");

    await page.getByLabel("Font weight").selectOption("bold");
    await page.getByRole("button", { name: "Align text to bottom" }).click();
    await page.getByRole("button", { name: "Underline text" }).click();
    const renderedText = page.locator('[data-shape-id="e2e-text"] > div');
    await expect(renderedText).toHaveCSS("font-weight", "700");
    await expect(renderedText).toHaveCSS("text-decoration-line", "underline");
    await expect(renderedText).toHaveCSS("align-items", "flex-end");
    await expect(page.getByText("Select a section of this text", { exact: true })).toBeVisible();
  });

  test("draws a text box and opens it for typing immediately", async ({ page }) => {
    const canvas = page.getByRole("application", { name: "Kumo design canvas" });
    await page.getByRole("button", { name: "Text tool (T)" }).click();
    await canvas.click({ position: { x: 70, y: 300 } });

    const editor = page.getByRole("textbox", { name: "Edit text" });
    await expect(editor).toBeVisible();
    await expect(editor).toHaveValue("Type something");
    await editor.fill("A new linked thought");
    await editor.press("Escape");

    await expect(page.getByText("A new linked thought", { exact: true })).toBeVisible();
    await expect(page.locator("[data-shape-id]")).toHaveCount(3);
    await expect(page.getByRole("button", { name: "Text tool (T)" })).toHaveAttribute("aria-pressed", "false");
  });

  test("flips from a crossed resize handle and preserves undo and redo", async ({ page }) => {
    await page.getByRole("button", { name: "Ochre card", exact: true }).click();
    const handle = page.getByRole("button", { name: "Resize from bottom right" });
    const box = await handle.boundingBox();
    expect(box).not.toBeNull();

    await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
    await page.mouse.down();
    await page.mouse.move(box!.x - 210, box!.y - 160, { steps: 8 });
    await expect(page.getByRole("group", { name: "Selection transform controls" }))
      .toHaveAttribute("style", /scaleX\(-1\) scaleY\(-1\)/);
    await page.mouse.up();

    const rectangle = page.locator('[data-shape-id="e2e-rectangle"]');
    await expect(rectangle).toHaveAttribute("data-flip-x", "true");
    await expect(rectangle).toHaveAttribute("data-flip-y", "true");
    await expect(page.getByRole("button", { name: "Undo" })).toBeEnabled();
    await page.getByRole("button", { name: "Undo" }).click();
    await expect(rectangle).toHaveAttribute("data-flip-x", "false");
    await page.getByRole("button", { name: "Redo" }).click();
    await expect(rectangle).toHaveAttribute("data-flip-x", "true");
  });

  test("groups, copies, pastes, and reorders a multi-selection", async ({ page }) => {
    await page.getByRole("button", { name: "Product note", exact: true }).click();
    await page.getByRole("button", { name: "Ochre card", exact: true }).click({ modifiers: ["Shift"] });
    await page.keyboard.press("ControlOrMeta+g");

    const originalText = page.locator('[data-shape-id="e2e-text"]');
    const originalRectangle = page.locator('[data-shape-id="e2e-rectangle"]');
    const textGroup = await originalText.getAttribute("data-group-id");
    expect(textGroup).toBeTruthy();
    await expect(originalRectangle).toHaveAttribute("data-group-id", textGroup!);

    await page.keyboard.press("ControlOrMeta+c");
    await page.keyboard.press("ControlOrMeta+v");
    await expect(page.locator("[data-shape-id]")).toHaveCount(4);

    const selectedBefore = await page.locator("[data-shape-id]").evaluateAll((elements) =>
      elements.map((element) => Number(element.getAttribute("data-z-index")))
    );
    await page.keyboard.press("]");
    const selectedAfter = await page.locator("[data-shape-id]").evaluateAll((elements) =>
      elements.map((element) => Number(element.getAttribute("data-z-index")))
    );
    expect(Math.max(...selectedAfter)).toBeGreaterThanOrEqual(Math.max(...selectedBefore));

    await page.getByRole("button", { name: "Undo" }).click();
    await expect(page.locator("[data-shape-id]")).toHaveCount(2);
    await page.getByRole("button", { name: "Redo" }).click();
    await expect(page.locator("[data-shape-id]")).toHaveCount(4);
  });

  test("captures pinch-style zoom inside the canvas instead of scaling the page", async ({ page }) => {
    const canvas = page.getByRole("application", { name: "Kumo design canvas" });
    const rectangle = page.locator('[data-shape-id="e2e-rectangle"]');
    const shapeBefore = await rectangle.boundingBox();
    expect(shapeBefore).not.toBeNull();
    const before = await page.evaluate(() => window.devicePixelRatio);
    await canvas.hover({ position: { x: 400, y: 300 } });
    await page.keyboard.down("Control");
    await page.mouse.wheel(0, -120);
    await page.keyboard.up("Control");

    await expect.poll(async () => (await rectangle.boundingBox())?.width ?? 0)
      .toBeGreaterThan(shapeBefore!.width);
    expect(await page.evaluate(() => window.devicePixelRatio)).toBe(before);
    expect(await page.evaluate(() => document.documentElement.style.zoom)).toBe("");
  });
});
