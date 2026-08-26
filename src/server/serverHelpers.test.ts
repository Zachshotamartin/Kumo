import type { VercelRequest } from "@vercel/node";
import { requireActor } from "../../server/api/_auth";
import { boardDocumentFromJson, emptyBoardDocument, liveblocksAdmin } from "../../server/api/_liveblocks";
import { databaseFetch, ensureActorProfile, supabaseAdmin } from "../../server/api/_supabase";

const mocks = vi.hoisted(() => ({
  verify: vi.fn(),
  createClient: vi.fn(),
  rpc: vi.fn(),
  Liveblocks: vi.fn(function MockLiveblocks(this: { secret?: string }, options: { secret: string }) {
    this.secret = options.secret;
  }),
  session: null as null | { id: string; last_seen_at: string; revoked_at: string | null },
  sessionLookupError: null as unknown,
  sessionInsertError: null as unknown,
  sessionUpdateError: null as unknown,
  sessionInsert: vi.fn(),
  sessionUpdate: vi.fn(),
}));

vi.mock("../../server/api/_firebaseAdmin", () => ({ adminAuth: () => ({ verifyIdToken: mocks.verify }) }));
vi.mock("@supabase/supabase-js", () => ({ createClient: mocks.createClient }));
vi.mock("@liveblocks/node", () => ({ Liveblocks: mocks.Liveblocks }));

