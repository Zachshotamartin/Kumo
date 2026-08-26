export interface AuthenticatedCanaryOptions {
  baseUrl: string;
  firebaseApiKey: string;
  supabaseUrl: string;
  supabaseServiceRoleKey: string;
  email: string;
  password: string;
}

interface FirebaseAccount {
  idToken: string;
  localId: string;
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
  fetcher: typeof fetch = fetch
) => {
  const baseUrl = new URL(options.baseUrl);
  if (baseUrl.protocol !== "https:") throw new Error("The authenticated canary requires an HTTPS deployment URL.");
  const identity = (operation: string) => `https://identitytoolkit.googleapis.com/v1/accounts:${operation}?key=${encodeURIComponent(options.firebaseApiKey)}`;
  let account: FirebaseAccount | null = null;
  let primaryError: unknown;
  let result: { uid: string; boardCount: number } | undefined;
  const cleanupErrors: Error[] = [];

  try {
    // Use an anonymous disposable identity. Email/password sign-up tokens are
    // intentionally unverified and production APIs correctly reject them.
    const signup = await requireResponse(await fetcher(identity("signUp"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ returnSecureToken: true }),
    }), "Firebase canary signup");
    account = await signup.json() as FirebaseAccount;
    if (!account.idToken || !account.localId) throw new Error("Firebase canary signup returned an incomplete account.");
    const sessionId = `canary-${account.localId}`.replace(/[^a-zA-Z0-9-]/g, "-").slice(0, 100).padEnd(16, "0");
    const headers = { authorization: `Bearer ${account.idToken}`, "x-kumo-session-id": sessionId, "content-type": "application/json" };
    const session = await requireResponse(await fetcher(new URL("/api/session", baseUrl), {
      method: "POST",
      headers,
      body: "{}",
    }), "Authenticated session API");
    const sessionBody = await session.json() as { profile?: { uid?: string } };
    if (sessionBody.profile?.uid !== account.localId) throw new Error("Authenticated session returned the wrong profile.");
    const boards = await requireResponse(await fetcher(new URL("/api/boards", baseUrl), {
      headers: { authorization: `Bearer ${account.idToken}`, "x-kumo-session-id": sessionId },
    }), "Authenticated boards API");
    const boardsBody = await boards.json() as { boards?: unknown[] };
    if (!Array.isArray(boardsBody.boards)) throw new Error("Authenticated boards API returned an invalid collection.");
    result = { uid: account.localId, boardCount: boardsBody.boards.length };
  } catch (error) {
    primaryError = error;
  } finally {
    if (account) {
      const profileUrl = new URL("/rest/v1/profiles", options.supabaseUrl);
      profileUrl.searchParams.set("firebase_uid", `eq.${account.localId}`);
      const profileCleanup = await fetcher(profileUrl, {
        method: "DELETE",
        headers: {
          apikey: options.supabaseServiceRoleKey,
          authorization: `Bearer ${options.supabaseServiceRoleKey}`,
        },
      }).catch(failedCleanupResponse);
      if (!profileCleanup.ok) cleanupErrors.push(new Error(`Supabase canary cleanup failed: ${await responseMessage(profileCleanup)}`));
      const accountCleanup = await fetcher(identity("delete"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ idToken: account.idToken }),
      }).catch(failedCleanupResponse);
      if (!accountCleanup.ok) cleanupErrors.push(new Error(`Firebase canary cleanup failed: ${await responseMessage(accountCleanup)}`));
    }
  }

  if (primaryError || cleanupErrors.length) {
    throw new AggregateError([...(primaryError ? [primaryError] : []), ...cleanupErrors], "Authenticated deployment canary failed.");
  }
  return result!;
};
