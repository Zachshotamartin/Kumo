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
}));

vi.mock("../../server/api/_firebaseAdmin", () => ({ adminAuth: () => ({ verifyIdToken: mocks.verify }) }));
vi.mock("@supabase/supabase-js", () => ({ createClient: mocks.createClient }));
vi.mock("@liveblocks/node", () => ({ Liveblocks: mocks.Liveblocks }));

describe("server clients and document helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.verify.mockResolvedValue({ uid: "actor" });
    mocks.rpc.mockResolvedValue({
      data: {
        firebase_uid: "actor",
        email: "user@example.com",
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
    });
  });

  it("requires and verifies bearer authentication", async () => {
    const request = { headers: { authorization: "Bearer firebase-token" } } as VercelRequest;
    await expect(requireActor(request)).resolves.toEqual({ uid: "actor" });
    expect(mocks.verify).toHaveBeenCalledWith("firebase-token");
    await expect(requireActor({ headers: {} } as VercelRequest)).rejects.toThrow("Authentication required");
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
      p_default_display_name: "User",
    }));

    delete process.env.LIVEBLOCKS_SECRET_KEY;
    expect(() => liveblocksAdmin()).toThrow("Liveblocks server environment variables are incomplete");
    process.env.LIVEBLOCKS_SECRET_KEY = "sk_test";
    expect(liveblocksAdmin()).toMatchObject({ secret: "sk_test" });
    expect(liveblocksAdmin()).toBe(liveblocksAdmin());
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
