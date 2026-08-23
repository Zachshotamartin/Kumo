import {
  consumeLocalGoogleRedirect,
  hasLocalGoogleRedirectResult,
  prepareLocalGoogleRedirect,
  usesLocalGoogleRedirect,
} from "./localGoogleRedirect";

const mocks = vi.hoisted(() => ({ credential: vi.fn((idToken: string) => ({ idToken })) }));

vi.mock("firebase/auth", () => ({
  GoogleAuthProvider: { credential: mocks.credential },
}));

const storage = () => {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  };
};

const jwt = (payload: Record<string, unknown>) => {
  const encoded = btoa(JSON.stringify(payload)).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  return `header.${encoded}.signature`;
};

describe("localhost Google redirects", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mocks.credential.mockClear();
  });

  it("uses the direct redirect only for plain-HTTP loopback origins", () => {
    expect(usesLocalGoogleRedirect({ protocol: "http:", hostname: "localhost" })).toBe(true);
    expect(usesLocalGoogleRedirect({ protocol: "http:", hostname: "127.0.0.1" })).toBe(true);
    expect(usesLocalGoogleRedirect({ protocol: "https:", hostname: "localhost" })).toBe(false);
    expect(usesLocalGoogleRedirect({ protocol: "https:", hostname: "kumo.example" })).toBe(false);
  });

  it("creates a stateful Firebase Google redirect for the exact localhost URL", async () => {
    const localStorage = storage();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      authUri: "https://accounts.google.com/o/oauth2/auth?redirect_uri=http%3A%2F%2Flocalhost%3A5175%2F%3Fboard%3Done&state=state-1&nonce=nonce-1",
    }), { status: 200 }));

    const redirect = await prepareLocalGoogleRedirect(
      "public-api-key",
      "http://localhost:5175/?board=one#old",
      localStorage
    );
    expect(redirect).toContain("accounts.google.com/o/oauth2/auth");
    expect(fetch).toHaveBeenCalledWith(
      expect.objectContaining({ pathname: "/v1/accounts:createAuthUri" }),
      expect.objectContaining({ method: "POST" })
    );
    expect(localStorage.getItem("kumo.googleRedirect")).toContain("state-1");
  });

  it("validates state and nonce before creating a Firebase credential", async () => {
    const localStorage = storage();
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => new Response(JSON.stringify({
      authUri: "https://accounts.google.com/o/oauth2/auth?redirect_uri=http%3A%2F%2Flocalhost%3A5175%2F&state=state-1&nonce=nonce-1",
    }), { status: 200 }));
    await prepareLocalGoogleRedirect("public-api-key", "http://localhost:5175/", localStorage);
    const token = jwt({ nonce: "nonce-1" });
    const result = consumeLocalGoogleRedirect(
      `http://localhost:5175/#state=state-1&id_token=${encodeURIComponent(token)}`,
      localStorage
    );
    expect(result).toEqual({ credential: { idToken: token }, returnUrl: "http://localhost:5175/" });
    expect(hasLocalGoogleRedirectResult("http://localhost:5175/#state=x&id_token=y")).toBe(true);
  });

  it("rejects forged, cancelled, and malformed redirects", async () => {
    const localStorage = storage();
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => new Response(JSON.stringify({
      authUri: "https://accounts.google.com/o/oauth2/auth?redirect_uri=http%3A%2F%2Flocalhost%3A5175%2F&state=state-1&nonce=nonce-1",
    }), { status: 200 }));
    await prepareLocalGoogleRedirect("public-api-key", "http://localhost:5175/", localStorage);
    expect(() => consumeLocalGoogleRedirect(
      `http://localhost:5175/#state=wrong&id_token=${jwt({ nonce: "nonce-1" })}`,
      localStorage
    )).toThrow("could not be verified");

    const cancelledStorage = storage();
    await prepareLocalGoogleRedirect("public-api-key", "http://localhost:5175/", cancelledStorage);
    expect(() => consumeLocalGoogleRedirect(
      "http://localhost:5175/#state=state-1&error=access_denied",
      cancelledStorage
    )).toThrow("cancelled or denied");
    expect(consumeLocalGoogleRedirect("http://localhost:5175/", storage())).toBeNull();
  });
});
