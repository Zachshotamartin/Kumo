import { get, ref, set } from "firebase/database";
import { realtimeDb } from "../../config/firebase";

export interface UserProfile {
  uid: string;
  email: string | null;
  displayName: string;
  loginType: "email" | "google";
  createdAt: number;
}

export const ensureUserProfile = async (
  uid: string,
  email: string | null,
  loginType: UserProfile["loginType"]
): Promise<void> => {
  const profileRef = ref(realtimeDb, `users/${uid}`);
  const snapshot = await get(profileRef);
  if (snapshot.exists()) return;
  const profile: UserProfile = {
    uid,
    email,
    displayName: email?.split("@")[0] ?? "Kumo user",
    loginType,
    createdAt: Date.now(),
  };
  await set(profileRef, profile);
};
