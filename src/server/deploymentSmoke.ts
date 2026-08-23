export interface DeploymentSmokeResult {
  rootStatus: number;
  sessionStatus: number;
}

export const verifyDeploymentSmoke = async (
  deploymentUrl: string,
  fetcher: typeof fetch = fetch
): Promise<DeploymentSmokeResult> => {
  const base = new URL(deploymentUrl);
  if (base.protocol !== "https:" && base.hostname !== "localhost") {
    throw new Error("Deployment smoke checks require HTTPS outside localhost.");
  }

  const root = await fetcher(new URL("/", base), { redirect: "follow" });
  if (!root.ok) throw new Error(`The deployed application returned HTTP ${root.status}.`);
  const markup = await root.text();
  if (!/<(?:div[^>]+id=["']root["']|title>Kumo)/i.test(markup)) {
    throw new Error("The deployed application did not return the Kumo client shell.");
  }

  const session = await fetcher(new URL("/api/session", base), {
    method: "POST",
    redirect: "manual",
    headers: { accept: "application/json" },
  });
  if (session.status !== 401) {
    throw new Error(`The deployed session API returned HTTP ${session.status} instead of an authentication challenge.`);
  }
  const payload = await session.json().catch(() => null) as { error?: unknown } | null;
  if (typeof payload?.error !== "string" || !/authentication required/i.test(payload.error)) {
    throw new Error("The deployed session API did not return the expected authentication response.");
  }

  return { rootStatus: root.status, sessionStatus: session.status };
};
