import { LiveblocksProvider } from "@liveblocks/react";
import type { PropsWithChildren } from "react";
import { auth } from "../config/firebase";

const authorizeRoom = async (room?: string) => {
  const token = await auth.currentUser?.getIdToken();
  if (!token) throw new Error("Authentication required.");
  const response = await fetch("/api/liveblocks-auth", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ room }),
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body?.error ?? "Collaboration authorization failed.");
  return body;
};

export const LiveblocksRoot = ({ children }: PropsWithChildren) => (
  <LiveblocksProvider authEndpoint={authorizeRoom} preventUnsavedChanges throttle={16}>
    {children}
  </LiveblocksProvider>
);
