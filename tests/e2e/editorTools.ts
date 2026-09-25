import type { Page } from "@playwright/test";

/**
 * Picks a canvas tool the way a person would: from the toolbar, or from "More tools" when the
 * canvas is too narrow to show it. `name` is the tool's accessible name, e.g. "Text tool (T)".
 */
export const chooseTool = async (page: Page, name: string) => {
  const button = page.getByRole("button", { name, exact: true });
  if (await button.isVisible()) return button.click();
  await page.getByRole("button", { name: /^More tools/ }).click();
  await page.getByRole("menuitemradio", { name, exact: true }).click();
};
