import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const token = process.env.VERCEL_TOKEN;
const rawServiceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;

if (!token || !rawServiceAccount) {
  throw new Error("VERCEL_TOKEN and FIREBASE_SERVICE_ACCOUNT_JSON are required.");
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
