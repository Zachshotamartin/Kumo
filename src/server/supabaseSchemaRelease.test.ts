import {
  REQUIRED_SUPABASE_SCHEMA_RELEASE,
  schemaReleaseProbeUrl,
  verifySupabaseSchemaRelease,
} from "./supabaseSchemaRelease";

const response = (body: unknown, status = 200) => new Response(
  typeof body === "string" ? body : JSON.stringify(body),
  { status, headers: { "content-type": "application/json" } },
);

describe("Supabase schema release verification", () => {
  it("builds a bounded PostgREST release-marker query", () => {
    const url = schemaReleaseProbeUrl("https://example.supabase.co/path", "release-7");
    expect(url.origin + url.pathname).toBe("https://example.supabase.co/rest/v1/kumo_schema_releases");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      limit: "1",
      select: "version",
      version: "eq.release-7",
    });
  });

  it("uses the required release by default and authenticates with the service role", async () => {
    const fetchImpl = vi.fn(async () => response([
      { version: REQUIRED_SUPABASE_SCHEMA_RELEASE },
    ]));

    await expect(verifySupabaseSchemaRelease({
      fetchImpl,
      serviceRoleKey: "service-role",
      supabaseUrl: "https://example.supabase.co",
    })).resolves.toBe(REQUIRED_SUPABASE_SCHEMA_RELEASE);

    expect(fetchImpl).toHaveBeenCalledWith(
      expect.objectContaining({
        href: expect.stringContaining(`version=eq.${REQUIRED_SUPABASE_SCHEMA_RELEASE}`),
      }),
      {
        headers: {
          apikey: "service-role",
          authorization: "Bearer service-role",
        },
      },
    );
  });

  it.each([
    [[], "empty result"],
    [[{ version: "old" }], "wrong release"],
    [[{ version: "release-7" }, { version: "release-7" }], "duplicate markers"],
    [{ version: "release-7" }, "non-array response"],
  ])("rejects %s as an unapplied release (%s)", async (body, _label) => {
    await expect(verifySupabaseSchemaRelease({
      fetchImpl: async () => response(body),
      serviceRoleKey: "service-role",
      supabaseUrl: "https://example.supabase.co",
      version: "release-7",
    })).rejects.toThrow(
      "Remote Supabase schema release release-7 has not been applied. " +
      "Apply every Supabase migration through release-7 before deploying.",
    );
  });

  it("includes the remote error body when the marker endpoint is unavailable", async () => {
    await expect(verifySupabaseSchemaRelease({
      fetchImpl: async () => response({ code: "PGRST205", message: "table missing" }, 404),
      serviceRoleKey: "service-role",
      supabaseUrl: "https://example.supabase.co",
      version: "release-7",
    })).rejects.toThrow(
      'Remote Supabase schema release release-7 is unavailable (404). {"code":"PGRST205","message":"table missing"}',
    );
  });

  it("handles an unavailable endpoint with an empty response body", async () => {
    await expect(verifySupabaseSchemaRelease({
      fetchImpl: async () => response("", 503),
      serviceRoleKey: "service-role",
      supabaseUrl: "https://example.supabase.co",
      version: "release-7",
    })).rejects.toThrow("Remote Supabase schema release release-7 is unavailable (503).");
  });
});
