const authMock = vi.hoisted(() => ({
  currentUser: { getIdToken: vi.fn().mockResolvedValue("token") } as null | { getIdToken: () => Promise<string> },
}));

vi.mock("../config/firebase", () => ({ auth: authMock }));

import { ApiError, authenticatedFetch, authenticatedRequest, clientSessionId, publicFetch } from "./apiClient";

describe("authenticatedFetch", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    authMock.currentUser = { getIdToken: vi.fn().mockResolvedValue("token") };
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
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

  it("creates and reuses a cryptographically secure fallback device-session id", () => {
    const getRandomValues = vi.fn((bytes: Uint8Array) => {
      bytes.set(Array.from({ length: bytes.length }, (_, index) => index));
      return bytes;
    });
    vi.stubGlobal("crypto", { getRandomValues });
    const created = clientSessionId();
    expect(created).toBe("000102030405060708090a0b0c0d0e0f");
    expect(getRandomValues).toHaveBeenCalledWith(expect.any(Uint8Array));
    expect(clientSessionId()).toBe(created);
  });

  it("replaces malformed persisted IDs and survives blocked browser storage", () => {
    localStorage.setItem("kumo:account-session-id", "short");
    const replacement = clientSessionId();
    expect(replacement).toMatch(/^[a-zA-Z0-9-]{16,100}$/);
    expect(replacement).not.toBe("short");

    const getItem = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new DOMException("blocked"); });
    expect(clientSessionId()).toBe(replacement);
    getItem.mockRestore();

    localStorage.clear();
    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new DOMException("blocked"); });
    expect(clientSessionId()).toMatch(/^[a-zA-Z0-9-]{16,100}$/);
    setItem.mockRestore();
  });

  it("creates an in-memory session when storage is blocked before initialization", async () => {
    vi.resetModules();
    const getItem = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new DOMException("blocked"); });
    const fresh = await import("./apiClient");
    expect(fresh.clientSessionId()).toMatch(/^[a-zA-Z0-9-]{16,100}$/);
    getItem.mockRestore();
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

  it("aborts an authenticated API request at the shared client deadline", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn().mockImplementation((_input, init: RequestInit) => new Promise((_resolve, reject) => {
      init.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
    })));
    try {
      const pending = authenticatedFetch("/api/stalled");
      const rejection = expect(pending).rejects.toMatchObject({ name: "AbortError" });
      await vi.advanceTimersByTimeAsync(15_000);
      await rejection;
    } finally {
      vi.useRealTimers();
    }
  });

  it("preserves error details and falls back when an error body cannot be parsed", async () => {
    const explicit = new ApiError("Conflict", 409, { error: "Conflict", field: "title" });
    expect(explicit).toMatchObject({ name: "ApiError", message: "Conflict", status: 409, details: { field: "title" } });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      json: vi.fn().mockRejectedValue(new SyntaxError("invalid json")),
    }));
    await expect(authenticatedRequest("/api/test")).rejects.toMatchObject({
      name: "ApiError",
      message: "Request failed with status 503.",
      status: 503,
      details: null,
    });
  });

  it("merges caller headers and propagates caller cancellation", async () => {
    const controller = new AbortController();
    controller.abort();
    vi.stubGlobal("fetch", vi.fn().mockImplementation((_input, init: RequestInit) => {
      expect(init.signal?.aborted).toBe(true);
      return Promise.reject(new DOMException("Aborted", "AbortError"));
    }));
    await expect(authenticatedRequest("/api/test", { signal: controller.signal, headers: { "X-Test": "yes" } }))
      .rejects.toMatchObject({ name: "AbortError" });
    expect(fetch).toHaveBeenCalledWith("/api/test", expect.objectContaining({
      headers: expect.objectContaining({ Authorization: "Bearer token", "X-Test": "yes", "X-Kumo-Session-Id": expect.any(String) }),
    }));
  });

  it("uses the E2E token only on the dedicated harness paths", async () => {
    vi.stubEnv("VITE_E2E", "true");
    window.history.replaceState({}, "", "/social-e2e.html");
    const getIdToken = vi.fn().mockResolvedValue("firebase-token");
    authMock.currentUser = { getIdToken };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 204 }));
    await authenticatedFetch("/api/test");
    expect(getIdToken).not.toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledWith("/api/test", expect.objectContaining({ headers: expect.objectContaining({ Authorization: "Bearer kumo-e2e-token" }) }));
  });

  it("supports public JSON, no-content, and error responses", async () => {
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: vi.fn().mockResolvedValue({ public: true }) })
      .mockResolvedValueOnce({ ok: true, status: 204 })
      .mockResolvedValueOnce({ ok: false, status: 400, json: vi.fn().mockResolvedValue({ error: "Bad request" }) })
      .mockResolvedValueOnce({ ok: false, status: 500, json: vi.fn().mockResolvedValue({}) })
      .mockResolvedValueOnce({ ok: false, status: 502, json: vi.fn().mockRejectedValue(new SyntaxError("invalid")) }));
    await expect(publicFetch("/public", { method: "POST", body: "{}", headers: { "X-Test": "yes" } })).resolves.toEqual({ public: true });
    expect(fetch).toHaveBeenNthCalledWith(1, "/public", expect.objectContaining({ headers: { "Content-Type": "application/json", "X-Test": "yes" } }));
    await expect(publicFetch("/public-empty")).resolves.toBeUndefined();
    await expect(publicFetch("/public-bad")).rejects.toMatchObject({ message: "Bad request", status: 400 });
    await expect(publicFetch("/public-fallback")).rejects.toThrow("Request failed with status 500");
    await expect(publicFetch("/public-invalid-error")).rejects.toMatchObject({ message: "Request failed with status 502.", details: null });
  });
});
