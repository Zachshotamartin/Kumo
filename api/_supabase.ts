import { createClient, SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | undefined;

export const supabaseAdmin = (): SupabaseClient => {
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error("Supabase server environment variables are incomplete.");
  }
  client ??= createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return client;
};

export interface ActorProfile {
  uid: string;
  email: string;
  displayName: string;
  avatarUrl: string | null;
}

export const ensureActorProfile = async (actor: {
  uid: string;
  email?: string;
  name?: string;
  picture?: string;
}): Promise<ActorProfile> => {
  const profile: ActorProfile = {
    uid: actor.uid,
    email: actor.email?.trim().toLowerCase() ?? `${actor.uid}@firebase.local`,
    displayName: actor.name?.trim() || actor.email?.split("@")[0] || "Kumo user",
    avatarUrl: actor.picture ?? null,
  };
  const { error } = await supabaseAdmin().from("profiles").upsert({
    firebase_uid: profile.uid,
    email: profile.email,
    display_name: profile.displayName,
    avatar_url: profile.avatarUrl,
  }, { onConflict: "firebase_uid" });
  if (error) throw error;
  return profile;
};

