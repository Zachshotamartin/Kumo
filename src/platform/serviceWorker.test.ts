import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";

type FetchListener = (event: {
  request: { method: string; url: string; mode: string };
  respondWith: (response: Promise<unknown>) => void;
}) => void;

describe("Kumo service worker routing", () => {
  const source = readFileSync(resolve(process.cwd(), "public/sw.js"), "utf8");

  const worker = () => {
    const listeners = new Map<string, (...args: never[]) => void>();
    const network = vi.fn();
    const match = vi.fn();
    const context = {
      self: {
        location: { origin: "https://kumo.test" },
        addEventListener: (name: string, listener: (...args: never[]) => void) => listeners.set(name, listener),
        clients: {}, registration: {},
      },
      caches: { match, open: vi.fn(), keys: vi.fn() },
      fetch: network,
      Response,
      URL,
      Date,
      Promise,
    };
    runInNewContext(source, context);
    return { listener: listeners.get("fetch") as FetchListener, network, match };
  };

  it("never intercepts API requests with the application shell", () => {
    const { listener, network, match } = worker();
    const respondWith = vi.fn();
    listener({ request: { method: "GET", url: "https://kumo.test/api/boards", mode: "cors" }, respondWith });
    expect(respondWith).not.toHaveBeenCalled();
    expect(network).not.toHaveBeenCalled();
    expect(match).not.toHaveBeenCalled();
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
      request: { method: "GET", url: "https://kumo.test/assets/editor.js", mode: "cors" },
      respondWith: (response) => { assetResponse = response; },
    });
    await expect(assetResponse).resolves.toMatchObject({ type: "error" });
    expect(asset.match).toHaveBeenCalledTimes(1);
    expect(asset.match).not.toHaveBeenCalledWith("/");
  });
});
