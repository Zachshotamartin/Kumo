import { verifyDeploymentSmoke } from "../src/server/deploymentSmoke.ts";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";

const deploymentUrl = process.argv[2];
if (!deploymentUrl) throw new Error("Usage: node scripts/verify-deployment-smoke.mjs <deployment-url>");

const result = await verifyDeploymentSmoke(deploymentUrl);
console.log(`Deployment smoke checks passed (app ${result.rootStatus}, protected API ${result.sessionStatus}).`);

// Exercise the actual external rewrite, which Vite and local component tests do not serve.
for (const [path, marker] of [["handler", "fireauth.oauthhelper.widget.initialize"], ["iframe", "fireauth.iframe.AuthRelay.initialize"]]) {
  const response = await fetch(new URL("/__/auth/" + path, deploymentUrl));
  if (!response.ok || !(await response.text()).includes(marker)) {
    throw new Error("Firebase helper rewrite did not return its bootstrap document: " + path);
  }
  if (response.headers.has("content-security-policy") || response.headers.get("x-frame-options") === "DENY") {
    throw new Error("Firebase helper is blocked by an application script/frame policy: " + path);
  }
}
const appResponse = await fetch(new URL("/", deploymentUrl));
const { headers } = JSON.parse(readFileSync("vercel.json", "utf8"));
const expectedRevision = createHash("sha256").update(JSON.stringify(headers)).digest("hex");
const markup = await appResponse.text();
if (markup.match(/<meta name="kumo-security-revision" content="([a-f0-9]{64})"/)?.[1] !== expectedRevision) {
  throw new Error("The deployed document does not match this release's security headers.");
}
if (!appResponse.headers.get("cache-control")?.split(",").some((directive) => directive.trim() === "no-store")) {
  throw new Error("The authentication entry document must not retain superseded security headers in the HTTP cache.");
}
const appPolicy = appResponse.headers.get("content-security-policy") ?? "";
if (!appPolicy.includes("script-src 'self'") || /script-src[^;]*'unsafe-inline'/.test(appPolicy)) {
  throw new Error("The application must retain its strict script policy.");
}
const scriptSources = appPolicy.split(";").map((directive) => directive.trim().split(/\s+/)).find(([name]) => name === "script-src");
if (!scriptSources?.some((source) => source === "https://apis.google.com")) {
  throw new Error("App CSP blocks Google's iframe loader, so Firebase cannot recover redirect sign-in.");
}
console.log("Firebase redirect and iframe helpers are served without the app-only CSP; application CSP remains strict.");
