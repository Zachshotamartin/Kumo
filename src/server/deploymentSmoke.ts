export interface DeploymentSmokeResult {
  rootStatus: number;
  sessionStatus: number;
  boardsStatus: number;
}

export const DEPLOYMENT_RETRY_DELAYS_MS = [0, 250, 500, 1_000, 2_000, 4_000] as const;

const transientDeploymentStatus = (status: number) =>
  [404, 408, 425, 429].includes(status) || status >= 500;

const fetchDeploymentRoot = async (
  url: URL,
  fetcher: typeof fetch,
  wait: (delayMs: number) => Promise<void>
) => {
  let response: Response | undefined;
  let failure: unknown;
  for (const delay of DEPLOYMENT_RETRY_DELAYS_MS) {
    if (delay) await wait(delay);
    try {
      response = await fetcher(url, { redirect: "follow" });
      failure = undefined;
      if (response.ok || !transientDeploymentStatus(response.status)) return response;
    } catch (caught) {
      failure = caught;
    }
  }
  if (response) return response;
  throw failure;
};

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
  fetcher: typeof fetch = fetch,
  wait: (delayMs: number) => Promise<void> = (delayMs) => new Promise((resolve) => setTimeout(resolve, delayMs))
): Promise<DeploymentSmokeResult> => {
  const base = new URL(deploymentUrl);
  if (base.protocol !== "https:" && base.hostname !== "localhost") {
    throw new Error("Deployment smoke checks require HTTPS outside localhost.");
  }

  const root = await fetchDeploymentRoot(new URL("/", base), fetcher, wait);
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
