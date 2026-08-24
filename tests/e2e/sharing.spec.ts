import { expect, test } from "@playwright/test";

test("an accepted friend can be selected in the production sharing dialog", async ({ page }) => {
  const shares: Array<Record<string, unknown>> = [];
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const json = (body: unknown) => route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(body),
    });
    if (url.pathname === "/api/collaborators") {
      return json({ collaborators: [{ id: "e2e-user", email: "avery@example.com", name: "Avery Morgan", avatar: "", role: "owner" }] });
    }
    if (url.pathname === "/api/friends") {
      return json({
        friends: [{ id: "alex", username: "alex", displayName: "Alex Rivera", bio: "", avatarUrl: null, relationship: "friend" }],
        incoming: [], outgoing: [], blocked: [],
      });
    }
    if (url.pathname === "/api/share-board" && request.method() === "GET") {
      return json({ plan: { truncated: false, boards: [{
        id: "board", title: "Product map", visibility: "private", depth: 0, ownerId: "e2e-user", manageable: true,
      }] } });
    }
    if (url.pathname === "/api/share-board" && request.method() === "POST") {
      const body = request.postDataJSON() as Record<string, unknown>;
      shares.push(body);
      return json({
        uid: "alex", email: "alex@example.com", name: "Alex Rivera", avatar: null,
        role: body.role, sharedBoards: [{ id: "board" }], unavailableBoards: [],
      });
    }
    return route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ error: "Unhandled fixture route." }) });
  });

  await page.goto("/share-e2e.html");
  await expect(page.getByRole("dialog", { name: "Share “Product map”" })).toBeVisible();
  await expect(page.getByText("Alex Rivera")).toBeVisible();
  await page.getByLabel("Friend sharing role").selectOption("viewer");
  await page.getByRole("button", { name: "Share as viewer" }).click();
  await expect.poll(() => shares).toContainEqual(expect.objectContaining({
    action: "invite",
    boardId: "board",
    friendUid: "alex",
    role: "viewer",
  }));
  await expect(page.getByRole("status")).toContainText("Alex Rivera can now view this board");
  await expect(page.getByText("alex@example.com")).toBeVisible();
});
