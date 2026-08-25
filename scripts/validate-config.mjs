import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import ts from "typescript";

const jsonFiles = new Map();
for (const file of ["database.rules.json", "firebase.json", "vercel.json", "vercel.dev.json"]) {
  jsonFiles.set(file, JSON.parse(readFileSync(file, "utf8")));
}

const vercelRewrites = jsonFiles.get("vercel.json")?.rewrites ?? [];
const spaRewriteIndex = vercelRewrites.findIndex((rewrite) => rewrite.source === "/(.*)");
const authRewriteIndex = vercelRewrites.findIndex((rewrite) =>
  rewrite.source === "/__/auth/:path*" &&
  rewrite.destination === "https://kumo-7d8e1.firebaseapp.com/__/auth/:path*"
);
const apiRewriteIndex = vercelRewrites.findIndex((rewrite) =>
  rewrite.source === "/api/:path" && rewrite.destination === "/api/router?path=:path"
);
if (spaRewriteIndex < 0 || authRewriteIndex < 0 || authRewriteIndex > spaRewriteIndex) {
  throw new Error("vercel.json must proxy the same-origin Firebase authentication helper before the SPA fallback.");
}
if (apiRewriteIndex < 0 || apiRewriteIndex > spaRewriteIndex) {
  throw new Error("vercel.json must route consolidated API requests before the SPA fallback.");
}
if (!jsonFiles.get("vercel.dev.json")?.rewrites?.some((rewrite) =>
  rewrite.source === "/api/:path" && rewrite.destination === "/api/router?path=:path"
)) {
  throw new Error("vercel.dev.json must route consolidated local API requests.");
}

const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
const requiredResolutions = {
  jose: "5.10.0",
  "firebase/**/@grpc/grpc-js": "1.9.16",
  protobufjs: "7.6.5",
  "@protobufjs/utf8": "1.1.2",
  "firebase/**/websocket-driver": "0.7.5",
  "firebase-admin/**/glob/minimatch": "9.0.7",
  "firebase-admin/**/glob/minimatch/brace-expansion": "2.1.4",
  "firebase-admin/**/gaxios/uuid": "11.1.1",
  "firebase-admin/**/teeny-request/uuid": "11.1.1",
};
for (const [dependency, version] of Object.entries(requiredResolutions)) {
  if (packageJson.resolutions?.[dependency] !== version) {
    throw new Error(`The patched ${dependency} dependency must remain pinned to ${version}.`);
  }
}
if (packageJson.engines?.node !== "24.x" || packageJson.packageManager !== "yarn@1.22.22") {
  throw new Error("Production, local development, and dependency installation must stay pinned to Node 24 and Yarn 1.22.22.");
}
if (packageJson.devDependencies?.["@types/node"] !== "24.13.3") {
  throw new Error("Node type definitions must match the Node 24 production runtime.");
}
if (JSON.stringify(packageJson).toLowerCase().includes("resend")) {
  throw new Error("Resend must not be present in Kumo dependencies or scripts.");
}
execFileSync(
  process.execPath,
  ["--no-experimental-require-module", "--eval", "require('jwks-rsa')"],
  { stdio: "pipe" },
);

const migration = readFileSync("supabase/migrations/202608230001_initial_kumo.sql", "utf8");
for (const required of [
  "create table if not exists public.boards",
  "create table if not exists public.board_members",
  "create table if not exists public.board_links",
  "alter table public.boards enable row level security",
  "revoke all on public.boards from anon, authenticated",
  "create_kumo_board",
  "soft_delete_kumo_board",
  "'board-assets'",
]) {
  if (!migration.toLowerCase().includes(required.toLowerCase())) {
    throw new Error(`Supabase migration is missing required statement: ${required}`);
  }
}

const boardLinkMigration = readFileSync(
  "supabase/migrations/202608230002_atomic_board_link_sync.sql",
  "utf8",
);
for (const required of ["sync_kumo_board_links", "security definer", "service_role"]) {
  if (!boardLinkMigration.toLowerCase().includes(required.toLowerCase())) {
    throw new Error(`Atomic board-link migration is missing required statement: ${required}`);
  }
}

