export const REQUIRED_SUPABASE_SCHEMA_RELEASE = "202608250002";

type SchemaReleaseProbeOptions = {
  fetchImpl?: typeof fetch;
  serviceRoleKey: string;
  supabaseUrl: string;
  version?: string;
};

const responseDetail = async (response: Response) => {
  const body = (await response.text()).trim();
  return body ? ` ${body}` : "";
};

export const schemaReleaseProbeUrl = (
  supabaseUrl: string,
  version = REQUIRED_SUPABASE_SCHEMA_RELEASE,
) => {
  const url = new URL("/rest/v1/kumo_schema_releases", supabaseUrl);
  url.searchParams.set("select", "version");
  url.searchParams.set("version", `eq.${version}`);
  url.searchParams.set("limit", "1");
  return url;
};

export const verifySupabaseSchemaRelease = async ({
  fetchImpl = fetch,
  serviceRoleKey,
  supabaseUrl,
  version = REQUIRED_SUPABASE_SCHEMA_RELEASE,
}: SchemaReleaseProbeOptions) => {
  const response = await fetchImpl(schemaReleaseProbeUrl(supabaseUrl, version), {
    headers: {
      apikey: serviceRoleKey,
      authorization: `Bearer ${serviceRoleKey}`,
    },
  });

  if (!response.ok) {
    throw new Error(
      `Remote Supabase schema release ${version} is unavailable (${response.status}).` +
      await responseDetail(response),
    );
  }

  const rows: unknown = await response.json();
  if (!Array.isArray(rows) || rows.length !== 1 || rows[0]?.version !== version) {
    throw new Error(
      `Remote Supabase schema release ${version} has not been applied. ` +
      `Apply supabase/migrations/${version}_reliability_release.sql before deploying.`,
    );
  }

  return version;
};
