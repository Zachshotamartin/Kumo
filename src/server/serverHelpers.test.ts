import type { VercelRequest } from "@vercel/node";
import { requireActor } from "../../server/api/_auth";
import { boardDocumentFromJson, emptyBoardDocument, liveblocksAdmin } from "../../server/api/_liveblocks";
import { ensureActorProfile, supabaseAdmin } from "../../server/api/_supabase";

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
  });

  it("validates and caches server clients while ensuring normalized profiles", async () => {
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    expect(() => supabaseAdmin()).toThrow("Supabase server environment variables are incomplete");
    process.env.SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role";
    expect(supabaseAdmin()).toBeTruthy();
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
});