const creationAuditMigration = readFileSync(
  "supabase/migrations/202608230006_atomic_creation_audits.sql",
  "utf8",
);
for (const required of ["create_kumo_checkpoint", "create_kumo_branch_record", "version.checkpoint_created", "branch.created", "service_role"]) {
  if (!creationAuditMigration.toLowerCase().includes(required.toLowerCase())) {
    throw new Error(`Atomic creation migration is missing required statement: ${required}`);
  }
}

const linkedBoardSharingMigration = readFileSync(
  "supabase/migrations/202608230007_linked_board_sharing.sql",
  "utf8",
);
for (const required of [
  "share_kumo_board_set",
  "remove_kumo_board_member_set",
  "Actor cannot manage every requested board",
  "security definer",
  "service_role",
]) {
  if (!linkedBoardSharingMigration.toLowerCase().includes(required.toLowerCase())) {
    throw new Error(`Linked-board sharing migration is missing required statement: ${required}`);
  }
}

const friendsProfilesMigration = readFileSync(
  "supabase/migrations/202608240001_friends_profiles.sql",
  "utf8",
);
for (const required of [
  "friendship_status",
  "friend_request_policy",
  "primary key (user_low_id, user_high_id)",
  "ensure_kumo_profile",
  "mutate_kumo_friendship",
  "security definer",
  "service_role",
]) {
  if (!friendsProfilesMigration.toLowerCase().includes(required.toLowerCase())) {
    throw new Error(`Friends and profiles migration is missing required statement: ${required}`);
  }
}

const sourceFiles = (directory) =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = `${directory}/${entry.name}`;
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(entry.name) ? [path] : [];
  });

