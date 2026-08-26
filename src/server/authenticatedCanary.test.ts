import { verifyAuthenticatedCanary, type AuthenticatedCanaryOptions } from "./authenticatedCanary";

const options: AuthenticatedCanaryOptions = {
  baseUrl: "https://kumo.example",
  firebaseApiKey: "firebase-key",
  supabaseUrl: "https://database.example",
  supabaseServiceRoleKey: "service-role",
  email: "canary@example.com",
  password: "Kumo-canary-A1!",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { "content-type": "application/json" },
});
const successfulFetch = () => vi.fn<typeof fetch>()
  .mockResolvedValueOnce(json({ idToken: "token", localId: "canary-user" }))
  .mockResolvedValueOnce(json({ profile: { uid: "canary-user" } }))
  .mockResolvedValueOnce(json({ boards: [] }))
  .mockResolvedValueOnce(new Response(null, { status: 204 }))
  .mockResolvedValueOnce(json({}));

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
  it("creates, verifies, and removes a disposable authenticated identity", async () => {
    const fetcher = successfulFetch();
    await expect(verifyAuthenticatedCanary(options, fetcher)).resolves.toEqual({ uid: "canary-user", boardCount: 0 });
    expect(fetcher).toHaveBeenCalledTimes(5);
    expect(fetcher).toHaveBeenNthCalledWith(2, new URL("https://kumo.example/api/session"), expect.objectContaining({
      method: "POST",
      headers: expect.objectContaining({ authorization: "Bearer token", "x-kumo-session-id": "canary-canary-user" }),
    }));
    expect(fetcher).toHaveBeenNthCalledWith(1, expect.any(String), expect.objectContaining({
      body: JSON.stringify({ returnSecureToken: true }),
    }));
    expect(fetcher).toHaveBeenNthCalledWith(4, new URL("https://database.example/rest/v1/profiles?firebase_uid=eq.canary-user"), expect.objectContaining({ method: "DELETE" }));
    expect(String(fetcher.mock.calls[4]![0])).toContain("accounts:delete?key=firebase-key");
  });

  it("uses the global fetch implementation by default", async () => {
    const fetcher = successfulFetch();
    vi.stubGlobal("fetch", fetcher);
    await expect(verifyAuthenticatedCanary(options)).resolves.toEqual({ uid: "canary-user", boardCount: 0 });
    vi.unstubAllGlobals();
  });

  it("rejects non-HTTPS deployments before creating an account", async () => {
    const fetcher = vi.fn<typeof fetch>();
    await expect(verifyAuthenticatedCanary({ ...options, baseUrl: "http://kumo.example" }, fetcher))
      .rejects.toThrow("requires an HTTPS");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("reports Firebase signup errors without attempting cleanup", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(json({ error: { message: "SIGNUP_DISABLED" } }, 400));
    const error = await capturedError(verifyAuthenticatedCanary(options, fetcher));
    expect(error.errors[0]).toHaveProperty("message", "Firebase canary signup failed: SIGNUP_DISABLED");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it.each([
    [{ localId: "canary-user" }, "id token"],
    [{ idToken: "token" }, "local ID"],
  ])("rejects incomplete Firebase accounts and still attempts cleanup", async (account, _label) => {
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(json(account))
      .mockResolvedValueOnce(json({}))
      .mockResolvedValueOnce(json({}));
    const error = await capturedError(verifyAuthenticatedCanary(options, fetcher));
    expect(error.errors[0]).toHaveProperty("message", "Firebase canary signup returned an incomplete account.");
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it("rejects a session for the wrong profile and surfaces string API errors", async () => {
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(json({ idToken: "token", localId: "canary-user" }))
      .mockResolvedValueOnce(json({ profile: { uid: "wrong-user" } }))
      .mockResolvedValueOnce(json({}))
      .mockResolvedValueOnce(json({}));
    const error = await capturedError(verifyAuthenticatedCanary(options, fetcher));
    expect(error.errors[0]).toHaveProperty("message", "Authenticated session returned the wrong profile.");

    const failedSession = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(json({ idToken: "token", localId: "canary-user" }))
      .mockResolvedValueOnce(json({ error: "session offline" }, 503))
      .mockResolvedValueOnce(json({}))
      .mockResolvedValueOnce(json({}));
    const sessionError = await capturedError(verifyAuthenticatedCanary(options, failedSession));
    expect(sessionError.errors[0]).toHaveProperty("message", "Authenticated session API failed: session offline");
  });

  it("rejects malformed board collections and fallback HTTP failures", async () => {
    const malformed = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(json({ idToken: "token", localId: "canary-user" }))
      .mockResolvedValueOnce(json({ profile: { uid: "canary-user" } }))
      .mockResolvedValueOnce(json({ boards: null }))
      .mockResolvedValueOnce(json({}))
      .mockResolvedValueOnce(json({}));
    const malformedError = await capturedError(verifyAuthenticatedCanary(options, malformed));
    expect(malformedError.errors[0]).toHaveProperty("message", "Authenticated boards API returned an invalid collection.");

    const failedBoards = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(json({ idToken: "token", localId: "canary-user" }))
      .mockResolvedValueOnce(json({ profile: { uid: "canary-user" } }))
      .mockResolvedValueOnce(new Response("not json", { status: 502 }))
      .mockResolvedValueOnce(json({}))
      .mockResolvedValueOnce(json({}));
    const boardsError = await capturedError(verifyAuthenticatedCanary(options, failedBoards));
    expect(boardsError.errors[0]).toHaveProperty("message", "Authenticated boards API failed: HTTP 502");
  });

  it("fails when either cleanup request fails or rejects", async () => {
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(json({ idToken: "token", localId: "canary-user" }))
      .mockResolvedValueOnce(json({ profile: { uid: "canary-user" } }))
      .mockResolvedValueOnce(json({ boards: ["existing"] }))
      .mockResolvedValueOnce(json({ error: "profile retained" }, 500))
      .mockRejectedValueOnce(new Error("identity network failure"));
    const error = await capturedError(verifyAuthenticatedCanary(options, fetcher));
    expect(error.errors.map((entry) => entry.message)).toEqual([
      "Supabase canary cleanup failed: profile retained",
      "Firebase canary cleanup failed: identity network failure",
    ]);

    const primitiveRejection = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(json({ idToken: "token", localId: "canary-user" }))
      .mockResolvedValueOnce(json({ profile: { uid: "canary-user" } }))
      .mockResolvedValueOnce(json({ boards: [] }))
      .mockRejectedValueOnce("database offline")
      .mockResolvedValueOnce(json({}));
    const primitiveError = await capturedError(verifyAuthenticatedCanary(options, primitiveRejection));
    expect(primitiveError.errors[0]).toHaveProperty("message", "Supabase canary cleanup failed: database offline");
  });
});
