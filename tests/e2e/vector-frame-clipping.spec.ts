import { expect, test } from "@playwright/test";

test("a thick pen stroke inside a frame keeps its width and round caps", async ({ page }) => {
  await page.goto("/e2e.html");
  const canvas = page.getByRole("application", { name: "Kumo design canvas" });
  const box = (await canvas.boundingBox())!;
  const drag = async (x: number, y: number, x2: number, y2: number) => {
    await page.mouse.move(box.x + x, box.y + y);
    await page.mouse.down();
    await page.mouse.move(box.x + x2, box.y + y2, { steps: 5 });
    await page.mouse.up();
  };
  await page.getByRole("button", { name: "Frame tool (F)" }).click();
  await drag(300, 280, 580, 500);
  await page.getByRole("button", { name: "Pen tool (P)" }).click();
  await drag(340, 350, 530, 350);
  const panel = page.getByRole("complementary", { name: "Properties" });
  await panel.getByRole("spinbutton", { name: "Stroke", exact: true }).fill("7");
  await panel.getByRole("spinbutton", { name: "Stroke", exact: true }).press("Enter");
  await panel.getByRole("combobox", { name: "Cap", exact: true }).selectOption({ label: "Round" });
  const vector = page.locator('[data-shape-type="vector"]');
  await expect(vector).toHaveAttribute("data-parent-id", /.+/);
  await expect(vector.locator('path[stroke]')).toHaveAttribute("stroke-width", "7");
  await expect(vector.locator('path[stroke]')).toHaveAttribute("stroke-linecap", "round");
  // A one-pixel geometric height must not become a one-pixel paint clip.
  const clip = await vector.evaluate(element => getComputedStyle(element).clipPath);
  expect(clip).toMatch(/^inset\(-/);
  const insets = clip.match(/-?\d+(?:\.\d+)?(?=px)/g)!.map(Number);
  expect(insets.every(value => value < -7)).toBe(true);
});
