import { LiveblocksProvider } from "@liveblocks/react";
import type { PropsWithChildren } from "react";
import { auth } from "../config/firebase";
import { clientSessionId } from "../services/apiClient";
import { recordCollaborationAuthAttempt } from "./connectionTelemetry";
import { openSessionGuestNonce, openSessionPasswordKey } from "./openSession";

const authorizeRoom = async (room?: string) => {
  if (room) recordCollaborationAuthAttempt(room);
  const openSessionToken = new URL(window.location.href).searchParams.get("openSession");
  if (openSessionToken) {
    const response = await fetch("/api/liveblocks-auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        room,
        openSessionToken,
        openSessionPassword: sessionStorage.getItem(openSessionPasswordKey(openSessionToken)) ?? "",
        openSessionGuestNonce: openSessionGuestNonce(openSessionToken),
      }),
    });
    const body = await response.json();
    if (!response.ok) throw new Error(body?.error ?? "Open-session collaboration authorization failed.");
    return body;
  }
  const token = await auth.currentUser?.getIdToken();
  if (!token) throw new Error("Authentication required.");
  const response = await fetch("/api/liveblocks-auth", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "X-Kumo-Session-Id": clientSessionId(),
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
