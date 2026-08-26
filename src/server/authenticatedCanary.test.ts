import {
  verifyAuthenticatedCanary,
  type AuthenticatedCanaryIdentityAdmin,
  type AuthenticatedCanaryOptions,
} from "./authenticatedCanary";

const options: AuthenticatedCanaryOptions = {
  baseUrl: "https://kumo.example",
  firebaseApiKey: "firebase-key",
  supabaseUrl: "https://database.example",
  supabaseServiceRoleKey: "service-role",
  email: "canary@example.com",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { "content-type": "application/json" },
});
const successfulIdentityAdmin = (): AuthenticatedCanaryIdentityAdmin & {
  createUser: ReturnType<typeof vi.fn>;
  createCustomToken: ReturnType<typeof vi.fn>;
  deleteUser: ReturnType<typeof vi.fn>;
} => ({
  createUser: vi.fn().mockResolvedValue({ uid: "canary-user" }),
  createCustomToken: vi.fn().mockResolvedValue("custom-token"),
  deleteUser: vi.fn().mockResolvedValue(undefined),
});
const successfulFetch = () => vi.fn<typeof fetch>()
  .mockResolvedValueOnce(json({ idToken: "id-token", refreshToken: "refresh-token" }))
  .mockResolvedValueOnce(json({ profile: { uid: "canary-user" } }))
  .mockResolvedValueOnce(json({ boards: [] }))
  .mockResolvedValueOnce(new Response(null, { status: 204 }));

const capturedError = async (promise: Promise<unknown>) => {
  try {
    await promise;
    throw new Error("Expected the canary to fail.");
  } catch (error) {
    expect(error).toBeInstanceOf(AggregateError);
    return error as AggregateError;
  }
};

