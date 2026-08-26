export interface AuthenticatedCanaryOptions {
  baseUrl: string;
  firebaseApiKey: string;
  supabaseUrl: string;
  supabaseServiceRoleKey: string;
  email: string;
}

export interface AuthenticatedCanaryIdentityAdmin {
  createUser: (email: string) => Promise<{ uid: string }>;
  createCustomToken: (uid: string) => Promise<string>;
  deleteUser: (uid: string) => Promise<void>;
}

interface FirebaseSession {
  idToken?: unknown;
}

const responseMessage = async (response: Response) => {
  const body = await response.json().catch(() => null) as { error?: { message?: string } | string } | null;
  if (typeof body?.error === "string") return body.error;
  if (typeof body?.error?.message === "string") return body.error.message;
  return `HTTP ${response.status}`;
};

const requireResponse = async (response: Response, label: string) => {
  if (!response.ok) throw new Error(`${label} failed: ${await responseMessage(response)}`);
  return response;
};

const failedCleanupResponse = (error: unknown) => ({
  ok: false,
  status: 0,
  json: async () => ({ error: error instanceof Error ? error.message : String(error) }),
}) as Response;

export const verifyAuthenticatedCanary = async (
  options: AuthenticatedCanaryOptions,
  identityAdmin: AuthenticatedCanaryIdentityAdmin,
  fetcher: typeof fetch = fetch
) => {
  const baseUrl = new URL(options.baseUrl);
  if (baseUrl.protocol !== "https:") throw new Error("The authenticated canary requires an HTTPS deployment URL.");
  const identity = (operation: string) => `https://identitytoolkit.googleapis.com/v1/accounts:${operation}?key=${encodeURIComponent(options.firebaseApiKey)}`;
  let uid: string | null = null;
  let primaryError: unknown;
  let result: { uid: string; boardCount: number } | undefined;
  const cleanupErrors: Error[] = [];

  try {
    // Production intentionally disables public sign-up. Create the disposable
    // identity through Admin Auth, then exchange a custom token for the same
    // client ID token that a real authenticated browser sends to the APIs.
    const account = await identityAdmin.createUser(options.email);
    uid = account.uid;
    const customToken = await identityAdmin.createCustomToken(uid);
    const signIn = await requireResponse(await fetcher(identity("signInWithCustomToken"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: customToken, returnSecureToken: true }),
    }), "Firebase canary custom-token sign-in");
    const firebaseSession = await signIn.json() as FirebaseSession;
    if (typeof firebaseSession.idToken !== "string" || !firebaseSession.idToken) {
      throw new Error("Firebase canary custom-token sign-in returned an invalid session.");
    }
    const sessionId = `canary-${uid}`.replace(/[^a-zA-Z0-9-]/g, "-").slice(0, 100).padEnd(16, "0");
    const headers = { authorization: `Bearer ${firebaseSession.idToken}`, "x-kumo-session-id": sessionId, "content-type": "application/json" };
    const session = await requireResponse(await fetcher(new URL("/api/session", baseUrl), {
      method: "POST",
      headers,
      body: "{}",
    }), "Authenticated session API");
    const sessionBody = await session.json() as { profile?: { uid?: string } };
    if (sessionBody.profile?.uid !== uid) throw new Error("Authenticated session returned the wrong profile.");
    const boards = await requireResponse(await fetcher(new URL("/api/boards", baseUrl), {
      headers: { authorization: `Bearer ${firebaseSession.idToken}`, "x-kumo-session-id": sessionId },
    }), "Authenticated boards API");
    const boardsBody = await boards.json() as { boards?: unknown[] };
    if (!Array.isArray(boardsBody.boards)) throw new Error("Authenticated boards API returned an invalid collection.");
    result = { uid, boardCount: boardsBody.boards.length };
  } catch (error) {
    primaryError = error;
  } finally {
    if (uid) {
      const profileUrl = new URL("/rest/v1/profiles", options.supabaseUrl);
      profileUrl.searchParams.set("firebase_uid", `eq.${uid}`);
      const profileCleanup = await fetcher(profileUrl, {
        method: "DELETE",
        headers: {
          apikey: options.supabaseServiceRoleKey,
          authorization: `Bearer ${options.supabaseServiceRoleKey}`,
        },
      }).catch(failedCleanupResponse);
      if (!profileCleanup.ok) cleanupErrors.push(new Error(`Supabase canary cleanup failed: ${await responseMessage(profileCleanup)}`));
      try {
        await identityAdmin.deleteUser(uid);
      } catch (error) {
        cleanupErrors.push(new Error(`Firebase canary cleanup failed: ${error instanceof Error ? error.message : String(error)}`));
      }
    }
  }

  if (primaryError || cleanupErrors.length) {
    throw new AggregateError([...(primaryError ? [primaryError] : []), ...cleanupErrors], "Authenticated deployment canary failed.");
  }
  return result!;
};
