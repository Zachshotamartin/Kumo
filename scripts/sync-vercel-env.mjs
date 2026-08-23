import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const token = process.env.VERCEL_TOKEN;
const rawServiceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabasePublishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;
const liveblocksSecretKey = process.env.LIVEBLOCKS_SECRET_KEY;
const liveblocksWebhookSecret = process.env.LIVEBLOCKS_WEBHOOK_SECRET;

if (!token || !rawServiceAccount || !supabaseUrl || !supabaseServiceRoleKey || !supabasePublishableKey || !liveblocksSecretKey || !liveblocksWebhookSecret) {
  throw new Error("Vercel, Firebase, Supabase, and Liveblocks deployment credentials are required.");
}

const serviceAccount = JSON.parse(rawServiceAccount);
const requiredFields = ["project_id", "client_email", "private_key"];
requiredFields.forEach((field) => {
  if (typeof serviceAccount[field] !== "string" || !serviceAccount[field]) {
    throw new Error(`Firebase service account is missing ${field}.`);
  }
});

const variables = {
  FIREBASE_ADMIN_PROJECT_ID: serviceAccount.project_id,
  FIREBASE_ADMIN_CLIENT_EMAIL: serviceAccount.client_email,
  FIREBASE_ADMIN_PRIVATE_KEY: serviceAccount.private_key,
  FIREBASE_ADMIN_DATABASE_URL: `https://${serviceAccount.project_id}-default-rtdb.firebaseio.com`,
  SUPABASE_URL: supabaseUrl,
  SUPABASE_SERVICE_ROLE_KEY: supabaseServiceRoleKey,
  VITE_SUPABASE_URL: supabaseUrl,
  VITE_SUPABASE_PUBLISHABLE_KEY: supabasePublishableKey,
  LIVEBLOCKS_SECRET_KEY: liveblocksSecretKey,
  LIVEBLOCKS_WEBHOOK_SECRET: liveblocksWebhookSecret,
};
const vercelCli = fileURLToPath(
  new URL("../node_modules/vercel/dist/index.js", import.meta.url)
);

for (const [key, value] of Object.entries(variables)) {
  const result = spawnSync(
    process.execPath,
    [
      vercelCli,
      "env",
      "add",
      key,
      "production,preview",
      "--force",
      "--sensitive",
      "--yes",
      "--token",
      token,
    ],
    {
      encoding: "utf8",
      env: process.env,
      input: `${value}\n`,
    }
  );
  if (result.status !== 0) {
    throw new Error(`Could not synchronize ${key}: ${result.stderr.trim()}`);
  }
  console.log(`Synchronized ${key} with Vercel.`);
}
