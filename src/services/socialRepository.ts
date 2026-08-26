import type { BoardSummary } from "./boardRepository";
import { authenticatedFetch } from "./apiClient";
import { createClient } from "@supabase/supabase-js";

export type RelationshipStatus = "none" | "incoming" | "outgoing" | "friend" | "blocked";
export type FriendRequestPolicy = "everyone" | "friends_of_friends" | "none";
export type FriendshipAction = "request" | "accept" | "decline" | "cancel" | "remove" | "block" | "unblock";

export interface SocialProfile {
  id: string;
  username: string;
  displayName: string;
  bio: string;
  avatarUrl: string | null;
  relationship: RelationshipStatus;
}

export interface UserProfile extends SocialProfile {
  editable: boolean;
  friendCount: number;
  publicBoardCount: number;
  publicBoards: BoardSummary[];
  email?: string;
  discoverable?: boolean;
  friendRequestPolicy?: FriendRequestPolicy;
}

export interface FriendsOverview {
  friends: SocialProfile[];
  incoming: SocialProfile[];
  outgoing: SocialProfile[];
  blocked: SocialProfile[];
}

export interface ProfilePatch {
  displayName?: string;
  username?: string;
  bio?: string;
  avatarUrl?: string | null;
  discoverable?: boolean;
  friendRequestPolicy?: FriendRequestPolicy;
}

export const getProfile = async (username?: string): Promise<UserProfile> => {
  const query = username ? `?username=${encodeURIComponent(username)}` : "";
  const result = await authenticatedFetch<{ profile: UserProfile }>(`/api/profile${query}`);
  return result.profile;
};
export const updateProfile = async (patch: ProfilePatch): Promise<UserProfile> => {
  const result = await authenticatedFetch<{ profile: UserProfile }>("/api/profile", {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
  return result.profile;
};

const croppedAvatar = async (file: File): Promise<File> => {
  if (typeof createImageBitmap !== "function") return file;
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  if (!Number.isFinite(side) || side <= 0) {
    bitmap.close();
    return file;
  }
  const outputSize = Math.min(512, side);
  const canvas = document.createElement("canvas");
  canvas.width = outputSize;
  canvas.height = outputSize;
  const context = canvas.getContext("2d");
  if (!context) {
    bitmap.close();
    return file;
  }
  context.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, outputSize, outputSize);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", 0.9));
  return blob ? new File([blob], "avatar.webp", { type: "image/webp" }) : file;
};

const storageClient = () => {
  const url = import.meta.env.VITE_SUPABASE_URL;
  const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("Supabase public upload configuration is incomplete.");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
};

export const uploadProfileAvatar = async (source: File): Promise<string> => {
  if (!["image/png", "image/jpeg", "image/webp"].includes(source.type) || source.size <= 0 || source.size > 5 * 1024 * 1024) {
    throw new Error("Upload a PNG, JPEG, or WebP avatar no larger than 5 MB.");
  }
  const file = await croppedAvatar(source);
  const prepared = await authenticatedFetch<{ upload: { path: string; token: string } }>("/api/profile", { method: "POST", body: JSON.stringify({ action: "prepare-avatar-upload", mimeType: file.type, byteSize: file.size }) });
  const { error } = await storageClient().storage.from("profile-avatars").uploadToSignedUrl(prepared.upload.path, prepared.upload.token, file, { contentType: file.type, upsert: false });
  if (error) throw error;
  const completed = await authenticatedFetch<{ avatarUrl: string }>("/api/profile", { method: "POST", body: JSON.stringify({ action: "complete-avatar-upload", storageKey: prepared.upload.path }) });
  return completed.avatarUrl;
};

export const listFriendships = (): Promise<FriendsOverview> =>
  authenticatedFetch<FriendsOverview>("/api/friends");

export const searchProfiles = async (query: string): Promise<SocialProfile[]> => {
  if (query.trim().length < 2) return [];
  const result = await authenticatedFetch<{ results: SocialProfile[] }>(
    `/api/friends?query=${encodeURIComponent(query.trim())}`
  );
  return result.results;
};

export const mutateFriendship = async (
  targetUid: string,
  action: FriendshipAction
): Promise<RelationshipStatus> => {
  const result = await authenticatedFetch<{ relationship: RelationshipStatus }>("/api/friends", {
    method: "POST",
    body: JSON.stringify({ targetUid, action }),
  });
  return result.relationship;
};