describe("server clients and document helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.session = null;
    mocks.sessionLookupError = null;
    mocks.sessionInsertError = null;
    mocks.sessionUpdateError = null;
    delete process.env.FIREBASE_AUTH_EMULATOR_HOST;
    process.env.SUPABASE_URL = "https://auth-test.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role";
    mocks.verify.mockResolvedValue({ uid: "actor" });
    mocks.rpc.mockResolvedValue({
      data: {
        firebase_uid: "actor",
        email: "user@example.com",
        email_verified: true,
        display_name: "User",
        avatar_url: null,
        username: "user-123456789012",
        bio: "",
        discoverable: true,
        friend_request_policy: "everyone",
      },
      error: null,
    });
    mocks.createClient.mockReturnValue({
      rpc: mocks.rpc,
      from: () => ({
        select: () => ({
          eq: () => ({
            eq: () => ({
              maybeSingle: () => Promise.resolve({ data: mocks.session, error: mocks.sessionLookupError }),
            }),
          }),
        }),
        insert: (value: unknown) => {
          mocks.sessionInsert(value);
          return Promise.resolve({ error: mocks.sessionInsertError });
        },
        update: (value: unknown) => {
          mocks.sessionUpdate(value);
          return { eq: () => ({ eq: () => Promise.resolve({ error: mocks.sessionUpdateError }) }) };
        },
      }),
    });
  });

  it("requires and verifies bearer authentication", async () => {
    const request = { headers: {
      authorization: "Bearer firebase-token",
      "x-kumo-session-id": "session-1234567890",
    } } as unknown as VercelRequest;
    await expect(requireActor(request)).resolves.toEqual({ uid: "actor" });
    expect(mocks.verify).toHaveBeenCalledWith("firebase-token");
    await expect(requireActor({ headers: {} } as VercelRequest)).rejects.toThrow("Authentication required");
    mocks.verify.mockResolvedValueOnce({ uid: "unverified", email: "claimed@example.com", email_verified: false });
    await expect(requireActor(request)).rejects.toThrow("Authentication required");
    mocks.verify.mockResolvedValueOnce({ uid: "missing-claim", email: "claimed@example.com" });
    await expect(requireActor(request)).rejects.toThrow("Authentication required");

    process.env.FIREBASE_AUTH_EMULATOR_HOST = "127.0.0.1:9099";
    mocks.verify.mockResolvedValueOnce({ uid: "local", email: "local@example.com", email_verified: false });
    await expect(requireActor(request)).resolves.toMatchObject({ uid: "local" });
  });

  it("creates normalized Liveblocks storage documents", () => {
    expect(emptyBoardDocument("#fff")).toMatchObject({
      data: { schemaVersion: 5, backgroundColor: "#fff", nodes: { data: {} }, textCharacters: { data: {} } },
    });
    expect(boardDocumentFromJson({
      backgroundColor: "#000", nodes: { one: { id: "one", text: "hello" }, empty: null },
    })).toMatchObject({
      data: { backgroundColor: "#000", nodes: { data: { one: { data: { id: "one" } }, empty: { data: {} } } } },
    });
    expect(boardDocumentFromJson(null)).toMatchObject({ data: { backgroundColor: "#252629" } });
    expect(boardDocumentFromJson({
      textCharacters: { one: { id: "one", value: "A" }, empty: null },
    })).toMatchObject({ data: { textCharacters: { data: {
      one: { data: { id: "one", value: "A" } }, empty: { data: {} },
    } } } });
    expect(boardDocumentFromJson({ textCharacters: "invalid" })).toMatchObject({ data: { textCharacters: { data: {} } } });
  });

  it("validates and caches server clients while ensuring normalized profiles", async () => {
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    expect(() => supabaseAdmin()).toThrow("Supabase server environment variables are incomplete");
    process.env.SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role";
    expect(supabaseAdmin()).toBeTruthy();
    expect(mocks.createClient).toHaveBeenCalledWith(
      "https://example.supabase.co",
      "service-role",
      expect.objectContaining({ global: { fetch: databaseFetch } })
    );
    await expect(ensureActorProfile({ uid: "actor", email: " USER@Example.com ", name: "  User  " }))
      .resolves.toMatchObject({ uid: "actor", email: "user@example.com", displayName: "User" });
    expect(mocks.rpc).toHaveBeenCalledWith("ensure_kumo_profile", expect.objectContaining({
      p_firebase_uid: "actor",
      p_email: "user@example.com",
      p_email_verified: false,
      p_default_display_name: "User",
    }));

    delete process.env.LIVEBLOCKS_SECRET_KEY;
    expect(() => liveblocksAdmin()).toThrow("Liveblocks server environment variables are incomplete");
    process.env.LIVEBLOCKS_SECRET_KEY = "sk_test";
    expect(liveblocksAdmin()).toMatchObject({ secret: "sk_test" });
    expect(liveblocksAdmin()).toBe(liveblocksAdmin());
  });

  it("registers, refreshes, and rejects individually identified account sessions", async () => {
    const id = "session-1234567890";
    const request = { headers: {
      authorization: "Bearer firebase-token",
      "x-kumo-session-id": [id],
      "user-agent": "Kumo Test Browser",
    } } as unknown as VercelRequest;

    await expect(requireActor(request)).resolves.toMatchObject({ uid: "actor" });
    expect(mocks.sessionInsert).toHaveBeenCalledWith(expect.objectContaining({ id, user_id: "actor", user_agent: "Kumo Test Browser" }));

    mocks.session = { id, last_seen_at: new Date().toISOString(), revoked_at: null };
    await requireActor(request);
    expect(mocks.sessionUpdate).not.toHaveBeenCalled();

    mocks.session.last_seen_at = new Date(0).toISOString();
    await requireActor(request);
    expect(mocks.sessionUpdate).toHaveBeenCalledWith(expect.objectContaining({ last_seen_at: expect.any(String), user_agent: "Kumo Test Browser" }));

    mocks.session.revoked_at = new Date().toISOString();
    await expect(requireActor(request)).rejects.toThrow("Authentication required");
  });

  it("rejects malformed session ids and surfaces account-session storage errors", async () => {
    const id = "session-1234567890";
    const request = (sessionId: string) => ({ headers: {
      authorization: "Bearer firebase-token",
      "x-kumo-session-id": sessionId,
    } } as unknown as VercelRequest);
    await expect(requireActor({ headers: { authorization: "Bearer firebase-token" } } as VercelRequest)).rejects.toThrow("Authentication required");
    await expect(requireActor(request("short"))).rejects.toThrow("Authentication required");
    expect(mocks.sessionInsert).not.toHaveBeenCalled();

    mocks.sessionLookupError = new Error("lookup failed");
    await expect(requireActor(request(id))).rejects.toThrow("lookup failed");
    mocks.sessionLookupError = null;

    mocks.sessionInsertError = new Error("insert failed");
    await expect(requireActor(request(id))).rejects.toThrow("insert failed");
    mocks.sessionInsertError = null;

    mocks.sessionInsertError = Object.assign(new Error("profile not created yet"), { code: "23503" });
    await expect(requireActor(request(id))).resolves.toMatchObject({ uid: "actor" });
    mocks.sessionInsertError = null;

    mocks.session = { id, last_seen_at: new Date(0).toISOString(), revoked_at: null };
    mocks.sessionUpdateError = new Error("update failed");
    await expect(requireActor(request(id))).rejects.toThrow("update failed");
  });

  it("aborts stalled database requests at the shared server deadline", async () => {
    vi.useFakeTimers();
    const fetch = vi.spyOn(globalThis, "fetch").mockImplementation((_input, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
    }));
    try {
      const pending = databaseFetch("https://example.supabase.co/rest/v1/boards");
      const rejection = expect(pending).rejects.toMatchObject({ name: "AbortError" });
      await vi.advanceTimersByTimeAsync(15_000);
      await rejection;
    } finally {
      fetch.mockRestore();
      vi.useRealTimers();
    }
  });

  it("honors request and already-aborted upstream signals", async () => {
    const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("ok"));
    const request = new Request("https://example.supabase.co/rest/v1/boards");
    await databaseFetch(request);
    expect(fetch).toHaveBeenCalledWith(request, expect.objectContaining({ signal: expect.any(AbortSignal) }));
    const controller = new AbortController();
    controller.abort();
    await databaseFetch("https://example.supabase.co/rest/v1/boards", { signal: controller.signal });
    expect((fetch.mock.calls.at(-1)?.[1]?.signal as AbortSignal).aborted).toBe(true);
    fetch.mockRestore();
  });

  it("derives safe profile defaults and surfaces profile storage failures", async () => {
    await ensureActorProfile({ uid: "fallback", email: "person@example.com" });
    expect(mocks.rpc).toHaveBeenLastCalledWith("ensure_kumo_profile", expect.objectContaining({ p_default_display_name: "person" }));
    await ensureActorProfile({ uid: "anonymous" });
    expect(mocks.rpc).toHaveBeenLastCalledWith("ensure_kumo_profile", expect.objectContaining({
      p_email: "anonymous@firebase.local", p_default_display_name: "Kumo user",
    }));
    mocks.rpc.mockResolvedValueOnce({ data: null, error: new Error("profile unavailable") });
    await expect(ensureActorProfile({ uid: "failed" })).rejects.toThrow("profile unavailable");
  });
});
