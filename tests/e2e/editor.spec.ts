import { expect, test } from "@playwright/test";

test.describe("editor regression workflows", () => {
  test.describe.configure({ mode: "serial" });
  test.beforeEach(async ({ page }) => {
    await page.goto("/e2e.html");
    await expect(page.getByTestId("editor-regression-lab")).toBeVisible();
  });

  test("selects, edits, and styles text without losing native highlighting", async ({ page }) => {
    await page.getByText("Select part of this text", { exact: true }).dblclick();

    const editor = page.getByRole("textbox", { name: "Edit text" });
    await expect(editor).toBeVisible();
    await expect(editor).toBeFocused();
    expect(await editor.evaluate((element) => {
      const computed = getComputedStyle(element);
      return computed.userSelect || computed.getPropertyValue("-webkit-user-select");
    })).toBe("text");
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

  test("applies inspector geometry and colors immediately while the input stays focused", async ({ page }) => {
    await page.getByRole("button", { name: "Ochre card", exact: true }).click();
    const rectangle = page.locator('[data-shape-id="e2e-rectangle"]');
    const before = await rectangle.boundingBox();
    expect(before).not.toBeNull();

    const x = page.getByRole("spinbutton", { name: "X", exact: true });
    await x.fill("260");
    await expect(x).toBeFocused();
    await expect.poll(async () => (await rectangle.boundingBox())?.x ?? 0).not.toBe(before!.x);

    const fill = page.getByRole("textbox", { name: "Fill hex value", exact: true });
    await fill.fill("#123456");
    await expect(fill).toBeFocused();
    await expect(rectangle).toHaveCSS("background-color", "rgb(18, 52, 86)");
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

  test("groups, copies, pastes, reorders, and ungroups through the visible layer stack", async ({ page }) => {
    await page.getByRole("button", { name: "Product note", exact: true }).click();
    await page.getByRole("button", { name: "Ochre card", exact: true }).click({ modifiers: ["Shift"] });
    await page.keyboard.press("ControlOrMeta+g");

    const originalText = page.locator('[data-shape-id="e2e-text"]');
    const originalRectangle = page.locator('[data-shape-id="e2e-rectangle"]');
    const textGroup = await originalText.getAttribute("data-group-id");
    expect(textGroup).toBeTruthy();
    await expect(originalRectangle).toHaveAttribute("data-group-id", textGroup!);
    await expect(page.getByRole("button", { name: "Group, 2 layers", exact: true })).toHaveCount(1);
    await expect(page.getByRole("group", { name: "Group, 2 layers members" })).toBeVisible();

    await page.getByRole("button", { name: "Collapse Group, 2 layers" }).click();
    await expect(page.getByRole("button", { name: "Product note", exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: "Expand Group, 2 layers" }).click();

    await page.keyboard.press("ControlOrMeta+c");
    await page.keyboard.press("ControlOrMeta+v");
    await expect(page.locator("[data-shape-id]")).toHaveCount(4);
    await expect(page.getByRole("button", { name: "Group, 2 layers", exact: true })).toHaveCount(2);

    const groupsBefore = await page.locator("[data-shape-id]").evaluateAll((elements) =>
      elements.reduce<Record<string, number[]>>((groups, element) => {
        const group = element.getAttribute("data-group-id") ?? "none";
        (groups[group] ??= []).push(Number(element.getAttribute("data-z-index")));
        return groups;
      }, {})
    );
    const pastedGroup = Object.keys(groupsBefore).find((group) => group !== textGroup)!;
    expect(Math.min(...groupsBefore[pastedGroup]!)).toBeGreaterThan(Math.max(...groupsBefore[textGroup!]!));

    await page.getByRole("button", { name: "Move Group, 2 layers backward" }).first().click();
    const groupsAfter = await page.locator("[data-shape-id]").evaluateAll((elements) =>
      elements.reduce<Record<string, number[]>>((groups, element) => {
        const group = element.getAttribute("data-group-id") ?? "none";
        (groups[group] ??= []).push(Number(element.getAttribute("data-z-index")));
        return groups;
      }, {})
    );
    expect(Math.max(...groupsAfter[pastedGroup]!)).toBeLessThan(Math.min(...groupsAfter[textGroup!]!));

    await page.getByRole("button", { name: "Ungroup" }).click();
    await expect(page.getByRole("button", { name: "Group, 2 layers", exact: true })).toHaveCount(1);
    await expect(page.locator(`[data-group-id="${pastedGroup}"]`)).toHaveCount(0);

    await page.getByRole("button", { name: "Undo" }).click();
    await expect(page.getByRole("button", { name: "Group, 2 layers", exact: true })).toHaveCount(2);
    await page.getByRole("button", { name: "Redo" }).click();
    await expect(page.getByRole("button", { name: "Group, 2 layers", exact: true })).toHaveCount(1);
  });

  test("names, hides, shows, and locks a group as one layer", async ({ page }) => {
    await page.getByRole("button", { name: "Product note", exact: true }).click();
    await page.getByRole("button", { name: "Ochre card", exact: true }).click({ modifiers: ["Shift"] });
    await page.keyboard.press("ControlOrMeta+g");

    await page.getByRole("button", { name: "Group, 2 layers", exact: true }).dblclick();
    const rename = page.getByRole("textbox", { name: "Rename Group, 2 layers" });
    await rename.fill("Navigation");
    await rename.press("Enter");
    await expect(page.getByRole("button", { name: "Navigation, 2 layers", exact: true })).toBeVisible();

    await page.getByRole("button", { name: "Hide Navigation, 2 layers" }).click();
    await expect(page.locator("[data-shape-id]")).toHaveCount(0);
    await page.getByRole("button", { name: "Show Navigation, 2 layers" }).click();
    await expect(page.locator("[data-shape-id]")).toHaveCount(2);
    await page.getByRole("button", { name: "Lock Navigation, 2 layers" }).click();
    await expect(page.getByRole("button", { name: "Unlock Navigation, 2 layers" })).toBeVisible();
  });

  test("drag-reorders layers at an exact position in the stack", async ({ page }) => {
    const rectangle = page.locator('[data-shape-id="e2e-rectangle"]');
    const text = page.locator('[data-shape-id="e2e-text"]');
    expect(Number(await rectangle.getAttribute("data-z-index")))
      .toBeGreaterThan(Number(await text.getAttribute("data-z-index")));

    const source = page.getByRole("button", { name: "Ochre card", exact: true });
    const target = page.getByRole("listitem").filter({
      has: page.getByRole("button", { name: "Product note", exact: true }),
    });
    const targetBox = await target.boundingBox();
    expect(targetBox).not.toBeNull();
    await source.dragTo(target, {
      targetPosition: { x: targetBox!.width / 2, y: targetBox!.height - 2 },
    });

    expect(Number(await rectangle.getAttribute("data-z-index")))
      .toBeLessThan(Number(await text.getAttribute("data-z-index")));
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
      .toBeGreaterThan(shapeBefore!.width * 1.4);
    const zoomedWidth = (await rectangle.boundingBox())!.width;
    await page.keyboard.down("Control");
    await page.mouse.wheel(0, 120);
    await page.keyboard.up("Control");
    await expect.poll(async () => (await rectangle.boundingBox())?.width ?? 0)
      .toBeLessThan(zoomedWidth * 0.75);

    expect(await page.evaluate(() => window.devicePixelRatio)).toBe(before);
    expect(await page.evaluate(() => document.documentElement.style.zoom)).toBe("");
  });

  test("creates frames with parent-first selection, deep selection, copy/paste, and inherited locking", async ({ page }) => {
    const canvas = page.getByRole("application", { name: "Kumo design canvas" });
    const canvasBox = await canvas.boundingBox();
    expect(canvasBox).not.toBeNull();

    await page.getByRole("button", { name: "Frame tool (F)" }).click();
    await page.mouse.move(canvasBox!.x + 80, canvasBox!.y + 80);
    await page.mouse.down();
    await page.mouse.move(canvasBox!.x + 650, canvasBox!.y + 240, { steps: 8 });
    await page.mouse.up();

    const frame = page.locator('[data-shape-type="frame"]');
    await expect(frame).toHaveCount(1);
    const frameId = await frame.getAttribute("data-shape-id");
    expect(frameId).toBeTruthy();
    await expect(page.locator('[data-shape-id="e2e-text"]')).toHaveAttribute("data-parent-id", frameId!);
    await expect(page.locator('[data-shape-id="e2e-rectangle"]')).toHaveAttribute("data-parent-id", frameId!);

    await canvas.click({ position: { x: 120, y: 140 } });
    await expect(page.getByRole("button", { name: "Frame", exact: true })).toHaveAttribute("aria-pressed", "true");
    await canvas.click({ position: { x: 120, y: 140 }, modifiers: ["ControlOrMeta"] });
    await expect(page.getByRole("button", { name: "Product note", exact: true })).toHaveAttribute("aria-pressed", "true");
    await page.keyboard.press("Shift+Enter");
    await expect(page.getByRole("button", { name: "Frame", exact: true })).toHaveAttribute("aria-pressed", "true");
    await page.keyboard.press("Enter");
    await expect(page.getByRole("button", { name: "Ochre card", exact: true })).toHaveAttribute("aria-pressed", "true");

    await page.getByRole("button", { name: "Frame", exact: true }).click();
    await page.keyboard.press("ControlOrMeta+c");
    await page.keyboard.press("ControlOrMeta+v");
    await expect(page.locator('[data-shape-type="frame"]')).toHaveCount(2);
    await expect(page.locator("[data-parent-id]")).toHaveCount(4);
    const pastedFrame = page.locator('[data-shape-type="frame"]').last();
    const pastedFrameId = await pastedFrame.getAttribute("data-shape-id");
    expect(pastedFrameId).not.toBe(frameId);
    await expect(page.locator(`[data-parent-id="${pastedFrameId}"]`)).toHaveCount(2);

    await page.getByRole("button", { name: "Lock Frame", exact: true }).first().click();
    const lockedFrameId = await page.locator('[data-shape-type="frame"][data-locked="true"]').first().getAttribute("data-shape-id");
    expect(lockedFrameId).toBeTruthy();
    const lockedChildren = page.locator(`[data-parent-id="${lockedFrameId}"]`);
    await expect(lockedChildren).toHaveCount(2);
    await expect(lockedChildren.first()).toHaveAttribute("data-locked", "true");
  });

  test("drag-reparents into frames, resolves z-index, and Space suppresses reparenting", async ({ page }) => {
    const canvas = page.getByRole("application", { name: "Kumo design canvas" });
    const canvasBox = await canvas.boundingBox();
    expect(canvasBox).not.toBeNull();
    await page.getByRole("button", { name: "Frame tool (F)" }).click();
    await page.mouse.move(canvasBox!.x + 20, canvasBox!.y + 280);
    await page.mouse.down();
    await page.mouse.move(canvasBox!.x + 280, canvasBox!.y + 520, { steps: 8 });
    await page.mouse.up();
    const frame = page.locator('[data-shape-type="frame"]');
    const frameId = await frame.getAttribute("data-shape-id");
    const frameZ = Number(await frame.getAttribute("data-z-index"));

    await page.mouse.move(canvasBox!.x + 520, canvasBox!.y + 160);
    await page.mouse.down();
    await page.keyboard.down("Control");
    await page.mouse.move(canvasBox!.x + 120, canvasBox!.y + 380, { steps: 8 });
    await page.mouse.up();
    await page.keyboard.up("Control");
    const rectangle = page.locator('[data-shape-id="e2e-rectangle"]');
    await expect(rectangle).toHaveAttribute("data-parent-id", frameId!);
    expect(Number(await rectangle.getAttribute("data-z-index"))).toBeGreaterThan(frameZ);

    await page.getByRole("button", { name: "Undo" }).click();
    await expect(rectangle).not.toHaveAttribute("data-parent-id", frameId!);
    await page.mouse.move(canvasBox!.x + 520, canvasBox!.y + 160);
    await page.mouse.down();
    await page.mouse.move(canvasBox!.x + 120, canvasBox!.y + 380, { steps: 8 });
    await page.keyboard.down("Space");
    await page.mouse.up();
    await page.keyboard.up("Space");
    await expect(rectangle).not.toHaveAttribute("data-parent-id", frameId!);
  });

  test("preserves the implicit first page and supports page rename, duplicate, switch, and delete", async ({ page }) => {
    await page.getByRole("button", { name: "Add page" }).click();
    const firstPage = page.getByRole("textbox", { name: "Rename Page 1" });
    const secondPage = page.getByRole("textbox", { name: "Rename Page 2" });
    await expect(firstPage).toBeVisible();
    await expect(secondPage).toBeVisible();
    await expect(page.locator("[data-shape-id]")).toHaveCount(0);

    await firstPage.focus();
    await expect(page.locator("[data-shape-id]")).toHaveCount(2);
    await firstPage.fill("Source concepts");
    await firstPage.press("Enter");
    await expect(page.getByRole("textbox", { name: "Rename Source concepts" })).toBeVisible();
    await page.getByRole("button", { name: "Duplicate Source concepts" }).click();
    await expect(page.getByRole("textbox", { name: "Rename Source concepts copy" })).toBeVisible();
    await expect(page.locator("[data-shape-id]")).toHaveCount(2);
    await page.getByRole("button", { name: "Delete Source concepts copy" }).click();
    await expect(page.getByRole("textbox", { name: "Rename Source concepts copy" })).toHaveCount(0);
  });

  test("applies auto layout immediately and keeps frame children editable in the layer tree", async ({ page }) => {
    await page.getByRole("button", { name: "Product note", exact: true }).click();
    await page.getByRole("button", { name: "Ochre card", exact: true }).click({ modifiers: ["Shift"] });
    await page.getByRole("button", { name: "Frame selection" }).click();
    const frame = page.locator('[data-shape-type="frame"]');
    const frameId = await frame.getAttribute("data-shape-id");
    expect(frameId).toBeTruthy();
    await page.getByLabel("Auto layout").selectOption("horizontal");
    const text = page.locator('[data-shape-id="e2e-text"]');
    const rectangle = page.locator('[data-shape-id="e2e-rectangle"]');
    await expect.poll(async () => {
      const left = await text.boundingBox();
      const right = await rectangle.boundingBox();
      return left && right ? Math.abs(left.y - right.y) : 999;
    }).toBeLessThan(2);
    expect((await text.boundingBox())!.x).toBeLessThan((await rectangle.boundingBox())!.x);

    await page.getByRole("button", { name: "Product note", exact: true }).dblclick();
    const rename = page.getByRole("textbox", { name: "Rename Product note" });
    await rename.fill("Auto-layout copy");
    await rename.press("Enter");
    await expect(page.getByRole("button", { name: "Auto-layout copy", exact: true })).toBeVisible();
  });

  test("draws editable vector paths and creates visible gradients and effects", async ({ page }) => {
    const canvas = page.getByRole("application", { name: "Kumo design canvas" });
    const canvasBox = await canvas.boundingBox();
    expect(canvasBox).not.toBeNull();
    await page.getByRole("button", { name: "Pen tool (P)" }).click();
    await page.mouse.move(canvasBox!.x + 120, canvasBox!.y + 320);
    await page.mouse.down();
    await page.mouse.move(canvasBox!.x + 340, canvasBox!.y + 420, { steps: 6 });
    await page.mouse.up();
    const vector = page.locator('[data-shape-type="vector"]');
    await expect(vector).toHaveCount(1);
    await expect(page.getByText("2 editable nodes.")).toBeVisible();
    const vectorBeforeMove = await vector.boundingBox();
    const nodes = page.locator("[data-vector-point-id]");
    const nodeBeforeMove = await nodes.first().boundingBox();
    expect(vectorBeforeMove).not.toBeNull();
    expect(nodeBeforeMove).not.toBeNull();
    await page.mouse.move(vectorBeforeMove!.x + vectorBeforeMove!.width / 2, vectorBeforeMove!.y + vectorBeforeMove!.height / 2);
    await page.mouse.down();
    await page.mouse.move(vectorBeforeMove!.x + vectorBeforeMove!.width / 2 + 80, vectorBeforeMove!.y + vectorBeforeMove!.height / 2 + 60, { steps: 6 });
    await page.mouse.up();
    const vectorAfterMove = await vector.boundingBox();
    const nodeAfterMove = await nodes.first().boundingBox();
    expect(vectorAfterMove!.x).toBeGreaterThan(vectorBeforeMove!.x + 70);
    expect(nodeAfterMove!.x).toBeGreaterThan(nodeBeforeMove!.x + 70);

    const resize = page.getByRole("button", { name: "Resize from bottom right" });
    const resizeBox = await resize.boundingBox();
    expect(resizeBox).not.toBeNull();
    await page.mouse.move(resizeBox!.x + resizeBox!.width / 2, resizeBox!.y + resizeBox!.height / 2);
    await page.mouse.down();
    await page.mouse.move(resizeBox!.x + resizeBox!.width / 2 + 100, resizeBox!.y + resizeBox!.height / 2 + 50, { steps: 6 });
    await page.mouse.up();
    await expect.poll(async () => (await vector.boundingBox())?.width ?? 0).toBeGreaterThan(vectorAfterMove!.width + 80);
    await page.getByRole("checkbox", { name: "Closed path" }).check();

    await page.getByRole("button", { name: "Ochre card", exact: true }).click();
    await page.getByLabel("Fill type").selectOption("linear-gradient");
    await expect(page.getByLabel("Gradient angle")).toBeVisible();
    await expect(page.locator('[data-shape-id="e2e-rectangle"]')).toHaveCSS("background-image", /linear-gradient/);
    await page.getByLabel("Add effect").selectOption("drop-shadow");
    await expect(page.locator('[data-shape-id="e2e-rectangle"]')).toHaveCSS("filter", /drop-shadow/);
  });
});
