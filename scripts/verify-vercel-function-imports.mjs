import { existsSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

const entries = [
  ".vercel/output/functions/api/router.func/api/router.js",
  ".vercel/output/functions/api/liveblocks-webhook.func/api/liveblocks-webhook.js",
];

for (const entry of entries) {
  const absolute = resolve(entry);
  if (!existsSync(absolute)) {
    throw new Error(`Vercel build output is missing the expected function entry: ${entry}`);
  }
  await import(pathToFileURL(absolute).href);
}

console.log("Vercel serverless function imports are Node-compatible.");