const clientFiles = sourceFiles("src");
const clientSource = clientFiles.map((file) => readFileSync(file, "utf8")).join("\n");
if (/firebase\/database|realtimeDb|getDatabase\s*\(/.test(clientSource)) {
  throw new Error("Firebase Realtime Database must not be used by normal client code.");
}

const playwrightConfig = readFileSync("playwright.config.ts", "utf8");
if (!playwrightConfig.includes("workers: process.env.CI ? 2 : undefined")) {
  throw new Error("CI browser tests must use the validated two-worker configuration.");
}
for (const marker of ["run-e2e-production-preview.mjs", 'http://127.0.0.1:4178']) {
  if (!playwrightConfig.includes(marker)) {
    throw new Error(`Offline browser checks must exercise a generated production service worker: ${marker}`);
  }
}
const viteConfig = readFileSync("vite.config.ts", "utf8");
for (const marker of ["sourcemap: false", "perFile: true", "kumo-service-worker-precache", '"server/**/*.ts"']) {
  if (!viteConfig.includes(marker)) throw new Error(`Vite hardening is missing: ${marker}`);
}
const workerSource = readFileSync("public/sw.js", "utf8");
for (const marker of ["__KUMO_PRECACHE_MANIFEST__", "isPrecachedAsset(url)", "isReservedPath(url.pathname)", "cache.put(event.request", "cache.put(\"/\""]) {
  if (!workerSource.includes(marker)) throw new Error(`Offline service-worker hardening is missing: ${marker}`);
}

const deploymentWorkflow = readFileSync(".github/workflows/ci-cd.yml", "utf8");
const isolatedPreviewChecks = [
  'VERCEL_VALIDATION_DOMAIN: kumo-validation-${{ github.run_id }}-${{ github.run_attempt }}.vercel.app',
  '- name: Assign isolated validation domain',
  'yarn verify:deployment "https://$VERCEL_VALIDATION_DOMAIN"',
  "LHCI_URL: https://${{ env.VERCEL_VALIDATION_DOMAIN }}",
  'yarn verify:full-stack "https://$VERCEL_VALIDATION_DOMAIN"',
  '- name: Remove isolated validation domain',
  "include-hidden-files: true",
];
for (const marker of isolatedPreviewChecks) {
  if (!deploymentWorkflow.includes(marker)) {
    throw new Error(`Preview validation must target and clean up its run-isolated alias: ${marker}`);
  }
}
const previewWorkflowStart = deploymentWorkflow.indexOf("  preview:");
const productionWorkflowStart = deploymentWorkflow.indexOf("  production:");
const previewWorkflow = deploymentWorkflow.slice(previewWorkflowStart, productionWorkflowStart);
const fullStackCheckIndex = previewWorkflow.indexOf("- name: Verify real Supabase and Liveblocks product workflows");
const stableAliasIndex = previewWorkflow.indexOf("- name: Assign stable preview domain");
const validationCleanupIndex = previewWorkflow.indexOf("- name: Remove isolated validation domain");
if (previewWorkflowStart < 0 || productionWorkflowStart < 0 || fullStackCheckIndex < 0 || stableAliasIndex < fullStackCheckIndex || validationCleanupIndex < stableAliasIndex) {
  throw new Error("The stable preview alias must only be promoted after every deployment check passes.");
}

const workflowFiles = readdirSync(".github/workflows").filter((file) => file.endsWith(".yml"));
for (const workflowFile of workflowFiles) {
  const workflow = readFileSync(`.github/workflows/${workflowFile}`, "utf8");
  for (const match of workflow.matchAll(/uses:\s+[^\s@]+@([^\s#]+)/g)) {
    if (!/^[a-f0-9]{40}$/.test(match[1])) {
      throw new Error(`GitHub Action in ${workflowFile} is not pinned to an immutable commit: ${match[0]}`);
    }
  }
}
if (!existsSync(".github/dependabot.yml")) throw new Error("Dependabot update automation is required.");

if (readFileSync("src/App.css", "utf8").includes("logo512.png")) {
  throw new Error("The animated Kumo component must not fall back to the legacy logo bitmap.");
}

const logoRuntime = readFileSync("public/embed/kumo-logo.js", "utf8");
for (const marker of ["playAnimation", "startup", "kumo-animation-start"]) {
  if (!logoRuntime.includes(marker)) {
    throw new Error(`The bundled Kumo logo runtime is missing authored animation support: ${marker}`);
  }
}

const requiredDataPaths = [
  ["src/services/boardRepository.ts", "/api/boards"],
  ["src/services/assetRepository.ts", "VITE_SUPABASE_URL"],
  ["src/collaboration/LiveblocksRoot.tsx", "/api/liveblocks-auth"],
  ["api/liveblocks-webhook.ts", 'from("document_snapshots")'],
  ["api/liveblocks-webhook.ts", "syncBoardLinks"],
  ["server/api/_boardLinks.ts", 'rpc("sync_kumo_board_links"'],
  ["src/services/socialRepository.ts", "/api/friends"],
  ["server/api/handlers/share-board.ts", "friendshipBetween"],
];
for (const [file, marker] of requiredDataPaths) {
  if (!readFileSync(file, "utf8").includes(marker)) {
    throw new Error(`${file} is no longer connected to the required data path: ${marker}`);
  }
}

const projectRoot = process.cwd();
const serverEntries = ["api/router.ts", "api/liveblocks-webhook.ts"].map((file) => resolve(file));
const pendingServerFiles = [...serverEntries];
const visitedServerFiles = new Set();

while (pendingServerFiles.length) {
  const file = pendingServerFiles.pop();
  if (!file || visitedServerFiles.has(file)) continue;
  visitedServerFiles.add(file);
  const source = readFileSync(file, "utf8");
  const imports = ts.preProcessFile(source, true, true).importedFiles.map(({ fileName }) => fileName);
  for (const specifier of imports.filter((value) => value.startsWith("."))) {
    const displayFile = relative(projectRoot, file);
    if (!specifier.endsWith(".js")) {
      throw new Error(
        `Vercel ESM import in ${displayFile} must include its emitted .js extension: ${specifier}`,
      );
    }
    const emittedTarget = resolve(dirname(file), specifier);
    const sourceTarget = [
      emittedTarget.slice(0, -3) + ".ts",
      emittedTarget.slice(0, -3) + ".tsx",
      resolve(emittedTarget.slice(0, -3), "index.ts"),
      resolve(emittedTarget.slice(0, -3), "index.tsx"),
    ].find(existsSync);
    if (!sourceTarget) {
      throw new Error(`Vercel ESM import in ${displayFile} does not resolve to source: ${specifier}`);
    }
    pendingServerFiles.push(sourceTarget);
  }
}

console.log("Configuration and migration boundaries are valid.");
