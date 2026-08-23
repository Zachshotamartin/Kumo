import { readFileSync } from "node:fs";

const file = process.argv[2];
if (!file) throw new Error("Pass the Vercel environment file to validate.");
const requireConcreteValues = process.argv.includes("--require-concrete");

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

if (requireConcreteValues) {
  const concreteChecks = {
    FIREBASE_ADMIN_PROJECT_ID: (value) => /^[a-z0-9-]+$/.test(value),
    FIREBASE_ADMIN_CLIENT_EMAIL: (value) => /@.+\.iam\.gserviceaccount\.com$/.test(value),
    FIREBASE_ADMIN_PRIVATE_KEY: (value) => value.includes("BEGIN PRIVATE KEY"),
    FIREBASE_ADMIN_DATABASE_URL: (value) => /^https:\/\/.+\.firebaseio\.com\/?$/.test(value),
    SUPABASE_URL: (value) => /^https:\/\/.+\.supabase\.co\/?$/.test(value),
    SUPABASE_SERVICE_ROLE_KEY: (value) => value.length >= 32 && !/placeholder|sensitive|encrypted/i.test(value),
    VITE_SUPABASE_URL: (value) => /^https:\/\/.+\.supabase\.co\/?$/.test(value),
    VITE_SUPABASE_PUBLISHABLE_KEY: (value) => value.length >= 32 && !/placeholder|sensitive|encrypted/i.test(value),
    LIVEBLOCKS_SECRET_KEY: (value) => /^sk_[A-Za-z0-9_-]{20,}$/.test(value),
    LIVEBLOCKS_WEBHOOK_SECRET: (value) => value.length >= 20 && !/placeholder|sensitive|encrypted/i.test(value),
  };
  const placeholders = required.filter((name) => !concreteChecks[name](values.get(name)));
  if (placeholders.length) {
    throw new Error(`Local runtime configuration still contains placeholders or invalid values: ${placeholders.join(", ")}`);
  }
}

console.log(`Validated ${required.length} required Vercel runtime variables.`);
