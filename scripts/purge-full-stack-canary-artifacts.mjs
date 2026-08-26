import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Liveblocks } from "@liveblocks/node";
import { createClient } from "@supabase/supabase-js";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { isFullStackCanaryEmail } from "../src/server/fullStackCanaryArtifacts.ts";
import { parseFirebaseCanaryServiceAccount } from "../src/server/fullStackFirebaseCanary.ts";

const apply = process.argv.includes("--apply");
const envArgument = process.argv.slice(2).find((argument) => !argument.startsWith("--"));
const envPath = resolve(envArgument ?? ".env.local");

const parseEnv = (source) => Object.fromEntries(
  source.split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#") && line.includes("="))
    .map((line) => {
      const separator = line.indexOf("=");
      const key = line.slice(0, separator).trim();
      const raw = line.slice(separator + 1).trim();
      const quoted = (raw.startsWith('"') && raw.endsWith('"'))
        || (raw.startsWith("'") && raw.endsWith("'"));
      return [key, quoted ? raw.slice(1, -1).replace(/\\n/g, "\n") : raw];
    }),
);

const env = { ...parseEnv(await readFile(envPath, "utf8")), ...process.env };
const required = (name) => {
  const value = env[name];
  if (!value || /placeholder|sensitive|encrypted|^\[.*\]$/i.test(value)) {
    throw new Error(`${name} must contain a concrete value in ${envPath}.`);
  }
  return value;
};

const supabase = createClient(required("SUPABASE_URL"), required("SUPABASE_SERVICE_ROLE_KEY"), {
  auth: { autoRefreshToken: false, persistSession: false },
});

const rows = async (query, label) => {
  const { data, error } = await query;
  if (error) throw new Error(`Could not load ${label}.`, { cause: error });
  return data ?? [];
};

const canaryProfiles = (await rows(
  supabase.from("profiles").select("firebase_uid,email").like("email", "kumo-full-stack-%@example.com").limit(1_000),
  "canary profiles",
)).filter((profile) => isFullStackCanaryEmail(profile.email));
const accountIds = canaryProfiles.map((profile) => profile.firebase_uid);

if (!accountIds.length) {
  const danglingPublications = await rows(
    supabase.from("community_publications")
      .select("board_id,slug")
      .like("slug", "full-stack-%")
      .eq("description", "Disposable integration publication")
      .limit(1_000),
    "dangling canary publications",
  );
  if (danglingPublications.length) {
    throw new Error(`${danglingPublications.length} canary-shaped Community publications remain without matching canary profiles.`);
  }
  console.log("No full-stack canary profiles or related artifacts remain.");
  process.exit(0);
}

const boards = await rows(
  supabase.from("boards").select("id,owner_id,liveblocks_room_id").in("owner_id", accountIds).limit(10_000),
  "canary boards",
);
const boardIds = boards.map((board) => board.id);
const branches = boardIds.length ? await rows(
  supabase.from("document_branches").select("board_id,room_id").in("board_id", boardIds).limit(10_000),
  "canary branches",
) : [];
const publications = await rows(
  supabase.from("community_publications").select("board_id,published_by").in("published_by", accountIds).limit(10_000),
  "canary publications",
);
const roomIds = [...new Set([
  ...boards.map((board) => board.liveblocks_room_id),
  ...branches.map((branch) => branch.room_id),
].filter(Boolean))];

console.log(JSON.stringify({
  accounts: accountIds.length,
  boards: boardIds.length,
  branchRooms: branches.length,
  communityPublications: publications.length,
  liveblocksRooms: roomIds.length,
  mode: apply ? "apply" : "dry-run",
}, null, 2));

if (!apply) {
  console.log(`Dry run only. Re-run with --apply to purge this exact reserved canary namespace from ${envPath}.`);
  process.exit(0);
}

// Resolve every credential before the first destructive request. A missing
// integration must never leave a purge half-started.
const liveblocks = new Liveblocks({ secret: required("LIVEBLOCKS_SECRET_KEY") });
const serviceAccount = parseFirebaseCanaryServiceAccount(required("FIREBASE_SERVICE_ACCOUNT_JSON"));
const appName = "kumo-full-stack-canary-purge";
const app = getApps().find((candidate) => candidate.name === appName) ?? initializeApp({
  credential: cert({
    projectId: serviceAccount.projectId,
    clientEmail: serviceAccount.clientEmail,
    privateKey: serviceAccount.privateKey,
  }),
}, appName);
const firebaseAdmin = getAuth(app);

const failures = [];
const attempt = async (label, operation) => {
  try {
    await operation();
  } catch (cause) {
    failures.push(new Error(`Canary purge failed for ${label}.`, { cause }));
  }
};

for (const roomId of [...roomIds].reverse()) {
  await attempt(`Liveblocks room ${roomId}`, async () => {
    try {
      await liveblocks.deleteRoom(roomId);
    } catch (error) {
      // Historical runs normally removed their rooms before the database cleanup failed.
      if (error?.status !== 404) throw error;
    }
  });
}

if (boardIds.length) {
  await attempt("Supabase boards", async () => {
    const { error } = await supabase.from("boards").delete().in("id", boardIds);
    if (error) throw error;
  });
}
await attempt("Supabase profiles", async () => {
  const { error } = await supabase.from("profiles").delete().in("firebase_uid", accountIds);
  if (error) throw error;
});

for (const accountId of accountIds) {
  await attempt(`Firebase user ${accountId}`, async () => {
    try {
      await firebaseAdmin.deleteUser(accountId);
    } catch (error) {
      if (error?.code !== "auth/user-not-found") throw error;
    }
  });
}

const remainingProfiles = (await rows(
  supabase.from("profiles").select("firebase_uid,email").like("email", "kumo-full-stack-%@example.com").limit(1_000),
  "remaining canary profiles",
)).filter((profile) => isFullStackCanaryEmail(profile.email));
const remainingPublications = await rows(
  supabase.from("community_publications").select("board_id,published_by").in("published_by", accountIds).limit(10_000),
  "remaining canary publications",
);

if (remainingProfiles.length || remainingPublications.length) {
  failures.push(new Error(
    `Canary purge verification found ${remainingProfiles.length} profiles and ${remainingPublications.length} publications remaining.`,
  ));
}
if (failures.length) {
  throw new AggregateError(failures, `Canary purge completed with ${failures.length} failure${failures.length === 1 ? "" : "s"}.`);
}

console.log(`Purged ${accountIds.length} canary accounts and ${boardIds.length} owned boards; no canary profiles or Community publications remain.`);
