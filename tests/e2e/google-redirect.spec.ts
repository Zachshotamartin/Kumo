import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

// Run the built application and its real Firebase SDK under the deployed CSP.
// Only the external Google/Firebase responses and product backend are fixtures;
// getAuth, signInWithRedirect, getRedirectResult, persistence and App are real.
test("Google redirect returns to an authenticated dashboard and survives reload", async ({ page }) => {
  const origin = "https://kumo.test";
  const config = JSON.parse(readFileSync("vercel.json", "utf8"));
  const policyErrors: string[] = [];
  const loadedGoogleScripts: string[] = [];
  let exchanges = 0;
  page.on("console", (message) => {
    if (/Content Security Policy|Content-Security-Policy/.test(message.text())) policyErrors.push(message.text());
  });
  const now = Math.floor(Date.now() / 1000);
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const idToken = `${encode({ alg: "none" })}.${encode({ sub: "redirect-user", iat: now, exp: now + 3600, auth_time: now })}.fixture`;
  const user = {
    localId: "redirect-user", email: "redirect@example.com", emailVerified: true,
    displayName: "Redirect test", createdAt: String(Date.now()), lastLoginAt: String(Date.now()),
    providerUserInfo: [{ providerId: "google.com", rawId: "google-user", email: "redirect@example.com" }],
  };

  await page.route("https://identitytoolkit.googleapis.com/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("accounts:signInWithIdp")) {
      exchanges += 1;
      expect(route.request().postDataJSON()).toMatchObject({ sessionId: "google-return-session", returnSecureToken: true });
    }
    await route.fulfill({ json: path.endsWith("/projects")
      ? { authorizedDomains: ["kumo.test"] }
      : path.endsWith("accounts:lookup") ? { users: [user] }
      : { ...user, idToken, refreshToken: "fixture-refresh-token", expiresIn: "3600", providerId: "google.com" } });
  });

  await page.route("https://apis.google.com/**", async (route) => {
    const url = new URL(route.request().url());
    loadedGoogleScripts.push(url.pathname);
    // Exercise both the initial GAPI loader and its separately loaded iframe
    // module. A policy permitting only /js/api.js would still break the latter.
    const body = url.pathname === "/js/api.js" ? `
      const script = document.createElement('script');
      script.src = 'https://apis.google.com/_/scs/fixture-iframes.js';
      script.onload = () => window[${JSON.stringify(url.searchParams.get("onload"))}]();
      document.head.append(script);
    ` : `
      window.gapi = {
        load: (_name, options) => options.callback(),
        iframes: { Iframe: function() {}, CROSS_ORIGIN_IFRAMES_FILTER: () => true,
          getContext: () => ({ open: (options, ready) => {
            const element = document.createElement('iframe');
            element.src = options.url;
            Object.assign(element.style, options.attributes.style);
            options.where.append(element);
            const iframe = {
              restyle: async () => {}, ping: (done) => { done(); return Promise.resolve(); },
              register: (_name, receive) => {
                const returned = sessionStorage.getItem('fixture:google-returned');
                sessionStorage.removeItem('fixture:google-returned');
                setTimeout(() => receive({ authEvent: returned ? {
                  type: 'signInViaRedirect', sessionId: 'google-return-session',
                  urlResponse: location.origin + '/__/auth/handler', postBody: 'providerId=google.com'
                } : { type: 'unknown', error: { code: 'auth/no-auth-event' } } }), 0);
              },
              send: (_name, _data, done) => done([{ webStorageSupport: true }])
            };
            return ready(iframe);
          } })
        }
      };
    `;
    await route.fulfill({ contentType: "text/javascript", body });
  });

  await page.route(`${origin}/**`, async (route) => {
    const url = new URL(route.request().url());
    const headers: Record<string, string> = {};
    for (const rule of config.headers) {
      if (new RegExp("^" + rule.source + "$").test(url.pathname)) {
        for (const header of rule.headers) headers[header.key] = header.value;
      }
    }
    if (url.pathname === "/__/auth/handler") {
      return route.fulfill({ headers, contentType: "text/html", body: `<script>
        sessionStorage.setItem('fixture:google-returned', '1');
        location.replace(new URL(location.href).searchParams.get('redirectUrl'));
      </script>` });
    }
    if (url.pathname === "/__/auth/iframe") return route.fulfill({ headers, contentType: "text/html", body: "<!doctype html><title>Auth relay fixture</title>" });
    if (url.pathname.startsWith("/api/")) {
      return route.fulfill({ headers, json: {
        profile: { uid: user.localId, email: user.email, displayName: user.displayName, username: "redirect", avatarUrl: null },
        boards: [], folders: [], organization: [], savedViews: [], notifications: [], mutedBoardIds: [], templates: [],
        preferences: { browser_enabled: false },
      } });
    }
    const response = await fetch(`http://127.0.0.1:4178${url.pathname}${url.search}`);
    return route.fulfill({
      status: response.status,
      headers: { ...headers, "content-type": response.headers.get("content-type") ?? "application/octet-stream" },
      body: Buffer.from(await response.arrayBuffer()),
    });
  });

  await page.goto(origin);
  await page.getByRole("button", { name: "Continue with Google" }).click();
  await expect(page.getByRole("heading", { name: "Pick up where the idea moved." })).toBeVisible({ timeout: 15_000 });
  expect(exchanges).toBe(1);
  expect(loadedGoogleScripts).toContain("/js/api.js");
  expect(loadedGoogleScripts).toContain("/_/scs/fixture-iframes.js");
  expect(policyErrors).toEqual([]);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Pick up where the idea moved." })).toBeVisible();
  expect(exchanges).toBe(1);
  expect(policyErrors).toEqual([]);
  await expect(page.getByRole("button", { name: "Continue with Google" })).toHaveCount(0);
});
