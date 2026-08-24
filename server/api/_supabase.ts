import { createClient, SupabaseClient } from "@supabase/supabase-js";
import type { FriendRequestPolicy, ProfileRow } from "./_profiles.js";

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
  username: string;
  bio: string;
  discoverable: boolean;
  friendRequestPolicy: FriendRequestPolicy;
}

export const ensureActorProfile = async (actor: {
  uid: string;
  email?: string;
  name?: string;
  picture?: string;
}): Promise<ActorProfile> => {
  const email = actor.email?.trim().toLowerCase() ?? `${actor.uid}@firebase.local`;
  const defaultDisplayName = actor.name?.trim() || actor.email?.split("@")[0] || "Kumo user";
  const { data, error } = await supabaseAdmin().rpc("ensure_kumo_profile", {
    p_firebase_uid: actor.uid,
    p_email: email,
    p_default_display_name: defaultDisplayName,
    p_default_avatar_url: actor.picture ?? null,
  });
  if (error) throw error;
  const row = data as ProfileRow;
  return {
    uid: row.firebase_uid,
    email: row.email,
    displayName: row.display_name,
    avatarUrl: row.avatar_url,
    username: row.username,
    bio: row.bio,
    discoverable: row.discoverable,
    friendRequestPolicy: row.friend_request_policy,
  };
};
