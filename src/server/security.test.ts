import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  applyApiSecurityHeaders, enforceRateLimit, hashSecret, maximumEmailLength, openSessionGuestId,
  requestOrigin, validEmailAddress, validOpenSessionGuestNonce, verifySecret,
} from "../../server/api/_security";

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("../../server/api/_supabase", () => ({ supabaseAdmin: () => ({ rpc: mocks.rpc }) }));

const request = (headers: Record<string, string> = {}) => ({ headers }) as unknown as VercelRequest;
const response = () => {
  const result = {
    statusCode: 0, body: undefined as unknown, headers: {} as Record<string, string>,
    setHeader(name: string, value: string) { this.headers[name] = value; return this; },
    status(code: number) { this.statusCode = code; return this; },
    json(body: unknown) { this.body = body; return this; },
  };
  return result as unknown as VercelResponse & typeof result;
};

describe("API security helpers", () => {
  beforeEach(() => { vi.clearAllMocks(); delete process.env.PUBLIC_APP_URL; });

  it("accepts well-formed addresses, rejects malformed ones, and bounds their length", () => {
    for (const address of ["person@example.com", "first.last+tag@mail.example.co.uk", "a@b.cd"]) {
      expect(validEmailAddress(address)).toBe(true);
    }
    for (const address of ["", "person", "person@example", "person@.com", "person@example.", "a b@example.com", "person@ex ample.com"]) {
      expect(validEmailAddress(address)).toBe(false);
    }
    expect(validEmailAddress(`${"a".repeat(maximumEmailLength - 12)}@example.com`)).toBe(true);
    expect(validEmailAddress(`${"a".repeat(maximumEmailLength)}@example.com`)).toBe(false);
  });

  it("validates addresses in linear time on backtracking-prone input", () => {
    const started = performance.now();
    expect(validEmailAddress(`${"a".repeat(200)}@${"a".repeat(50)}`)).toBe(false);
    expect(performance.now() - started).toBeLessThan(1_000);
  });

  it("derives trusted request origins and stable guest identities", () => {
    process.env.PUBLIC_APP_URL = " https://kumo.example/ ";
    expect(requestOrigin(request())).toBe("https://kumo.example");
    delete process.env.PUBLIC_APP_URL;
    expect(requestOrigin(request({ "x-forwarded-proto": "http, https", "x-forwarded-host": "localhost:5175, proxy" }))).toBe("http://localhost:5175");
    expect(requestOrigin(request())).toBe("https://localhost:5175");
    expect(validOpenSessionGuestNonce("0123456789abcdef")).toBe(true);
    expect(validOpenSessionGuestNonce("short")).toBe(false);
    expect(openSessionGuestId("token", "0123456789abcdef")).toMatch(/^guest:[a-f0-9]{12}:[a-f0-9]{12}$/);
    expect(verifySecret("value", "short")).toBe(false);
    expect(verifySecret("wrong", hashSecret("value"))).toBe(false);
  });

  it("applies the complete API header policy and tolerates minimal response doubles", () => {
    const result = response();
    applyApiSecurityHeaders(result);
    expect(result.headers).toMatchObject({ "Cache-Control": "no-store", "X-Frame-Options": "DENY" });
    expect(() => applyApiSecurityHeaders({} as VercelResponse)).not.toThrow();
  });

  it("allows available buckets and rejects exhausted array buckets", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: { allowed: true, remaining: 4 }, error: null });
    const allowed = response();
    await expect(enforceRateLimit(request(), allowed, "scope", "actor")).resolves.toBe(true);
    expect(allowed.headers["X-RateLimit-Remaining"]).toBe("4");
    mocks.rpc.mockResolvedValueOnce({ data: null, error: null });
    await expect(enforceRateLimit(request(), response(), "scope", "actor")).resolves.toBe(true);

    mocks.rpc.mockResolvedValueOnce({ data: [{ allowed: false, remaining: -1 }], error: null });
    const denied = response();
    await expect(enforceRateLimit(request({ "x-forwarded-for": "1.2.3.4, proxy" }), denied, "scope", "actor", 2, 15)).resolves.toBe(false);
    expect(denied).toMatchObject({ statusCode: 429, body: { error: expect.stringContaining("Too many") } });
    expect(denied.headers["Retry-After"]).toBe("15");
  });

  it("surfaces rate-limit storage failures", async () => {
    const error = new Error("rate storage unavailable");
    mocks.rpc.mockResolvedValueOnce({ data: null, error });
    await expect(enforceRateLimit(request(), response(), "scope", "actor")).rejects.toBe(error);
  });
});
