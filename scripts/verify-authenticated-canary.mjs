import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { verifyAuthenticatedCanary } from "../src/server/authenticatedCanary.ts";

const parseEnv = (source) => Object.fromEntries(source.split(/\r?\n/)
  .map((line) => line.trim())
  .filter((line) => line && !line.startsWith("#") && line.includes("="))
  .map((line) => {
    const separator = line.indexOf("=");
    const key = line.slice(0, separator).trim();
    const raw = line.slice(separator + 1).trim();
    const quoted = (raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'"));
    return [key, quoted ? raw.slice(1, -1).replace(/\\n/g, "\n") : raw];
  }));

const deploymentUrl = process.argv[2];
const envPath = resolve(process.argv[3] ?? ".env.local");
if (!deploymentUrl) throw new Error("Usage: verify-authenticated-canary <deployment-url> [env-file]");
const env = { ...parseEnv(await readFile(envPath, "utf8")), ...process.env };
const required = (name) => {
  const value = env[name];
  if (!value || /placeholder|sensitive|encrypted|^\[.*\]$/i.test(value)) throw new Error(`${name} must contain a concrete value.`);
  return value;
};
const nonce = randomUUID();
const result = await verifyAuthenticatedCanary({
  baseUrl: deploymentUrl,
  firebaseApiKey: required("VITE_FIREBASE_API_KEY"),
  supabaseUrl: required("SUPABASE_URL"),
  supabaseServiceRoleKey: required("SUPABASE_SERVICE_ROLE_KEY"),
  email: `kumo-production-canary-${nonce}@example.com`,
  password: `Kumo-${nonce}-A1!`,
});
console.log(`Authenticated production canary passed for ${result.uid}; disposable identity and profile were removed.`);
