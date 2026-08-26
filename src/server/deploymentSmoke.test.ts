import { DEPLOYMENT_RETRY_DELAYS_MS, verifyDeploymentSmoke } from "./deploymentSmoke";

const response = (body: string, status = 200, contentType = "text/html") => new Response(body, {
  status,
  headers: { "content-type": contentType },
});

describe("deployed preview smoke verification", () => {
  it("accepts a healthy client shell and protected session API", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(response('<!doctype html><div id="root"></div>'))
      .mockResolvedValueOnce(response('{"error":"Authentication required."}', 401, "application/json"))
      .mockResolvedValueOnce(response('{"error":"Authentication required."}', 401, "application/json"));
    await expect(verifyDeploymentSmoke("https://preview.example", fetcher)).resolves.toEqual({
      rootStatus: 200,
      sessionStatus: 401,
      boardsStatus: 401,
    });
    expect(fetcher).toHaveBeenNthCalledWith(1, new URL("https://preview.example/"), { redirect: "follow" });
    expect(fetcher).toHaveBeenNthCalledWith(2, new URL("https://preview.example/api/session"), {
      method: "POST",
      redirect: "manual",
      headers: { accept: "application/json" },
    });
    expect(fetcher).toHaveBeenNthCalledWith(3, new URL("https://preview.example/api/boards"), {
      method: "GET",
      redirect: "manual",
      headers: { accept: "application/json" },
    });
  });

  it("rejects insecure, missing, and accidentally public deployments", async () => {
    await expect(verifyDeploymentSmoke("http://preview.example", vi.fn())).rejects.toThrow("require HTTPS");
    const wait = vi.fn().mockResolvedValue(undefined);
    const missing = vi.fn().mockResolvedValue(response("missing", 404));
    await expect(verifyDeploymentSmoke("https://preview.example", missing, wait)).rejects.toThrow("HTTP 404");
    expect(missing).toHaveBeenCalledTimes(DEPLOYMENT_RETRY_DELAYS_MS.length);
    expect(wait.mock.calls.flat()).toEqual(DEPLOYMENT_RETRY_DELAYS_MS.slice(1));
    const missingShell = vi.fn().mockResolvedValue(response("<html></html>"));
    await expect(verifyDeploymentSmoke("https://preview.example", missingShell)).rejects.toThrow("Kumo client shell");
    const publicApi = vi.fn()
      .mockResolvedValueOnce(response('<title>Kumo</title>'))
      .mockResolvedValueOnce(response("{}", 200, "application/json"));
    await expect(verifyDeploymentSmoke("https://preview.example", publicApi)).rejects.toThrow("authentication challenge");
  });

  it("waits for a newly assigned deployment alias to become ready", async () => {
    const wait = vi.fn().mockResolvedValue(undefined);
    const fetcher = vi.fn()
      .mockRejectedValueOnce(new Error("alias DNS pending"))
      .mockResolvedValueOnce(response("building", 503))
      .mockResolvedValueOnce(response('<div id="root"></div>'))
      .mockResolvedValueOnce(response('{"error":"Authentication required."}', 401, "application/json"))
      .mockResolvedValueOnce(response('{"error":"Authentication required."}', 401, "application/json"));
    await expect(verifyDeploymentSmoke("https://preview.example", fetcher, wait)).resolves.toEqual({
      rootStatus: 200,
      sessionStatus: 401,
      boardsStatus: 401,
    });
    expect(wait).toHaveBeenNthCalledWith(1, 250);
    expect(wait).toHaveBeenNthCalledWith(2, 500);
  });

  it("uses bounded real-time backoff by default", async () => {
    vi.useFakeTimers();
    try {
      const fetcher = vi.fn()
        .mockResolvedValueOnce(response("alias pending", 404))
        .mockResolvedValueOnce(response('<title>Kumo</title>'))
        .mockResolvedValueOnce(response('{"error":"Authentication required."}', 401, "application/json"))
        .mockResolvedValueOnce(response('{"error":"Authentication required."}', 401, "application/json"));
      const verification = verifyDeploymentSmoke("https://preview.example", fetcher);
      await vi.advanceTimersByTimeAsync(250);
      await expect(verification).resolves.toEqual({ rootStatus: 200, sessionStatus: 401, boardsStatus: 401 });
    } finally {
      vi.useRealTimers();
    }
  });

  it("surfaces a network failure when deployment readiness retries are exhausted", async () => {
    const fetcher = vi.fn().mockRejectedValue(new Error("alias unavailable"));
    await expect(verifyDeploymentSmoke("https://preview.example", fetcher, vi.fn()))
      .rejects.toThrow("alias unavailable");
    expect(fetcher).toHaveBeenCalledTimes(DEPLOYMENT_RETRY_DELAYS_MS.length);
  });

  it("does not retry non-transient deployment failures", async () => {
    const fetcher = vi.fn().mockResolvedValue(response("forbidden", 403));
    await expect(verifyDeploymentSmoke("https://preview.example", fetcher, vi.fn()))
      .rejects.toThrow("HTTP 403");
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it("rejects malformed authentication payloads", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(response('<title>Kumo</title>'))
      .mockResolvedValueOnce(response("not-json", 401, "application/json"));
    await expect(verifyDeploymentSmoke("https://preview.example", fetcher)).rejects.toThrow("expected authentication response");
  });

  it("rejects a boards function that cannot load in the deployed runtime", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(response('<title>Kumo</title>'))
      .mockResolvedValueOnce(response('{"error":"Authentication required."}', 401, "application/json"))
      .mockResolvedValueOnce(response("FUNCTION_INVOCATION_FAILED", 500, "text/plain"));
    await expect(verifyDeploymentSmoke("https://preview.example", fetcher))
      .rejects.toThrow("boards API returned HTTP 500");
  });
});