describe("authenticated production canary", () => {
  it("creates, verifies, and removes an admin-provisioned disposable identity", async () => {
    const identityAdmin = successfulIdentityAdmin();
    const fetcher = successfulFetch();
    await expect(verifyAuthenticatedCanary(options, identityAdmin, fetcher))
      .resolves.toEqual({ uid: "canary-user", boardCount: 0 });
    expect(identityAdmin.createUser).toHaveBeenCalledWith("canary@example.com");
    expect(identityAdmin.createCustomToken).toHaveBeenCalledWith("canary-user");
    expect(identityAdmin.deleteUser).toHaveBeenCalledWith("canary-user");
    expect(fetcher).toHaveBeenCalledTimes(4);
    expect(String(fetcher.mock.calls[0]![0])).toContain("accounts:signInWithCustomToken?key=firebase-key");
    expect(fetcher).toHaveBeenNthCalledWith(1, expect.any(String), expect.objectContaining({
      body: JSON.stringify({ token: "custom-token", returnSecureToken: true }),
    }));
    expect(fetcher).toHaveBeenNthCalledWith(2, new URL("https://kumo.example/api/session"), expect.objectContaining({
      method: "POST",
      headers: expect.objectContaining({ authorization: "Bearer id-token", "x-kumo-session-id": "canary-canary-user" }),
    }));
    expect(fetcher).toHaveBeenNthCalledWith(4, new URL("https://database.example/rest/v1/profiles?firebase_uid=eq.canary-user"), expect.objectContaining({ method: "DELETE" }));
  });

  it("uses the global fetch implementation by default", async () => {
    const fetcher = successfulFetch();
    vi.stubGlobal("fetch", fetcher);
    await expect(verifyAuthenticatedCanary(options, successfulIdentityAdmin()))
      .resolves.toEqual({ uid: "canary-user", boardCount: 0 });
    vi.unstubAllGlobals();
  });

  it("rejects non-HTTPS deployments before creating an account", async () => {
    const identityAdmin = successfulIdentityAdmin();
    const fetcher = vi.fn<typeof fetch>();
    await expect(verifyAuthenticatedCanary({ ...options, baseUrl: "http://kumo.example" }, identityAdmin, fetcher))
      .rejects.toThrow("requires an HTTPS");
    expect(identityAdmin.createUser).not.toHaveBeenCalled();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("reports admin account-creation errors without attempting cleanup", async () => {
    const identityAdmin = successfulIdentityAdmin();
    identityAdmin.createUser.mockRejectedValueOnce(new Error("admin unavailable"));
    const fetcher = vi.fn<typeof fetch>();
    const error = await capturedError(verifyAuthenticatedCanary(options, identityAdmin, fetcher));
    expect(error.errors[0]).toHaveProperty("message", "admin unavailable");
    expect(identityAdmin.deleteUser).not.toHaveBeenCalled();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("cleans up an account when custom-token creation fails", async () => {
    const identityAdmin = successfulIdentityAdmin();
    identityAdmin.createCustomToken.mockRejectedValueOnce(new Error("token signing unavailable"));
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(new Response(null, { status: 204 }));
    const error = await capturedError(verifyAuthenticatedCanary(options, identityAdmin, fetcher));
    expect(error.errors[0]).toHaveProperty("message", "token signing unavailable");
    expect(identityAdmin.deleteUser).toHaveBeenCalledWith("canary-user");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("reports custom-token exchange errors and removes the admin-created account", async () => {
    const identityAdmin = successfulIdentityAdmin();
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(json({ error: { message: "INVALID_CUSTOM_TOKEN" } }, 400))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    const error = await capturedError(verifyAuthenticatedCanary(options, identityAdmin, fetcher));
    expect(error.errors[0]).toHaveProperty("message", "Firebase canary custom-token sign-in failed: INVALID_CUSTOM_TOKEN");
    expect(identityAdmin.deleteUser).toHaveBeenCalledWith("canary-user");
  });

  it.each([
    [{ refreshToken: "refresh-token" }, "missing ID token"],
    [{ idToken: "" }, "empty ID token"],
  ])("rejects an invalid custom-token session (%s: %s) and still cleans up", async (firebaseSession, _label) => {
    const identityAdmin = successfulIdentityAdmin();
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(json(firebaseSession))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    const error = await capturedError(verifyAuthenticatedCanary(options, identityAdmin, fetcher));
    expect(error.errors[0]).toHaveProperty("message", "Firebase canary custom-token sign-in returned an invalid session.");
    expect(identityAdmin.deleteUser).toHaveBeenCalledWith("canary-user");
  });

  it("rejects a session for the wrong profile and surfaces string API errors", async () => {
    const identityAdmin = successfulIdentityAdmin();
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(json({ idToken: "id-token", refreshToken: "refresh-token" }))
      .mockResolvedValueOnce(json({ profile: { uid: "wrong-user" } }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    const error = await capturedError(verifyAuthenticatedCanary(options, identityAdmin, fetcher));
    expect(error.errors[0]).toHaveProperty("message", "Authenticated session returned the wrong profile.");

    const failedSession = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(json({ idToken: "id-token", refreshToken: "refresh-token" }))
      .mockResolvedValueOnce(json({ error: "session offline" }, 503))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    const sessionError = await capturedError(verifyAuthenticatedCanary(options, successfulIdentityAdmin(), failedSession));
    expect(sessionError.errors[0]).toHaveProperty("message", "Authenticated session API failed: session offline");
  });

  it("rejects malformed board collections and fallback HTTP failures", async () => {
    const malformed = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(json({ idToken: "id-token", refreshToken: "refresh-token" }))
      .mockResolvedValueOnce(json({ profile: { uid: "canary-user" } }))
      .mockResolvedValueOnce(json({ boards: null }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    const malformedError = await capturedError(verifyAuthenticatedCanary(options, successfulIdentityAdmin(), malformed));
    expect(malformedError.errors[0]).toHaveProperty("message", "Authenticated boards API returned an invalid collection.");

    const failedBoards = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(json({ idToken: "id-token", refreshToken: "refresh-token" }))
      .mockResolvedValueOnce(json({ profile: { uid: "canary-user" } }))
      .mockResolvedValueOnce(new Response("not json", { status: 502 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    const boardsError = await capturedError(verifyAuthenticatedCanary(options, successfulIdentityAdmin(), failedBoards));
    expect(boardsError.errors[0]).toHaveProperty("message", "Authenticated boards API failed: HTTP 502");
  });

  it("reports unsuccessful Supabase cleanup and Firebase Admin cleanup errors", async () => {
    const identityAdmin = successfulIdentityAdmin();
    identityAdmin.deleteUser.mockRejectedValueOnce(new Error("identity network failure"));
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(json({ idToken: "id-token", refreshToken: "refresh-token" }))
      .mockResolvedValueOnce(json({ profile: { uid: "canary-user" } }))
      .mockResolvedValueOnce(json({ boards: ["existing"] }))
      .mockResolvedValueOnce(json({ error: "profile retained" }, 500));
    const error = await capturedError(verifyAuthenticatedCanary(options, identityAdmin, fetcher));
    expect(error.errors.map((entry) => entry.message)).toEqual([
      "Supabase canary cleanup failed: profile retained",
      "Firebase canary cleanup failed: identity network failure",
    ]);
  });

  it("normalizes rejected cleanup values without hiding the primary result", async () => {
    const primitiveIdentityAdmin = successfulIdentityAdmin();
    primitiveIdentityAdmin.deleteUser.mockRejectedValueOnce("identity offline");
    const primitiveFetch = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(json({ idToken: "id-token", refreshToken: "refresh-token" }))
      .mockResolvedValueOnce(json({ profile: { uid: "canary-user" } }))
      .mockResolvedValueOnce(json({ boards: [] }))
      .mockRejectedValueOnce("database offline");
    const primitiveError = await capturedError(verifyAuthenticatedCanary(options, primitiveIdentityAdmin, primitiveFetch));
    expect(primitiveError.errors.map((entry) => entry.message)).toEqual([
      "Supabase canary cleanup failed: database offline",
      "Firebase canary cleanup failed: identity offline",
    ]);

    const errorFetch = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(json({ idToken: "id-token", refreshToken: "refresh-token" }))
      .mockResolvedValueOnce(json({ profile: { uid: "canary-user" } }))
      .mockResolvedValueOnce(json({ boards: [] }))
      .mockRejectedValueOnce(new Error("database network failure"));
    const error = await capturedError(verifyAuthenticatedCanary(options, successfulIdentityAdmin(), errorFetch));
    expect(error.errors[0]).toHaveProperty("message", "Supabase canary cleanup failed: database network failure");
  });
});
