import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireActor } from "../_auth.js";
import { publicBoardsForOwner } from "../_boards.js";
import { allowMethods, errorMessage, stringQuery } from "../_http.js";
import {
  PROFILE_COLUMNS,
  friendshipBetween,
  friendshipRowsForActor,
  getProfileById,
  getProfileByUsername,
  profileSummary,
  relationshipFor,
  type FriendRequestPolicy,
  type ProfileRow,
} from "../_profiles.js";
import { ensureActorProfile, supabaseAdmin } from "../_supabase.js";

const usernamePattern = /^[a-z0-9][a-z0-9._-]{2,29}$/;

const profileCounts = async (uid: string) => {
  const [relationships, publicBoards] = await Promise.all([
    friendshipRowsForActor(uid),
    publicBoardsForOwner(uid),
  ]);
  return {
    friendCount: relationships.filter((row) => row.status === "accepted").length,
    publicBoards,
  };
};

const cleanAvatarUrl = (value: unknown): string | null => {
  if (value === null || value === "") return null;
  if (typeof value !== "string" || value.length > 2048) throw new Error("Avatar URL is invalid.");
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("Avatar URL is invalid.");
  }
  if (url.protocol !== "https:") throw new Error("Avatar URL must use HTTPS.");
  return url.toString();
};

export default async function handler(request: VercelRequest, response: VercelResponse) {
  if (!allowMethods(request, response, ["GET", "PATCH"])) return;
  try {
    const actor = await requireActor(request);
    await ensureActorProfile(actor);

    if (request.method === "GET") {
      const username = stringQuery(request.query.username).trim().toLowerCase();
      const target = username
        ? await getProfileByUsername(username)
        : await getProfileById(actor.uid);
      if (!target) return response.status(404).json({ error: "Profile not found." });
      const ownProfile = target.firebase_uid === actor.uid;
      const relation = ownProfile ? null : await friendshipBetween(actor.uid, target.firebase_uid);
      const relationship = ownProfile ? "none" : relationshipFor(relation, actor.uid);
      if (relationship === "hidden") return response.status(404).json({ error: "Profile not found." });
      const counts = await profileCounts(target.firebase_uid);
      return response.status(200).json({
        profile: {
          ...profileSummary(target, ownProfile ? "none" : relationship),
          editable: ownProfile,
          friendCount: counts.friendCount,
          publicBoardCount: counts.publicBoards.length,
          publicBoards: counts.publicBoards,
          ...(ownProfile ? {
            email: target.email,
            discoverable: target.discoverable,
            friendRequestPolicy: target.friend_request_policy,
          } : {}),
        },
      });
    }

    const body = request.body ?? {};
    const patch: Record<string, unknown> = {};
    if (body.displayName !== undefined) {
      const displayName = typeof body.displayName === "string" ? body.displayName.trim() : "";
      if (!displayName || displayName.length > 60) throw new Error("Display name must be 1-60 characters.");
      patch.display_name = displayName;
    }
    if (body.username !== undefined) {
      const username = typeof body.username === "string" ? body.username.trim().toLowerCase() : "";
      if (!usernamePattern.test(username)) {
        throw new Error("Username must be 3-30 lowercase letters, numbers, periods, underscores, or hyphens.");
      }
      patch.username = username;
    }
    if (body.bio !== undefined) {
      if (typeof body.bio !== "string") throw new Error("Biography must be text.");
      const bio = body.bio.trim();
      if (bio.length > 280) throw new Error("Biography must be 280 characters or fewer.");
      patch.bio = bio;
    }
    if (body.avatarUrl !== undefined) patch.avatar_url = cleanAvatarUrl(body.avatarUrl);
    if (body.discoverable !== undefined) {
      if (typeof body.discoverable !== "boolean") throw new Error("Discoverability must be true or false.");
      patch.discoverable = body.discoverable;
    }
    if (body.friendRequestPolicy !== undefined) {
      const policy = body.friendRequestPolicy as FriendRequestPolicy;
      if (!["everyone", "friends_of_friends", "none"].includes(policy)) {
        throw new Error("Friend request policy is invalid.");
      }
      patch.friend_request_policy = policy;
    }
    if (!Object.keys(patch).length) return response.status(400).json({ error: "No profile changes were provided." });

    const { data, error } = await supabaseAdmin()
      .from("profiles")
      .update(patch)
      .eq("firebase_uid", actor.uid)
      .select(PROFILE_COLUMNS)
      .single();
    if (error) {
      if (error.code === "23505") return response.status(409).json({ error: "That username is already in use." });
      throw error;
    }
    await supabaseAdmin().from("audit_events").insert({
      actor_id: actor.uid,
      event_type: "profile.updated",
      payload: { fields: Object.keys(patch) },
    });
    const profile = data as ProfileRow;
    const counts = await profileCounts(actor.uid);
    return response.status(200).json({
      profile: {
        ...profileSummary(profile),
        editable: true,
        email: profile.email,
        discoverable: profile.discoverable,
        friendRequestPolicy: profile.friend_request_policy,
        friendCount: counts.friendCount,
        publicBoardCount: counts.publicBoards.length,
        publicBoards: counts.publicBoards,
      },
    });
  } catch (error) {
    const message = errorMessage(error, "We couldn't update this profile.");
    const databaseFailure = typeof error === "object" && error !== null && "code" in error;
    return response.status(message === "Authentication required." ? 401 : databaseFailure ? 500 : 400).json({ error: message });
  }
}
