import { authenticatedFetch } from "./apiClient";

export const ensureUserProfile = async (): Promise<void> => {
  await authenticatedFetch<{ profile: unknown }>("/api/session", { method: "POST" });
};
