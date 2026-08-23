export interface DeploymentSmokeResult {
  rootStatus: number;
  sessionStatus: number;
  boardsStatus: number;
}

const expectAuthenticationChallenge = async (response: Response, label: string) => {
  if (response.status !== 401) {
    throw new Error(`The deployed ${label} returned HTTP ${response.status} instead of an authentication challenge.`);
  }
  const payload = await response.json().catch(() => null) as { error?: unknown } | null;
  if (typeof payload?.error !== "string" || !/authentication required/i.test(payload.error)) {
    throw new Error(`The deployed ${label} did not return the expected authentication response.`);
  }
};

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
  await expectAuthenticationChallenge(session, "session API");

  // Loading this route also imports the board persistence and thumbnail graph.
  // Keep it in the deployed smoke test so Node-only ESM resolution failures are
  // caught on the preview before they can reach production.
  const boards = await fetcher(new URL("/api/boards", base), {
    method: "GET",
    redirect: "manual",
    headers: { accept: "application/json" },
  });
  await expectAuthenticationChallenge(boards, "boards API");

  return { rootStatus: root.status, sessionStatus: session.status, boardsStatus: boards.status };
};
