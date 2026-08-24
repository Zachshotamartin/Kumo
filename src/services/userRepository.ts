import { authenticatedFetch } from "./apiClient";

export interface SessionProfile {
  uid: string;
  email: string;
  displayName: string;
  avatarUrl: string | null;
  username: string;
}

export const ensureUserProfile = async (): Promise<SessionProfile> => {
  const result = await authenticatedFetch<{ profile: SessionProfile }>("/api/session", { method: "POST" });
  return result.profile;
};
