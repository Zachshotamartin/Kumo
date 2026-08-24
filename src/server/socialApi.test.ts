import type { VercelRequest, VercelResponse } from "@vercel/node";
import friendsHandler from "../../server/api/handlers/friends";
import profileHandler from "../../server/api/handlers/profile";

const mocks = vi.hoisted(() => ({
  actor: { uid: "actor", email: "actor@example.com" },
  requireActor: vi.fn(),
  ensureProfile: vi.fn(),
  friendshipBetween: vi.fn(),
  friendshipRows: vi.fn(),
  getProfilesByIds: vi.fn(),
  getProfileById: vi.fn(),
  getProfileByUsername: vi.fn(),
  publicBoards: vi.fn(),
  rpc: vi.fn(),
  updateResult: vi.fn(),
  insert: vi.fn(),
  searchRows: [] as Array<Record<string, unknown>>,
}));

vi.mock("../../server/api/_auth", () => ({ requireActor: mocks.requireActor }));
vi.mock("../../server/api/_boards", () => ({ publicBoardsForOwner: mocks.publicBoards }));
vi.mock("../../server/api/_supabase", () => ({
  ensureActorProfile: mocks.ensureProfile,
  supabaseAdmin: () => ({
    rpc: mocks.rpc,
    from: (table: string) => {
      if (table === "audit_events") return { insert: mocks.insert };
      return {
        select: () => ({
          eq: () => ({
            ilike: () => ({ limit: vi.fn().mockResolvedValue({ data: mocks.searchRows, error: null }) }),
          }),
        }),
        update: () => ({
          eq: () => ({
            select: () => ({ single: mocks.updateResult }),
          }),
        }),
      };
    },
  }),
}));
vi.mock("../../server/api/_profiles", () => ({
  PROFILE_COLUMNS: "profile-columns",
  friendshipBetween: mocks.friendshipBetween,
  friendshipRowsForActor: mocks.friendshipRows,
  getProfilesByIds: mocks.getProfilesByIds,
  getProfileById: mocks.getProfileById,
  getProfileByUsername: mocks.getProfileByUsername,
  otherUserId: (row: { user_low_id: string; user_high_id: string }, actorUid: string) =>
    row.user_low_id === actorUid ? row.user_high_id : row.user_low_id,
  relationshipFor: (row: { status: string; requested_by: string | null; blocked_by: string | null } | null, actorUid: string) => {
    if (!row) return "none";
    if (row.status === "accepted") return "friend";
    if (row.status === "blocked") return row.blocked_by === actorUid ? "blocked" : "hidden";
    return row.requested_by === actorUid ? "outgoing" : "incoming";
  },
  profileSummary: (profile: Record<string, unknown>, relationship = "none") => ({
    id: profile.firebase_uid,
    username: profile.username,
    displayName: profile.display_name,
    bio: profile.bio,
    avatarUrl: profile.avatar_url,
    relationship,
  }),
}));

const row = (uid: string, name: string, username = uid) => ({
  firebase_uid: uid,
  email: `${uid}@example.com`,
  display_name: name,
  avatar_url: null,
  username,
  bio: `${name} builds things.`,
  discoverable: true,
  friend_request_policy: "everyone",
  created_at: new Date(0).toISOString(),
  updated_at: new Date(1).toISOString(),
});

const relation = (
  other: string,
  status: "pending" | "accepted" | "blocked",
  requestedBy: string | null = null,
  blockedBy: string | null = null
) => ({
  user_low_id: "actor" < other ? "actor" : other,
  user_high_id: "actor" < other ? other : "actor",
  status,
  requested_by: requestedBy,
  blocked_by: blockedBy,
  created_at: "",
  updated_at: "",
  responded_at: null,
});

const response = () => {
  const result = {
    statusCode: 0,
    body: undefined as unknown,
    status(code: number) { this.statusCode = code; return this; },
    json(body: unknown) { this.body = body; return this; },
    send(body: unknown) { this.body = body; return this; },
    setHeader() { return this; },
  };
  return result as unknown as VercelResponse & typeof result;
};

const request = (method: string, body: Record<string, unknown> = {}, query: Record<string, string> = {}) => ({
  method,
  body,
  query,
  headers: { authorization: "Bearer token" },
} as unknown as VercelRequest);

