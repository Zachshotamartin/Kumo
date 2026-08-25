import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";

type FetchListener = (event: {
  request: { method: string; url: string; mode: string } | Request;
  respondWith: (response: Promise<unknown>) => void;
}) => void;

describe("Kumo service worker routing", () => {
  const source = readFileSync(resolve(process.cwd(), "public/sw.js"), "utf8").replace(
    "/* __KUMO_PRECACHE_MANIFEST__ */",
    ', "/assets/app.js", "/embed/kumo-logo.js"',
  );

  const worker = () => {
    const listeners = new Map<string, (...args: never[]) => void>();
    const network = vi.fn();
    const match = vi.fn();
    const addAll = vi.fn().mockResolvedValue(undefined);
    const put = vi.fn().mockResolvedValue(undefined);
    const deleteCache = vi.fn().mockResolvedValue(true);
    const open = vi.fn().mockResolvedValue({ addAll, match, put });
    const skipWaiting = vi.fn().mockResolvedValue(undefined);
    const claim = vi.fn().mockResolvedValue(undefined);
    const context = {
      self: {
        location: { origin: "https://kumo.test" },
        addEventListener: (name: string, listener: (...args: never[]) => void) => listeners.set(name, listener),
        clients: { claim }, registration: {}, skipWaiting,
      },
      caches: { match, open, keys: vi.fn().mockResolvedValue(["kumo-shell-v2", "kumo-shell-v3", "kumo-shell-v4", "kumo-offline-inbox-v1", "firebase-unrelated-cache"]), delete: deleteCache },
      fetch: network,
      Response,
      URL,
      Date,
      Promise,
    };
    runInNewContext(source, context);
    return { listeners, listener: listeners.get("fetch") as FetchListener, network, match, addAll, put, open, skipWaiting, claim, deleteCache };
  };

  it("precaches the application shell and removes obsolete caches", async () => {
    const current = worker();
    let install: Promise<unknown> | undefined;
    current.listeners.get("install")!({ waitUntil: (promise: Promise<unknown>) => { install = promise; } } as never);
    await install;
    expect(current.addAll).toHaveBeenCalledWith(["/", "/manifest.json", "/assets/app.js", "/embed/kumo-logo.js"]);
    expect(current.skipWaiting).toHaveBeenCalled();

    let activation: Promise<unknown> | undefined;
    current.listeners.get("activate")!({ waitUntil: (promise: Promise<unknown>) => { activation = promise; } } as never);
    await activation;
    expect(current.deleteCache).toHaveBeenCalledTimes(2);
    expect(current.deleteCache).toHaveBeenCalledWith("kumo-shell-v2");
    expect(current.deleteCache).toHaveBeenCalledWith("kumo-shell-v3");
    expect(current.claim).toHaveBeenCalled();
  });

  it.each(["/api", "/api/boards", "/__", "/__/auth/handler"])(
    "never intercepts reserved request %s with the application shell",
    (pathname) => {
      const { listener, network, match } = worker();
      const respondWith = vi.fn();
      listener({ request: { method: "GET", url: `https://kumo.test${pathname}`, mode: "navigate" }, respondWith });
      expect(respondWith).not.toHaveBeenCalled();
      expect(network).not.toHaveBeenCalled();
      expect(match).not.toHaveBeenCalled();
    },
  );

  it.each([
    [{ method: "POST", url: "https://kumo.test/asset", mode: "cors" }],
    [{ method: "GET", url: "https://cdn.example/asset", mode: "cors" }],
    [{ method: "GET", url: "https://kumo.test/unlisted-runtime.js", mode: "cors" }],
    [{ method: "GET", url: "https://kumo.test/assets/app.js?version=unbounded", mode: "cors" }],
  ])("does not intercept unsupported requests", (request) => {
    const { listener, network } = worker();
    const respondWith = vi.fn();
    listener({ request, respondWith });
    expect(respondWith).not.toHaveBeenCalled();
    expect(network).not.toHaveBeenCalled();
  });

  it("uses the shell only for failed navigations and not failed assets", async () => {
    const navigation = worker();
    navigation.network.mockRejectedValue(new Error("offline"));
    navigation.match.mockResolvedValueOnce(undefined).mockResolvedValueOnce("cached-shell");
    let navigationResponse: Promise<unknown> | undefined;
    navigation.listener({
      request: { method: "GET", url: "https://kumo.test/boards", mode: "navigate" },
      respondWith: (response) => { navigationResponse = response; },
    });
    await expect(navigationResponse).resolves.toBe("cached-shell");
    expect(navigation.match).toHaveBeenLastCalledWith("/");

    const asset = worker();
    asset.network.mockRejectedValue(new Error("offline"));
    asset.match.mockResolvedValue(undefined);
    let assetResponse: Promise<unknown> | undefined;
    asset.listener({
      request: { method: "GET", url: "https://kumo.test/assets/app.js", mode: "cors" },
      respondWith: (response) => { assetResponse = response; },
    });
    await expect(assetResponse).resolves.toMatchObject({ type: "error" });
    expect(asset.match).toHaveBeenCalledTimes(1);
    expect(asset.match).not.toHaveBeenCalledWith("/");
  });

  it("refreshes the cached shell after successful navigation", async () => {
    const current = worker();
    const response = new Response("<main>Kumo</main>", { headers: { "Content-Type": "text/html; charset=utf-8" } });
    current.network.mockResolvedValue(response);
    let handled: Promise<unknown> | undefined;
    current.listener({
      request: { method: "GET", url: "https://kumo.test/boards", mode: "navigate" },
      respondWith: (promise) => { handled = promise; },
    });
    await expect(handled).resolves.toBe(response);
    await Promise.resolve();
    expect(current.put).toHaveBeenCalledWith("/", expect.any(Response));
  });

  it("does not replace the shell with a successful non-HTML navigation", async () => {
    const current = worker();
    const response = new Response('{"name":"Kumo"}', { headers: { "Content-Type": "application/json" } });
    current.network.mockResolvedValue(response);
    let handled: Promise<unknown> | undefined;
    current.listener({
      request: { method: "GET", url: "https://kumo.test/manifest.json", mode: "navigate" },
      respondWith: (promise) => { handled = promise; },
    });
    await expect(handled).resolves.toBe(response);
    expect(current.open).not.toHaveBeenCalled();
    expect(current.put).not.toHaveBeenCalled();
  });

  it("serves cached assets first and stores successful network assets", async () => {
    const cached = worker();
    cached.match.mockResolvedValue("cached-asset");
    let cachedResponse: Promise<unknown> | undefined;
    cached.listener({
      request: { method: "GET", url: "https://kumo.test/assets/app.js", mode: "cors" },
      respondWith: (promise) => { cachedResponse = promise; },
    });
    await expect(cachedResponse).resolves.toBe("cached-asset");
    expect(cached.network).not.toHaveBeenCalled();

    const fresh = worker();
    const response = new Response("application code");
    fresh.match.mockResolvedValue(undefined);
    fresh.network.mockResolvedValue(response);
    const request = new Request("https://kumo.test/assets/app.js");
    let freshResponse: Promise<unknown> | undefined;
    fresh.listener({ request, respondWith: (promise) => { freshResponse = promise; } });
    await expect(freshResponse).resolves.toBe(response);
    await Promise.resolve();
    expect(fresh.put).toHaveBeenCalledWith(request, expect.any(Response));
  });

  it("does not cache unsuccessful network responses", async () => {
    const current = worker();
    const response = new Response("missing", { status: 404 });
    current.match.mockResolvedValue(undefined);
    current.network.mockResolvedValue(response);
    let handled: Promise<unknown> | undefined;
    current.listener({
      request: { method: "GET", url: "https://kumo.test/assets/app.js", mode: "cors" },
      respondWith: (promise) => { handled = promise; },
    });
    await expect(handled).resolves.toBe(response);
    expect(current.put).not.toHaveBeenCalled();
  });
});
