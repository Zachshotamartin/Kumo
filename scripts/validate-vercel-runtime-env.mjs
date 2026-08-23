import { readFileSync } from "node:fs";

const file = process.argv[2];
if (!file) throw new Error("Pass the Vercel environment file to validate.");

const values = new Map();
for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
  const match = line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/);
  if (!match) continue;
  values.set(match[1], match[2].replace(/^["']|["']$/g, "").trim());
}

const required = [
  "FIREBASE_ADMIN_PROJECT_ID",
  "FIREBASE_ADMIN_CLIENT_EMAIL",
  "FIREBASE_ADMIN_PRIVATE_KEY",
  "FIREBASE_ADMIN_DATABASE_URL",
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "VITE_SUPABASE_URL",
  "VITE_SUPABASE_PUBLISHABLE_KEY",
  "LIVEBLOCKS_SECRET_KEY",
  "LIVEBLOCKS_WEBHOOK_SECRET",
];

const missing = required.filter((name) => !values.get(name));
if (missing.length) {
  throw new Error(`Vercel runtime configuration is missing: ${missing.join(", ")}`);
}

console.log(`Validated ${required.length} required Vercel runtime variables.`);
