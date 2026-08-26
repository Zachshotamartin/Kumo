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
import { randomUUID } from "node:crypto";

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

const removeOrQueueAvatar = async (
  database: ReturnType<typeof supabaseAdmin>,
  actorUid: string,
  storageKey: string
) => {
  const { error } = await database.storage.from("profile-avatars").remove([storageKey]);
  if (!error) return;
  try {
    const { error: queueError } = await database.rpc("enqueue_kumo_storage_cleanup", {
      p_bucket: "profile-avatars",
      p_storage_key: storageKey,
      p_error: errorMessage(error, "Avatar cleanup failed."),
    });
    if (!queueError) return;
    await database.from("audit_events").insert({
      actor_id: actorUid,
      event_type: "profile.avatar_cleanup_unqueued",
      payload: { storageKey, message: errorMessage(queueError, "Cleanup retry could not be queued.") },
    });
  } catch (queueError) {
    await database.from("audit_events").insert({
      actor_id: actorUid,
      event_type: "profile.avatar_cleanup_unqueued",
      payload: { storageKey, message: errorMessage(queueError, "Cleanup retry could not be queued.") },
    });
  }
};

export default async function handler(request: VercelRequest, response: VercelResponse) {
  if (!allowMethods(request, response, ["GET", "PATCH", "POST"])) return;
  try {
    const actor = await requireActor(request);
    await ensureActorProfile(actor);

    if (request.method === "POST") {
      const database = supabaseAdmin();
      const action = request.body?.action;
      const allowed = new Set(["image/png", "image/jpeg", "image/webp"]);
      if (action === "prepare-avatar-upload") {
        const mimeType = typeof request.body?.mimeType === "string" ? request.body.mimeType : "";
        const byteSize = Number(request.body?.byteSize);
        if (!allowed.has(mimeType) || !Number.isFinite(byteSize) || byteSize <= 0 || byteSize > 5 * 1024 * 1024) return response.status(400).json({ error: "Upload a PNG, JPEG, or WebP avatar no larger than 5 MB." });
        const extension = mimeType === "image/png" ? "png" : mimeType === "image/webp" ? "webp" : "jpg";
        const path = `${actor.uid}/${randomUUID()}.${extension}`;
        const { data, error } = await database.storage.from("profile-avatars").createSignedUploadUrl(path);
        if (error) throw error;
        return response.status(200).json({ upload: data });
      }
      if (action === "complete-avatar-upload") {
        const storageKey = typeof request.body?.storageKey === "string" ? request.body.storageKey : "";
        if (!storageKey.startsWith(`${actor.uid}/`) || storageKey.includes("..")) return response.status(400).json({ error: "Invalid avatar path." });
        const folder = storageKey.slice(0, storageKey.lastIndexOf("/"));
        const fileName = storageKey.slice(storageKey.lastIndexOf("/") + 1);
        const { data: objects, error: listError } = await database.storage.from("profile-avatars").list(folder, { search: fileName, limit: 2 });
        if (listError) throw listError;
        const uploaded = (objects ?? []).find((item) => item.name === fileName);
        const mimeType = typeof uploaded?.metadata?.mimetype === "string" ? uploaded.metadata.mimetype : "";
        if (!uploaded || !allowed.has(mimeType)) return response.status(409).json({ error: "Avatar upload has not completed." });
        const { data: current, error: currentError } = await database.from("profiles").select("avatar_storage_key").eq("firebase_uid", actor.uid).single();
        if (currentError) throw currentError;
        const publicUrl = database.storage.from("profile-avatars").getPublicUrl(storageKey).data.publicUrl;
        const { error } = await database.from("profiles").update({ avatar_url: publicUrl, avatar_storage_key: storageKey }).eq("firebase_uid", actor.uid);
        if (error) throw error;
        if (current.avatar_storage_key && current.avatar_storage_key !== storageKey) {
          await removeOrQueueAvatar(database, actor.uid, current.avatar_storage_key);
        }
        return response.status(200).json({ avatarUrl: publicUrl });
      }
      return response.status(400).json({ error: "Unknown profile action." });
    }

    if (request.method === "GET") {
      const username = stringQuery(request.query.username).trim().toLowerCase();
      const target = username
        ? await getProfileByUsername(username)
        : await getProfileById(actor.uid);
      if (!target) return response.status(404).json({ error: "Profile not found." });
      const ownProfile = target.firebase_uid === actor.uid;
      const relation = ownProfile ? null : await friendshipBetween(actor.uid, target.firebase_uid);
      const relationship = ownProfile ? "none" : relationshipFor(relation, actor.uid);
      if (relationship === "hidden" || relationship === "blocked") return response.status(404).json({ error: "Profile not found." });
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
    let previousAvatarStorageKey: string | null = null;
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
    if (body.avatarUrl !== undefined) {
      const { data: currentAvatar, error: currentAvatarError } = await supabaseAdmin().from("profiles").select("avatar_storage_key").eq("firebase_uid", actor.uid).maybeSingle();
      if (currentAvatarError) throw currentAvatarError;
      previousAvatarStorageKey = currentAvatar?.avatar_storage_key as string | null ?? null;
      patch.avatar_url = cleanAvatarUrl(body.avatarUrl);
      patch.avatar_storage_key = null;
    }
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
    if (previousAvatarStorageKey) {
      await removeOrQueueAvatar(supabaseAdmin(), actor.uid, previousAvatarStorageKey);
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
