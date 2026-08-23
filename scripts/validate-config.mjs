import { readFileSync } from "node:fs";

for (const file of ["database.rules.json", "firebase.json", "vercel.json"]) {
  JSON.parse(readFileSync(file, "utf8"));
}

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

const clientSource = [
  "src/services/boardRepository.ts",
  "src/services/userRepository.ts",
  "src/config/firebase.ts",
].map((file) => readFileSync(file, "utf8")).join("\n");
if (/firebase\/database|realtimeDb|getDatabase\s*\(/.test(clientSource)) {
  throw new Error("Firebase Realtime Database must not be used by normal client code.");
}

console.log("Configuration and migration boundaries are valid.");
