import { verifyDeploymentSmoke } from "./deploymentSmoke";

const response = (body: string, status = 200, contentType = "text/html") => new Response(body, {
  status,
  headers: { "content-type": contentType },
});

describe("deployed preview smoke verification", () => {
  it("accepts a healthy client shell and protected session API", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(response('<!doctype html><div id="root"></div>'))
      .mockResolvedValueOnce(response('{"error":"Authentication required."}', 401, "application/json"));
    await expect(verifyDeploymentSmoke("https://preview.example", fetcher)).resolves.toEqual({
      rootStatus: 200,
      sessionStatus: 401,
    });
    expect(fetcher).toHaveBeenNthCalledWith(1, new URL("https://preview.example/"), { redirect: "follow" });
    expect(fetcher).toHaveBeenNthCalledWith(2, new URL("https://preview.example/api/session"), {
      method: "POST",
      redirect: "manual",
      headers: { accept: "application/json" },
    });
  });

  it("rejects insecure, missing, and accidentally public deployments", async () => {
    await expect(verifyDeploymentSmoke("http://preview.example", vi.fn())).rejects.toThrow("require HTTPS");
    await expect(verifyDeploymentSmoke("https://preview.example", vi.fn().mockResolvedValue(response("missing", 404)))).rejects.toThrow("HTTP 404");
    const missingShell = vi.fn().mockResolvedValue(response("<html></html>"));
    await expect(verifyDeploymentSmoke("https://preview.example", missingShell)).rejects.toThrow("Kumo client shell");
    const publicApi = vi.fn()
      .mockResolvedValueOnce(response('<title>Kumo</title>'))
      .mockResolvedValueOnce(response("{}", 200, "application/json"));
    await expect(verifyDeploymentSmoke("https://preview.example", publicApi)).rejects.toThrow("authentication challenge");
  });

  it("rejects malformed authentication payloads", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(response('<title>Kumo</title>'))
      .mockResolvedValueOnce(response("not-json", 401, "application/json"));
    await expect(verifyDeploymentSmoke("https://preview.example", fetcher)).rejects.toThrow("expected authentication response");
  });
});
