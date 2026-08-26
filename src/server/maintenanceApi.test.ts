import type { VercelRequest, VercelResponse } from "@vercel/node";
import handler, { validCronAuthorization } from "../../server/api/handlers/maintenance";

const mocks = vi.hoisted(() => ({ run: vi.fn() }));
vi.mock("../../server/api/_lifecycle", () => ({ runLifecycleMaintenance: mocks.run }));

const response = () => {
  const result = {
    statusCode: 0,
    body: undefined as unknown,
    headers: {} as Record<string, string>,
    status(code: number) { this.statusCode = code; return this; },
    json(body: unknown) { this.body = body; return this; },
    setHeader(name: string, value: string) { this.headers[name] = value; return this; },
    end() { return this; },
  };
  return result as unknown as VercelResponse & typeof result;
};

describe("lifecycle maintenance API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = "cron-secret";
    mocks.run.mockResolvedValue({ accountsDeleted: 1, boardsPurged: 2 });
  });

  afterEach(() => { delete process.env.CRON_SECRET; });

  it("compares cron credentials using exact timing-safe values", () => {
    expect(validCronAuthorization("Bearer cron-secret")).toBe(true);
    expect(validCronAuthorization("Bearer wrong")).toBe(false);
    expect(validCronAuthorization(["Bearer cron-secret"])).toBe(false);
    expect(validCronAuthorization(undefined)).toBe(false);
    expect(validCronAuthorization("Bearer cron-secret", "   ")).toBe(false);
    expect(validCronAuthorization("Bearer cron-secret", " cron-secret ")).toBe(true);
  });

  it("runs authorized GET and POST maintenance requests", async () => {
    for (const method of ["GET", "POST"]) {
      const reply = response();
      await handler({ method, headers: { authorization: "Bearer cron-secret" } } as VercelRequest, reply);
      expect(reply).toMatchObject({ statusCode: 200, body: { accountsDeleted: 1, boardsPurged: 2 } });
    }
  });

  it("rejects missing authorization and unsupported methods", async () => {
    const unauthorized = response();
    await handler({ method: "GET", headers: {} } as VercelRequest, unauthorized);
    expect(unauthorized.statusCode).toBe(401);

    const method = response();
    await handler({ method: "DELETE", headers: { authorization: "Bearer cron-secret" } } as VercelRequest, method);
    expect(method.statusCode).toBe(405);
    expect(mocks.run).not.toHaveBeenCalled();
  });

  it("returns a stable server error when maintenance fails", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.run.mockRejectedValueOnce(new Error("database failed"));
    const reply = response();
    await handler({ method: "POST", headers: { authorization: "Bearer cron-secret" } } as VercelRequest, reply);
    expect(reply).toMatchObject({ statusCode: 500, body: { error: "Lifecycle maintenance could not complete." } });
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });
});
