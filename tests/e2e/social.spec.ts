import { expect, test } from "@playwright/test";
import { installSocialApiFixture } from "./socialFixture";

test("profiles, friend discovery, requests, and editing work as one dashboard flow", async ({ page }) => {
  const { friendshipActions } = await installSocialApiFixture(page);

  await page.goto("/social-e2e.html");
  await expect(page.getByRole("heading", { name: "My boards" })).toBeVisible();
  await expect(page.getByText("Product map")).toBeVisible();

  await page.getByRole("button", { name: "Friends" }).click();
  await expect(page.getByRole("heading", { name: "People in your orbit." })).toBeVisible();
  await expect(page.getByText("Taylor Chen")).toBeVisible();
  await page.getByPlaceholder("Search names or usernames").fill("sam");
  await expect(page.getByText("Sam Lee")).toBeVisible();
  await page.getByRole("button", { name: "Add friend" }).click();
  await expect.poll(() => friendshipActions).toContainEqual({ action: "request", targetUid: "sam" });

  await page.getByRole("button", { name: "Open your profile" }).click();
  await expect(page.getByRole("heading", { name: "Profile settings" })).toBeVisible();
  await page.getByLabel("Display name").fill("Avery Updated");
  await page.getByRole("button", { name: "Save profile" }).click();
  await expect(page.getByRole("status")).toContainText("Profile saved");
  await expect(page.getByRole("heading", { name: "Avery Updated" })).toBeVisible();
});
