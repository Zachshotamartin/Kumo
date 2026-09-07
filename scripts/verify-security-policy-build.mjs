import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { build } from "vite";

// Exercise the actual production plugin with identical source HTML and only a
// CSP configuration change. A fresh-client login test cannot catch stale ETags.
const repository = process.cwd();
const fixture = mkdtempSync(join(tmpdir(), "kumo-security-build-"));
const config = JSON.parse(readFileSync(join(repository, "vercel.json"), "utf8"));
try {
  mkdirSync(join(fixture, "public"));
  writeFileSync(join(fixture, "public/sw.js"), readFileSync(join(repository, "public/sw.js")));
  writeFileSync(join(fixture, "index.html"), "<!doctype html><html><head><title>Kumo</title></head><body>Unchanged application</body></html>");
  process.chdir(fixture);
  const buildDocument = async () => {
    writeFileSync("vercel.json", JSON.stringify(config));
    await build({ configFile: join(repository, "vite.config.ts"), root: fixture, logLevel: "silent" });
    return readFileSync("dist/index.html", "utf8");
  };
  const before = await buildDocument();
  const policy = config.headers.flatMap((route) => route.headers).find((header) => header.key === "Content-Security-Policy");
  policy.value = policy.value.replace("script-src 'self'", "script-src 'self' https://example.test");
  const after = await buildDocument();
  assert.notEqual(before, after, "A CSP-only deployment must change the HTML used for ETag validation.");
  assert.match(after, /Unchanged application/);
  console.log("A policy-only configuration change produces different production HTML.");
} finally {
  process.chdir(repository);
  rmSync(fixture, { recursive: true, force: true });
}