describe("profile API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireActor.mockResolvedValue(mocks.actor);
    mocks.ensureProfile.mockResolvedValue(undefined);
    mocks.getProfileById.mockResolvedValue(row("actor", "Avery", "avery"));
    mocks.getProfileByUsername.mockResolvedValue(row("friend", "Alex", "alex"));
    mocks.friendshipRows.mockResolvedValue([relation("friend", "accepted", "actor")]);
    mocks.friendshipBetween.mockResolvedValue(relation("friend", "accepted", "actor"));
    mocks.publicBoards.mockResolvedValue([{ id: "public", title: "Public board" }]);
    mocks.updateResult.mockResolvedValue({ data: row("actor", "Avery Updated", "avery"), error: null });
    mocks.insert.mockResolvedValue({ error: null });
  });

  it("returns editable private settings only for the current profile", async () => {
    const own = response();
    await profileHandler(request("GET"), own);
    expect(own.statusCode).toBe(200);
    expect(own.body).toMatchObject({
      profile: {
        id: "actor",
        editable: true,
        email: "actor@example.com",
        discoverable: true,
        friendRequestPolicy: "everyone",
        friendCount: 1,
        publicBoardCount: 1,
      },
    });

    const other = response();
    await profileHandler(request("GET", {}, { username: "alex" }), other);
    expect(other.body).toMatchObject({ profile: { id: "friend", editable: false, relationship: "friend" } });
    expect((other.body as { profile: Record<string, unknown> }).profile).not.toHaveProperty("email");
  });

  it("hides profiles from people they blocked", async () => {
    mocks.friendshipBetween.mockResolvedValueOnce(relation("friend", "blocked", null, "friend"));
    const reply = response();
    await profileHandler(request("GET", {}, { username: "alex" }), reply);
    expect(reply.statusCode).toBe(404);
    expect(reply.body).toEqual({ error: "Profile not found." });
  });

  it("validates and saves editable profile fields", async () => {
    const invalid = response();
    await profileHandler(request("PATCH", { username: "Not Valid" }), invalid);
    expect(invalid.statusCode).toBe(400);

    const saved = response();
    await profileHandler(request("PATCH", {
      displayName: "Avery Updated",
      username: "avery",
      bio: "Building connected boards.",
      avatarUrl: "https://images.example/avatar.png",
      discoverable: false,
      friendRequestPolicy: "friends_of_friends",
    }), saved);
    expect(saved.statusCode).toBe(200);
    expect(saved.body).toMatchObject({ profile: { displayName: "Avery Updated", editable: true } });
    expect(mocks.insert).toHaveBeenCalledWith(expect.objectContaining({ event_type: "profile.updated" }));
  });

  it("reports username conflicts and database failures with distinct statuses", async () => {
    mocks.updateResult.mockResolvedValueOnce({ data: null, error: { code: "23505", message: "duplicate" } });
    const conflict = response();
    await profileHandler(request("PATCH", { username: "already-used" }), conflict);
    expect(conflict.statusCode).toBe(409);

    mocks.getProfileById.mockRejectedValueOnce({ code: "PGRST000", message: "database offline" });
    const unavailable = response();
    await profileHandler(request("GET"), unavailable);
    expect(unavailable.statusCode).toBe(500);
  });
});

describe("friends API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireActor.mockResolvedValue(mocks.actor);
    mocks.ensureProfile.mockResolvedValue(undefined);
    mocks.rpc.mockResolvedValue({ error: null });
    const rows = [
      relation("friend", "accepted", "actor"),
      relation("incoming", "pending", "incoming"),
      relation("outgoing", "pending", "actor"),
      relation("blocked", "blocked", null, "actor"),
      relation("hidden", "blocked", null, "hidden"),
    ];
    mocks.friendshipRows.mockResolvedValue(rows);
    mocks.getProfilesByIds.mockResolvedValue(new Map([
      ["friend", row("friend", "Friend")],
      ["incoming", row("incoming", "Incoming")],
      ["outgoing", row("outgoing", "Outgoing")],
      ["blocked", row("blocked", "Blocked")],
    ]));
    mocks.friendshipBetween.mockResolvedValue(relation("friend", "accepted", "actor"));
    mocks.searchRows = [row("friend", "Friend"), row("hidden", "Hidden")];
  });

  it("groups accepted, incoming, outgoing, and actor-created blocks", async () => {
    const reply = response();
    await friendsHandler(request("GET"), reply);
    expect(reply.statusCode).toBe(200);
    expect(reply.body).toMatchObject({
      friends: [expect.objectContaining({ id: "friend", relationship: "friend" })],
      incoming: [expect.objectContaining({ id: "incoming", relationship: "incoming" })],
      outgoing: [expect.objectContaining({ id: "outgoing", relationship: "outgoing" })],
      blocked: [expect.objectContaining({ id: "blocked", relationship: "blocked" })],
    });
  });

  it("searches discoverable names and omits profiles that blocked the actor", async () => {
    const reply = response();
    await friendsHandler(request("GET", {}, { query: "fr" }), reply);
    expect(reply.statusCode).toBe(200);
    expect(reply.body).toEqual({ results: [expect.objectContaining({ id: "friend" })] });
  });

  it("runs validated friendship transitions and returns the resulting relationship", async () => {
    const accepted = response();
    await friendsHandler(request("POST", { action: "accept", targetUid: "friend" }), accepted);
    expect(mocks.rpc).toHaveBeenCalledWith("mutate_kumo_friendship", {
      p_actor_id: "actor",
      p_target_id: "friend",
      p_action: "accept",
    });
    expect(accepted.body).toEqual({ targetUid: "friend", relationship: "friend" });

    const invalid = response();
    await friendsHandler(request("POST", { action: "wave", targetUid: "friend" }), invalid);
    expect(invalid.statusCode).toBe(400);
  });

  it("returns safe conflict messages for rejected policy transitions", async () => {
    mocks.rpc.mockResolvedValueOnce({
      error: { code: "P0001", message: "This profile only accepts requests from friends of friends" },
    });
    const reply = response();
    await friendsHandler(request("POST", { action: "request", targetUid: "friend" }), reply);
    expect(reply.statusCode).toBe(409);
    expect(reply.body).toEqual({ error: "This profile only accepts requests from friends of friends" });
  });
});
