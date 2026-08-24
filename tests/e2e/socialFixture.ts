import type { Page } from "@playwright/test";

const person = (id: string, displayName: string, relationship: string) => ({
  id,
  username: id,
  displayName,
  bio: "Maps product systems.",
  avatarUrl: null,
  relationship,
});

export const installSocialApiFixture = async (page: Page) => {
  const friendshipActions: Array<{ action: string; targetUid: string }> = [];
  let profileName = "Avery Morgan";

  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const json = (body: unknown, status = 200) => route.fulfill({
      status,
      contentType: "application/json",
      body: JSON.stringify(body),
    });

    if (url.pathname === "/api/board-preview") {
      return route.fulfill({
        status: 200,
        contentType: "image/svg+xml",
        body: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 620 400"><rect width="620" height="400" fill="#252629"/><rect x="90" y="74" width="230" height="156" rx="10" fill="#b87a2e"/><text x="115" y="145" fill="#17181a" font-size="28">Product map</text><circle cx="446" cy="252" r="62" fill="#e8e6df"/></svg>',
      });
    }

    if (url.pathname === "/api/boards") {
      return json({ boards: [{
        id: "board", title: "Product map", ownerId: "e2e-user", visibility: "private",
        roomId: "board:board", role: "owner", updatedAt: 1, thumbnailUrl: null,
      }] });
    }
    if (url.pathname === "/api/friends" && request.method() === "GET" && url.searchParams.has("query")) {
      return json({ results: [person("sam", "Sam Lee", "none")] });
    }
    if (url.pathname === "/api/friends" && request.method() === "GET") {
      return json({
        friends: [person("alex", "Alex Rivera", "friend")],
        incoming: [person("taylor", "Taylor Chen", "incoming")],
        outgoing: [],
        blocked: [],
      });
    }
    if (url.pathname === "/api/friends" && request.method() === "POST") {
      const body = request.postDataJSON() as { action: string; targetUid: string };
      friendshipActions.push(body);
      return json({ targetUid: body.targetUid, relationship: body.action === "request" ? "outgoing" : "friend" });
    }
    if (url.pathname === "/api/profile" && request.method() === "PATCH") {
      const body = request.postDataJSON() as { displayName: string };
      profileName = body.displayName;
      return json({ profile: {
        ...person("e2e-user", profileName, "none"), username: "avery", editable: true,
        email: "avery@example.com", discoverable: true, friendRequestPolicy: "everyone",
        friendCount: 1, publicBoardCount: 0, publicBoards: [],
      } });
    }
    if (url.pathname === "/api/profile") {
      return json({ profile: {
        ...person("e2e-user", profileName, "none"), username: "avery", editable: true,
        email: "avery@example.com", discoverable: true, friendRequestPolicy: "everyone",
        friendCount: 1, publicBoardCount: 0, publicBoards: [],
      } });
    }
    return json({ error: "Unhandled fixture API route." }, 404);
  });

  return { friendshipActions };
};
