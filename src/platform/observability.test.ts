import { authenticatedFetch } from "../services/apiClient";
import { redactTelemetryText, reportClientError, reportWebVital, startObservability, telemetryRoute } from "./observability";

const vitalObservers = vi.hoisted(() => ({
  cls: vi.fn(), fcp: vi.fn(), inp: vi.fn(), lcp: vi.fn(), ttfb: vi.fn(),
}));

vi.mock("web-vitals", () => ({
  onCLS: vitalObservers.cls,
  onFCP: vitalObservers.fcp,
  onINP: vitalObservers.inp,
  onLCP: vitalObservers.lcp,
  onTTFB: vitalObservers.ttfb,
}));

vi.mock("../services/apiClient", () => ({ authenticatedFetch: vi.fn() }));

const mockedFetch = vi.mocked(authenticatedFetch);

describe("observability", () => {
  let cleanup: (() => void) | undefined;

  beforeEach(() => {
    vi.clearAllMocks();
    mockedFetch.mockResolvedValue({ accepted: true });
    window.history.replaceState({}, "", "/canvas?board=board-1&mode=edit");
  });

  afterEach(() => {
    cleanup?.();
    cleanup = undefined;
    vi.unstubAllGlobals();
  });

  it("reports web vitals and client failures with board and route context", async () => {
    await reportWebVital({ name: "LCP", value: 1512, rating: "needs-improvement", delta: 12, id: "lcp-1" });
    await reportClientError(new Error("render failed"));

    expect(mockedFetch).toHaveBeenNthCalledWith(1, "/api/telemetry", expect.objectContaining({
      method: "POST",
      body: expect.stringContaining('"metric":"LCP"'),
    }));
    const vitalBody = JSON.parse(String(mockedFetch.mock.calls.at(0)?.[1]?.body));
    expect(vitalBody).toEqual(expect.objectContaining({ kind: "performance", boardId: "board-1", route: "/canvas?board=board-1&mode=edit", metric: "LCP", value: 1512 }));
    const errorBody = JSON.parse(String(mockedFetch.mock.calls.at(1)?.[1]?.body));
    expect(errorBody).toEqual(expect.objectContaining({ kind: "error", boardId: "board-1", message: "render failed" }));

    window.history.replaceState({}, "", "/canvas");
    const stackless = new Error("stackless");
    Object.defineProperty(stackless, "stack", { value: undefined });
    await reportClientError(stackless);
    expect(JSON.parse(String(mockedFetch.mock.calls.at(-1)?.[1]?.body))).not.toHaveProperty("boardId");
  });

  it("redacts bearer-like route parameters before reporting telemetry", () => {
    expect(telemetryRoute("https://kumo.test/open?board=board-1&openSession=secret-value&versionToken=version-secret&mode=view"))
      .toBe("/open?board=board-1&openSession=%5Bredacted%5D&versionToken=%5Bredacted%5D&mode=view");
    expect(redactTelemetryText("Failed at https://kumo.test/open?openSession=secret-value&mode=view"))
      .toBe("Failed at https://kumo.test/open?openSession=[redacted]&mode=view");
    expect(redactTelemetryText("/board?token=abc)&password=def]&safe=keep"))
      .toBe("/board?token=[redacted])&password=[redacted]]&safe=keep");
  });

  it("redacts in linear time on adversarial separator-heavy text", () => {
    const hostile = `${"?".repeat(40_000)}&token`;
    const started = performance.now();
    expect(redactTelemetryText(hostile)).toBe(hostile);
    expect(performance.now() - started).toBeLessThan(1_000);
  });

  it("registers vitals, errors, rejections, and slow-entry observers exactly once", async () => {
    let performanceCallback: PerformanceObserverCallback | undefined;
    const observe = vi.fn();
    const disconnect = vi.fn();
    class Observer {
      constructor(callback: PerformanceObserverCallback) { performanceCallback = callback; }
      observe = observe;
      disconnect = disconnect;
      takeRecords = vi.fn(() => []);
    }
    vi.stubGlobal("PerformanceObserver", Observer);

    cleanup = startObservability();
    const duplicateCleanup = startObservability();
    expect(vitalObservers.cls).toHaveBeenCalledOnce();
    expect(vitalObservers.lcp).toHaveBeenCalledOnce();
    expect(observe).toHaveBeenCalledWith({ entryTypes: ["resource", "longtask"] });
    duplicateCleanup();

    const lcpCallback = vitalObservers.lcp.mock.calls.at(0)?.[0] as (metric: Record<string, unknown>) => void;
    lcpCallback({ name: "LCP", value: 900, rating: "good", delta: 3, id: "lcp" });
    window.dispatchEvent(new ErrorEvent("error", { error: new Error("window crash"), message: "window crash" }));
    const rejection = new Event("unhandledrejection") as PromiseRejectionEvent;
    Object.defineProperty(rejection, "reason", { value: "async crash" });
    window.dispatchEvent(rejection);

    performanceCallback?.({
      getEntries: () => [
        { duration: 1200, name: "https://kumo.test/api/boards", entryType: "resource" },
        { duration: 3500, name: "self", entryType: "longtask" },
        { duration: 900, name: "https://kumo.test/api/ignored", entryType: "resource" },
        { duration: 1300, name: "https://kumo.test/static/app.js", entryType: "resource" },
        { duration: 1400, name: "https://kumo.test/api/telemetry", entryType: "resource" },
      ] as PerformanceEntry[],
    } as PerformanceObserverEntryList, {} as PerformanceObserver);
    await Promise.resolve();

    const bodies = mockedFetch.mock.calls.map((call) => JSON.parse(String(call[1]?.body)) as Record<string, unknown>);
    expect(bodies).toEqual(expect.arrayContaining([
      expect.objectContaining({ metric: "LCP", value: 900 }),
      expect.objectContaining({ kind: "error", message: "window crash" }),
      expect.objectContaining({ kind: "error", message: "async crash" }),
      expect.objectContaining({ metric: "api_latency", value: 1200, rating: "needs-improvement" }),
      expect.objectContaining({ metric: "long_task", value: 3500, rating: "poor" }),
    ]));
    expect(bodies).toHaveLength(5);

    cleanup();
    cleanup = undefined;
    expect(disconnect).toHaveBeenCalledOnce();
  });

  it("swallows telemetry transport failures", async () => {
    mockedFetch.mockRejectedValue(new Error("offline"));
    await expect(reportWebVital({ name: "CLS", value: 0.1, rating: "good", delta: 0.1, id: "cls" })).resolves.toBeUndefined();
    await expect(reportClientError(new Error("boom"))).resolves.toBeUndefined();
  });

  it("handles fallback browser events, observer failures, and missing observer support", async () => {
    const observe = vi.fn()
      .mockImplementationOnce(() => { throw new Error("longtask unsupported"); })
      .mockImplementationOnce(() => undefined);
    class Observer {
      constructor(_callback: PerformanceObserverCallback) {}
      observe = observe;
      disconnect = vi.fn();
      takeRecords = vi.fn(() => []);
    }
    vi.stubGlobal("PerformanceObserver", Observer);
    cleanup = startObservability();
    expect(observe).toHaveBeenLastCalledWith({ entryTypes: ["resource"] });
    window.dispatchEvent(new ErrorEvent("error", { message: "string failure" }));
    const rejection = new Event("unhandledrejection") as PromiseRejectionEvent;
    Object.defineProperty(rejection, "reason", { value: new Error("promise failure") });
    window.dispatchEvent(rejection);
    await Promise.resolve();
    expect(mockedFetch).toHaveBeenCalled();
    cleanup(); cleanup = undefined;

    vi.stubGlobal("PerformanceObserver", undefined);
    cleanup = startObservability();
    cleanup(); cleanup = undefined;

    vi.stubGlobal("window", undefined);
    expect(startObservability()).toBeTypeOf("function");
    vi.unstubAllGlobals();
  });

  it("contains failures while reporting slow entries", async () => {
    let callback: PerformanceObserverCallback | undefined;
    class Observer {
      constructor(value: PerformanceObserverCallback) { callback = value; }
      observe = vi.fn(); disconnect = vi.fn(); takeRecords = vi.fn(() => []);
    }
    vi.stubGlobal("PerformanceObserver", Observer);
    mockedFetch.mockRejectedValue(new Error("offline"));
    cleanup = startObservability();
    callback?.({ getEntries: () => [{ duration: 1200, name: "/api/boards", entryType: "resource" }] as PerformanceEntry[] } as PerformanceObserverEntryList, {} as PerformanceObserver);
    await Promise.resolve();
    expect(mockedFetch).toHaveBeenCalled();
  });
});
