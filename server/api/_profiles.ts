import { supabaseAdmin } from "./_supabase.js";

export type FriendRequestPolicy = "everyone" | "friends_of_friends" | "none";
export type FriendshipStatus = "pending" | "accepted" | "blocked";
export type RelationshipStatus = "none" | "incoming" | "outgoing" | "friend" | "blocked" | "hidden";

export interface ProfileRow {
  firebase_uid: string;
  email: string;
  email_verified: boolean;
  display_name: string;
  avatar_url: string | null;
  username: string;
  bio: string;
  discoverable: boolean;
  friend_request_policy: FriendRequestPolicy;
  created_at: string;
  updated_at: string;
}

export interface FriendshipRow {
  user_low_id: string;
  user_high_id: string;
  status: FriendshipStatus;
  requested_by: string | null;
  blocked_by: string | null;
  created_at: string;
  updated_at: string;
  responded_at: string | null;
}

export const PROFILE_COLUMNS = "firebase_uid, email, email_verified, display_name, avatar_url, username, bio, discoverable, friend_request_policy, created_at, updated_at";
export const FRIENDSHIP_COLUMNS = "user_low_id, user_high_id, status, requested_by, blocked_by, created_at, updated_at, responded_at";

export const profileSummary = (
  profile: ProfileRow,
  relationship: RelationshipStatus = "none"
) => ({
  id: profile.firebase_uid,
  username: profile.username,
  displayName: profile.display_name,
  bio: profile.bio,
  avatarUrl: profile.avatar_url,
  relationship,
});

export const otherUserId = (row: FriendshipRow, actorUid: string): string =>
  row.user_low_id === actorUid ? row.user_high_id : row.user_low_id;

export const relationshipFor = (row: FriendshipRow | null, actorUid: string): RelationshipStatus => {
  if (!row) return "none";
  if (row.status === "accepted") return "friend";
  if (row.status === "blocked") return row.blocked_by === actorUid ? "blocked" : "hidden";
  return row.requested_by === actorUid ? "outgoing" : "incoming";
};

export const friendshipRowsForActor = async (actorUid: string): Promise<FriendshipRow[]> => {
  const database = supabaseAdmin();
  const [low, high] = await Promise.all([
    database.from("friendships").select(FRIENDSHIP_COLUMNS).eq("user_low_id", actorUid).limit(500),
    database.from("friendships").select(FRIENDSHIP_COLUMNS).eq("user_high_id", actorUid).limit(500),
  ]);
  if (low.error) throw low.error;
  if (high.error) throw high.error;
  return [...(low.data ?? []), ...(high.data ?? [])] as FriendshipRow[];
};

export const hiddenProfileIdsForActor = async (actorUid: string): Promise<Set<string>> => {
  const rows = await friendshipRowsForActor(actorUid);
  return new Set(rows
    .filter((row) => row.status === "blocked")
    .map((row) => otherUserId(row, actorUid)));
};

export const friendshipBetween = async (
  actorUid: string,
  targetUid: string
): Promise<FriendshipRow | null> => {
  const lowId = actorUid < targetUid ? actorUid : targetUid;
  const highId = actorUid < targetUid ? targetUid : actorUid;
  const { data, error } = await supabaseAdmin()
    .from("friendships")
    .select(FRIENDSHIP_COLUMNS)
    .eq("user_low_id", lowId)
    .eq("user_high_id", highId)
    .maybeSingle();
  if (error) throw error;
  return data as FriendshipRow | null;
};

export const acceptedFriends = async (actorUid: string): Promise<Set<string>> => {
  const rows = await friendshipRowsForActor(actorUid);
  return new Set(rows
    .filter((row) => row.status === "accepted")
    .map((row) => otherUserId(row, actorUid)));
};

export const getProfilesByIds = async (ids: string[]): Promise<Map<string, ProfileRow>> => {
  const unique = [...new Set(ids)];
  if (!unique.length) return new Map();
  const { data, error } = await supabaseAdmin()
    .from("profiles")
    .select(PROFILE_COLUMNS)
    .eq("email_verified", true)
    .in("firebase_uid", unique);
  if (error) throw error;
  return new Map((data ?? []).map((profile) => [
    profile.firebase_uid as string,
    profile as ProfileRow,
  ]));
};

export const getProfileByUsername = async (username: string): Promise<ProfileRow | null> => {
  const { data, error } = await supabaseAdmin()
    .from("profiles")
    .select(PROFILE_COLUMNS)
    .eq("email_verified", true)
    .ilike("username", username)
    .maybeSingle();
  if (error) throw error;
  return data as ProfileRow | null;
};

export const getProfileById = async (uid: string): Promise<ProfileRow | null> => {
  const { data, error } = await supabaseAdmin()
    .from("profiles")
    .select(PROFILE_COLUMNS)
    .eq("firebase_uid", uid)
    .maybeSingle();
  if (error) throw error;
  return data as ProfileRow | null;
};
