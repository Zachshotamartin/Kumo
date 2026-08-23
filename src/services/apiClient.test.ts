const authMock = vi.hoisted(() => ({
  currentUser: { getIdToken: vi.fn().mockResolvedValue("token") } as null | { getIdToken: () => Promise<string> },
}));

vi.mock("../config/firebase", () => ({ auth: authMock }));

import { authenticatedFetch } from "./apiClient";

describe("authenticatedFetch", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    authMock.currentUser = { getIdToken: vi.fn().mockResolvedValue("token") };
  });

  it("adds authentication and parses JSON responses", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({ ok: true }),
    }));
    await expect(authenticatedFetch("/api/test", { method: "POST", body: "{}" }))
      .resolves.toEqual({ ok: true });
    expect(fetch).toHaveBeenCalledWith("/api/test", expect.objectContaining({
      headers: expect.objectContaining({ Authorization: "Bearer token" }),
    }));
  });

  it("handles no-content, API errors, and missing authentication", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 204 }));
    await expect(authenticatedFetch("/api/test")).resolves.toBeUndefined();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      status: 409,
      json: vi.fn().mockResolvedValue({ error: "Conflict" }),
    }));
    await expect(authenticatedFetch("/api/test")).rejects.toThrow("Conflict");
    authMock.currentUser = null;
    await expect(authenticatedFetch("/api/test")).rejects.toThrow("Authentication required");
  });
});
