import { verifySupabaseSchemaRelease } from "../src/server/supabaseSchemaRelease.ts";

const required = (name) => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required to verify the remote Supabase schema.`);
  return value;
};

const version = await verifySupabaseSchemaRelease({
  serviceRoleKey: required("SUPABASE_SERVICE_ROLE_KEY"),
  supabaseUrl: required("SUPABASE_URL"),
});

console.log(`Remote Supabase schema release ${version} is ready.`);
