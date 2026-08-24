import { authenticatedFetch } from "./apiClient";
import {
  getProfile,
  listFriendships,
  mutateFriendship,
  searchProfiles,
  updateProfile,
} from "./socialRepository";

vi.mock("./apiClient", () => ({ authenticatedFetch: vi.fn() }));

describe("social repository", () => {
  beforeEach(() => vi.clearAllMocks());

  it("loads the current profile and encoded public profile routes", async () => {
    vi.mocked(authenticatedFetch)
      .mockResolvedValueOnce({ profile: { id: "self" } })
      .mockResolvedValueOnce({ profile: { id: "friend" } });
    await expect(getProfile()).resolves.toEqual({ id: "self" });
    await expect(getProfile("alex name")).resolves.toEqual({ id: "friend" });
    expect(authenticatedFetch).toHaveBeenNthCalledWith(1, "/api/profile");
    expect(authenticatedFetch).toHaveBeenNthCalledWith(2, "/api/profile?username=alex%20name");
  });

  it("updates profiles and loads friendship groups", async () => {
    vi.mocked(authenticatedFetch)
      .mockResolvedValueOnce({ profile: { username: "avery" } })
      .mockResolvedValueOnce({ friends: [], incoming: [], outgoing: [], blocked: [] });
    await updateProfile({ displayName: "Avery", discoverable: false });
    expect(authenticatedFetch).toHaveBeenNthCalledWith(1, "/api/profile", {
      method: "PATCH",
      body: JSON.stringify({ displayName: "Avery", discoverable: false }),
    });
    await expect(listFriendships()).resolves.toEqual({ friends: [], incoming: [], outgoing: [], blocked: [] });
  });

  it("searches profiles only after two characters and mutates friendship state", async () => {
    await expect(searchProfiles("a")).resolves.toEqual([]);
    expect(authenticatedFetch).not.toHaveBeenCalled();
    vi.mocked(authenticatedFetch)
      .mockResolvedValueOnce({ results: [{ id: "friend" }] })
      .mockResolvedValueOnce({ relationship: "outgoing" });
    await expect(searchProfiles(" Alex ")).resolves.toEqual([{ id: "friend" }]);
    expect(authenticatedFetch).toHaveBeenNthCalledWith(1, "/api/friends?query=Alex");
    await expect(mutateFriendship("friend", "request")).resolves.toBe("outgoing");
    expect(authenticatedFetch).toHaveBeenNthCalledWith(2, "/api/friends", {
      method: "POST",
      body: JSON.stringify({ targetUid: "friend", action: "request" }),
    });
  });
});
