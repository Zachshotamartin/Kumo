import {
  acceptedFriends,
  friendshipBetween,
  friendshipRowsForActor,
  getProfileById,
  getProfileByUsername,
  getProfilesByIds,
  otherUserId,
  profileSummary,
  relationshipFor,
} from "../../api/_profiles";

const mocks = vi.hoisted(() => ({ from: vi.fn() }));

vi.mock("../../api/_supabase", () => ({ supabaseAdmin: () => ({ from: mocks.from }) }));

const profile = {
  firebase_uid: "alex",
  email: "alex@example.com",
  display_name: "Alex Rivera",
  avatar_url: null,
  username: "alex",
  bio: "Builder",
  discoverable: true,
  friend_request_policy: "everyone" as const,
  created_at: "",
  updated_at: "",
};

const relation = (status: "pending" | "accepted" | "blocked", requestedBy: string | null, blockedBy: string | null) => ({
  user_low_id: "alex",
  user_high_id: "zach",
  status,
  requested_by: requestedBy,
  blocked_by: blockedBy,
  created_at: "",
  updated_at: "",
  responded_at: null,
});

describe("profile relationship helpers", () => {
  beforeEach(() => vi.clearAllMocks());

  it("maps canonical relationship rows from either participant's perspective", () => {
    expect(otherUserId(relation("accepted", "alex", null), "alex")).toBe("zach");
    expect(otherUserId(relation("accepted", "alex", null), "zach")).toBe("alex");
    expect(relationshipFor(null, "alex")).toBe("none");
    expect(relationshipFor(relation("pending", "alex", null), "alex")).toBe("outgoing");
    expect(relationshipFor(relation("pending", "alex", null), "zach")).toBe("incoming");
    expect(relationshipFor(relation("accepted", "alex", null), "zach")).toBe("friend");
    expect(relationshipFor(relation("blocked", null, "alex"), "alex")).toBe("blocked");
    expect(relationshipFor(relation("blocked", null, "alex"), "zach")).toBe("hidden");
  });

  it("exposes only the public profile summary fields", () => {
    expect(profileSummary(profile, "friend")).toEqual({
      id: "alex",
      username: "alex",
      displayName: "Alex Rivera",
      bio: "Builder",
      avatarUrl: null,
      relationship: "friend",
    });
  });

  it("loads both canonical sides of the actor's bounded relationship list", async () => {
    const low = relation("accepted", "alex", null);
    const high = { ...relation("pending", "zach", null), user_low_id: "amy", user_high_id: "alex" };
    const builder = (data: unknown[]) => ({
      select: () => ({ eq: () => ({ limit: vi.fn().mockResolvedValue({ data, error: null }) }) }),
    });
    mocks.from.mockReturnValueOnce(builder([low])).mockReturnValueOnce(builder([high]));
    await expect(friendshipRowsForActor("alex")).resolves.toEqual([low, high]);

    mocks.from.mockReturnValueOnce(builder([low])).mockReturnValueOnce(builder([high]));
    await expect(acceptedFriends("alex")).resolves.toEqual(new Set(["zach"]));
  });

  it("loads pair and profile records through service-role-only queries", async () => {
    mocks.from.mockReturnValueOnce({
      select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: vi.fn().mockResolvedValue({ data: relation("accepted", "alex", null), error: null }) }) }) }),
    });
    await expect(friendshipBetween("zach", "alex")).resolves.toMatchObject({ status: "accepted" });

    mocks.from.mockReturnValueOnce({
      select: () => ({ in: vi.fn().mockResolvedValue({ data: [profile], error: null }) }),
    });
    await expect(getProfilesByIds(["alex", "alex"])).resolves.toEqual(new Map([["alex", profile]]));
    await expect(getProfilesByIds([])).resolves.toEqual(new Map());

    mocks.from.mockReturnValueOnce({
      select: () => ({ ilike: () => ({ maybeSingle: vi.fn().mockResolvedValue({ data: profile, error: null }) }) }),
    });
    await expect(getProfileByUsername("alex")).resolves.toEqual(profile);

    mocks.from.mockReturnValueOnce({
      select: () => ({ eq: () => ({ maybeSingle: vi.fn().mockResolvedValue({ data: profile, error: null }) }) }),
    });
    await expect(getProfileById("alex")).resolves.toEqual(profile);
  });

  it("surfaces database errors instead of returning partial social data", async () => {
    const builder = (error: Error | null) => ({
      select: () => ({ eq: () => ({ limit: vi.fn().mockResolvedValue({ data: [], error }) }) }),
    });
    mocks.from.mockReturnValueOnce(builder(new Error("offline"))).mockReturnValueOnce(builder(null));
    await expect(friendshipRowsForActor("alex")).rejects.toThrow("offline");
  });
});
