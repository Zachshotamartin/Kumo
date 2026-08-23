import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";

const jsonFiles = new Map();
for (const file of ["database.rules.json", "firebase.json", "vercel.json", "vercel.dev.json"]) {
  jsonFiles.set(file, JSON.parse(readFileSync(file, "utf8")));
}

const authRewrite = jsonFiles.get("vercel.json")?.rewrites?.[0];
if (
  authRewrite?.source !== "/__/auth/:path*" ||
  authRewrite?.destination !== "https://kumo-7d8e1.firebaseapp.com/__/auth/:path*"
) {
  throw new Error("vercel.json must proxy the same-origin Firebase authentication helper first.");
}

const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
if (packageJson.resolutions?.jose !== "5.10.0") {
  throw new Error("Firebase Admin requires the Vercel-compatible jwks-rsa/jose resolution.");
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

if (readFileSync("src/App.css", "utf8").includes("logo512.png")) {
  throw new Error("The animated Kumo component must not fall back to the legacy logo bitmap.");
}

const requiredDataPaths = [
  ["src/services/boardRepository.ts", "/api/boards"],
  ["src/services/assetRepository.ts", "VITE_SUPABASE_URL"],
  ["src/collaboration/LiveblocksRoot.tsx", "/api/liveblocks-auth"],
  ["api/liveblocks-webhook.ts", 'from("document_snapshots")'],
  ["api/liveblocks-webhook.ts", "syncBoardLinks"],
  ["api/_boardLinks.ts", 'rpc("sync_kumo_board_links"'],
];
for (const [file, marker] of requiredDataPaths) {
  if (!readFileSync(file, "utf8").includes(marker)) {
    throw new Error(`${file} is no longer connected to the required data path: ${marker}`);
  }
}

for (const file of readdirSync("api").filter((name) => name.endsWith(".ts"))) {
  const source = readFileSync(`api/${file}`, "utf8");
  for (const match of source.matchAll(/\bfrom\s+["'](\.{1,2}\/[^"']+)["']/g)) {
    if (!match[1].endsWith(".js")) {
      throw new Error(
        `Vercel ESM import in api/${file} must include its emitted .js extension: ${match[1]}`,
      );
    }
  }
}

console.log("Configuration and migration boundaries are valid.");
