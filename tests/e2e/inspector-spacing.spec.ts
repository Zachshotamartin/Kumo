import { expect, test, type Locator } from "@playwright/test";

// Check the painted field boxes, including off-screen rows in the scrollable
// inspector. Segmented icon controls intentionally share an enclosing surface.
async function expectSeparatedFields(panel: Locator) {
  const collisions = await panel.evaluate((root) => {
    const selector = '[class*="fullField"], [class*="colorField"], [class*="field_"] , button';
    const elements = [...root.querySelectorAll<HTMLElement>(selector)].filter((element) =>
      !element.closest('[class*="panelHeading"], [class*="segmented"]') &&
      element.getBoundingClientRect().width > 0);
    const failures: string[] = [];
    for (let i = 0; i < elements.length; i++) {
      const a = elements[i]!;
      const ra = a.getBoundingClientRect();
      if (ra.right > root.getBoundingClientRect().right + 1) failures.push(`Overflow: ${a.textContent}`);
      for (const b of elements.slice(i + 1)) {
        if (a.contains(b) || b.contains(a)) continue;
        const rb = b.getBoundingClientRect();
        const xGap = Math.max(ra.left, rb.left) - Math.min(ra.right, rb.right);
        const yGap = Math.max(ra.top, rb.top) - Math.min(ra.bottom, rb.bottom);
        if ((xGap < -1 && yGap < 7) || (yGap < -1 && xGap < 7)) {
          failures.push(`${a.textContent?.trim()} / ${b.textContent?.trim()} (${xGap}, ${yGap})`);
        }
      }
    }
    return failures;
  });
  expect(collisions).toEqual([]);
}

test("inspector rows and action grids stay separated with styles and multi-mode variables", async ({ page }) => {
  await page.goto("/e2e.html");
  await page.getByRole("button", { name: "Product note", exact: true }).click();
  await page.getByRole("button", { name: "Assets", exact: true }).click();
  const assets = page.getByRole("complementary", { name: "Assets" });
  const shared = assets.locator("section").filter({ has: page.getByRole("heading", { name: "Shared styles", exact: true }) });
  const name = shared.getByLabel("Name", { exact: true });
  await name.fill("FORM");
  const input = (await name.boundingBox())!;
  const fill = (await shared.getByRole("button", { name: "Fill", exact: true }).boundingBox())!;
  expect(fill.y - (input.y + input.height)).toBeGreaterThanOrEqual(8);
  await shared.getByRole("button", { name: "Text", exact: true }).click();
  await assets.getByRole("button", { name: "Add collection", exact: true }).click();
  await assets.getByRole("button", { name: "Add themed color", exact: true }).click();
  await assets.getByRole("button", { name: "Add color variable", exact: true }).click();
  await expect(assets.getByLabel("FORM themed color Dark value")).toBeVisible();
  for (const width of [220, 280, 480]) {
    await page.locator('[class*="editorGrid"]').evaluate((grid, value) => {
      (grid as HTMLElement).style.setProperty("--properties-panel-width", `${value}px`);
    }, width);
    await expectSeparatedFields(assets);
  }
  await assets.getByRole("button", { name: "Bind FORM themed color to text", exact: true }).click();
  await assets.getByLabel("Active mode").selectOption({ label: "Dark" });
  await expect(assets.getByLabel("Active mode")).toHaveValue(/.+/);
});

test("text, effects, gradients and geometry controls have independent rows", async ({ page }) => {
  await page.goto("/e2e.html");
  await page.getByRole("button", { name: "Product note", exact: true }).click();
  const panel = page.getByRole("complementary", { name: "Properties" });
  await expectSeparatedFields(panel);
  await page.getByRole("button", { name: "Ochre card", exact: true }).click();
  await panel.getByLabel("Fill type").selectOption("linear-gradient");
  await panel.getByLabel("Add effect").selectOption("drop-shadow");
  await panel.getByLabel("Add effect").selectOption("inner-shadow");
  await expectSeparatedFields(panel);
});
