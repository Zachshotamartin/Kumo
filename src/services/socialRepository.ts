import type { BoardSummary } from "./boardRepository";
import { authenticatedFetch } from "./apiClient";

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
