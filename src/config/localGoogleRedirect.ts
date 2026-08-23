import { GoogleAuthProvider } from "firebase/auth";

const PENDING_GOOGLE_REDIRECT_KEY = "kumo.googleRedirect";

type StorageAdapter = Pick<Storage, "getItem" | "setItem" | "removeItem">;
type LocalLocation = Pick<Location, "hostname" | "protocol">;

interface PendingGoogleRedirect {
  nonce: string;
  returnUrl: string;
  state: string;
}

interface CreateAuthUriResponse {
  authUri?: string;
  error?: { message?: string };
}

const decodeJwtPayload = (token: string): Record<string, unknown> => {
  const encoded = token.split(".")[1];
  if (!encoded) throw new Error("Google returned an invalid identity token.");
  const normalized = encoded.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  try {
    return JSON.parse(atob(padded)) as Record<string, unknown>;
  } catch {
    throw new Error("Google returned an invalid identity token.");
  }
};

const pendingRedirect = (storage: StorageAdapter): PendingGoogleRedirect => {
  const serialized = storage.getItem(PENDING_GOOGLE_REDIRECT_KEY);
  if (!serialized) throw new Error("The Google sign-in session expired. Please try again.");
  try {
    const parsed = JSON.parse(serialized) as Partial<PendingGoogleRedirect>;
    if (!parsed.nonce || !parsed.returnUrl || !parsed.state) throw new Error();
    return parsed as PendingGoogleRedirect;
  } catch {
    throw new Error("The Google sign-in session expired. Please try again.");
  }
};

export const usesLocalGoogleRedirect = (location: LocalLocation): boolean =>
  location.protocol === "http:"
  && (location.hostname === "localhost" || location.hostname === "127.0.0.1" || location.hostname === "[::1]");

export const hasLocalGoogleRedirectResult = (url: string): boolean => {
  const fragment = new URL(url).hash.slice(1);
  if (!fragment) return false;
  const params = new URLSearchParams(fragment);
  return params.has("id_token") || params.has("error");
};

export const prepareLocalGoogleRedirect = async (
  apiKey: string,
  currentUrl: string,
  storage: StorageAdapter
): Promise<string> => {
  const continueUrl = new URL(currentUrl);
  continueUrl.hash = "";
  const endpoint = new URL("https://identitytoolkit.googleapis.com/v1/accounts:createAuthUri");
  endpoint.searchParams.set("key", apiKey);
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      providerId: "google.com",
      continueUri: continueUrl.toString(),
    }),
  });
  const body = await response.json() as CreateAuthUriResponse;
  if (!response.ok || !body.authUri) {
    throw new Error(body.error?.message || "Google sign-in could not be started.");
  }

  const authUrl = new URL(body.authUri);
  const redirectUri = authUrl.searchParams.get("redirect_uri");
  const state = authUrl.searchParams.get("state");
  const nonce = authUrl.searchParams.get("nonce");
  if (authUrl.protocol !== "https:" || authUrl.hostname !== "accounts.google.com"
      || redirectUri !== continueUrl.toString() || !state || !nonce) {
    throw new Error("Firebase returned an invalid Google sign-in URL.");
  }

  storage.setItem(PENDING_GOOGLE_REDIRECT_KEY, JSON.stringify({
    nonce,
    returnUrl: continueUrl.toString(),
    state,
  } satisfies PendingGoogleRedirect));
  return authUrl.toString();
};

export const consumeLocalGoogleRedirect = (
  currentUrl: string,
  storage: StorageAdapter
): { credential: ReturnType<typeof GoogleAuthProvider.credential>; returnUrl: string } | null => {
  if (!hasLocalGoogleRedirectResult(currentUrl)) return null;
  const pending = pendingRedirect(storage);
  storage.removeItem(PENDING_GOOGLE_REDIRECT_KEY);

  const current = new URL(currentUrl);
  const params = new URLSearchParams(current.hash.slice(1));
  if (params.get("state") !== pending.state) {
    throw new Error("Google sign-in could not be verified. Please try again.");
  }
  if (params.has("error")) {
    throw new Error("Google sign-in was cancelled or denied.");
  }

  const idToken = params.get("id_token");
  if (!idToken || decodeJwtPayload(idToken).nonce !== pending.nonce) {
    throw new Error("Google sign-in could not be verified. Please try again.");
  }
  const returnUrl = new URL(pending.returnUrl);
  if (returnUrl.origin !== current.origin) {
    throw new Error("Google sign-in could not be verified. Please try again.");
  }
  return {
    credential: GoogleAuthProvider.credential(idToken),
    returnUrl: returnUrl.toString(),
  };
};
