import { deliverBrowserNotifications, disableBackgroundPush, enableBackgroundPush, registerKumoServiceWorker, requestBrowserNotificationPermission, urlBase64ToUint8Array } from "./browserNotifications";

describe("browser notifications", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.unstubAllGlobals();
    vi.stubGlobal("focus", vi.fn());
  });
  afterEach(() => vi.unstubAllGlobals());

  it("requests permission only when needed", async () => {
    expect(await requestBrowserNotificationPermission()).toBe(false);
    const requestPermission = vi.fn().mockResolvedValue("granted");
    vi.stubGlobal("Notification", class { static permission = "default"; static requestPermission = requestPermission; });
    expect(await requestBrowserNotificationPermission()).toBe(true);
    expect(requestPermission).toHaveBeenCalledOnce();
    vi.stubGlobal("Notification", class { static permission = "granted"; static requestPermission = vi.fn(); });
    expect(await requestBrowserNotificationPermission()).toBe(true);
    vi.stubGlobal("Notification", class { static permission = "denied"; static requestPermission = vi.fn(); });
    expect(await requestBrowserNotificationPermission()).toBe(false);
  });

  it("delivers unread notifications once and activates their destination", () => {
    const instances: Array<{ onclick: (() => void) | null; close: ReturnType<typeof vi.fn> }> = [];
    vi.stubGlobal("Notification", class {
      static permission = "granted";
      static requestPermission = vi.fn();
      onclick: (() => void) | null = null;
      close = vi.fn();
      constructor(public title: string, public options?: NotificationOptions) { instances.push(this); }
    });
    const activate = vi.fn();
    const items = [{ id: "new", title: "Review requested", body: "Open the branch", read_at: null }, { id: "read", title: "Old", body: "Seen", read_at: "now" }];
    expect(deliverBrowserNotifications(items, activate)).toBe(1);
    expect(deliverBrowserNotifications(items, activate)).toBe(0);
    instances[0]!.onclick?.();
    expect(instances[0]!.close).toHaveBeenCalled();
    expect(activate).toHaveBeenCalledWith(items[0]);
  });

  it("recovers from malformed seen-state storage and respects denied permission", () => {
    window.localStorage.setItem("kumo:browser-notifications:shown", "not-json");
    vi.stubGlobal("Notification", class { static permission = "denied"; static requestPermission = vi.fn(); });
    expect(deliverBrowserNotifications([{ id: "new", title: "New", body: "Body", read_at: null }], vi.fn())).toBe(0);
    vi.stubGlobal("Notification", class { static permission = "granted"; static requestPermission = vi.fn(); });
    expect(deliverBrowserNotifications([{ id: "new", title: "New", body: "Body", read_at: null }], vi.fn())).toBe(1);
    window.localStorage.setItem("kumo:browser-notifications:shown", JSON.stringify({ invalid: true }));
    expect(deliverBrowserNotifications([{ id: "next", title: "Next", body: "Body", read_at: null }], vi.fn())).toBe(1);
  });

  it("decodes URL-safe VAPID keys", () => {
    expect([...urlBase64ToUint8Array("AQIDBA")]).toEqual([1, 2, 3, 4]);
  });

  it("registers the Kumo service worker only when supported", async () => {
    const register = vi.fn().mockResolvedValue({ scope: "/" });
    Object.defineProperty(navigator, "serviceWorker", { configurable: true, value: { register } });
    await expect(registerKumoServiceWorker()).resolves.toEqual({ scope: "/" });
    expect(register).toHaveBeenCalledWith("/sw.js", { scope: "/" });
    vi.stubGlobal("navigator", {});
    await expect(registerKumoServiceWorker()).resolves.toBeNull();
  });

  it("unsubscribes the active background subscription when disabled", async () => {
    const unsubscribe = vi.fn().mockResolvedValue(true);
    const getRegistration = vi.fn().mockResolvedValue({ pushManager: { getSubscription: vi.fn().mockResolvedValue({ unsubscribe }) } });
    Object.defineProperty(navigator, "serviceWorker", { configurable: true, value: { getRegistration } });
    await expect(disableBackgroundPush()).resolves.toBe(true);
    expect(getRegistration).toHaveBeenCalledWith("/");
    expect(unsubscribe).toHaveBeenCalledOnce();
    Object.defineProperty(navigator, "serviceWorker", { configurable: true, value: { getRegistration: vi.fn().mockResolvedValue(null) } });
    await expect(disableBackgroundPush()).resolves.toBe(false);
    vi.stubGlobal("navigator", undefined);
    await expect(disableBackgroundPush()).resolves.toBe(false);
    vi.unstubAllGlobals();
    Object.defineProperty(navigator, "serviceWorker", { configurable: true, value: { getRegistration: vi.fn().mockResolvedValue({}) } });
    await expect(disableBackgroundPush()).resolves.toBe(false);
    Object.defineProperty(navigator, "serviceWorker", { configurable: true, value: { getRegistration: vi.fn().mockResolvedValue({ pushManager: { getSubscription: vi.fn().mockResolvedValue(null) } }) } });
    await expect(disableBackgroundPush()).resolves.toBe(false);
  });

  it("creates and persists a background push subscription", async () => {
    const subscription = { endpoint: "https://push.example/sub", toJSON: () => ({ endpoint: "https://push.example/sub", keys: { p256dh: "p-key", auth: "a-key" } }) };
    const subscribe = vi.fn().mockResolvedValue(subscription);
    Object.defineProperty(navigator, "serviceWorker", { configurable: true, value: { register: vi.fn().mockResolvedValue({ pushManager: { getSubscription: vi.fn().mockResolvedValue(null), subscribe } }) } });
    vi.stubGlobal("Notification", class { static permission = "granted"; static requestPermission = vi.fn(); });
    const save = vi.fn().mockResolvedValue(undefined);
    await expect(enableBackgroundPush("AQIDBA", save)).resolves.toBe(subscription);
    expect(subscribe).toHaveBeenCalledWith(expect.objectContaining({ userVisibleOnly: true, applicationServerKey: expect.any(Uint8Array) }));
    expect(save).toHaveBeenCalledWith({ endpoint: subscription.endpoint, p256dh: "p-key", auth: "a-key" });
  });

  it("reuses subscriptions and rejects incomplete browser responses", async () => {
    const incomplete = { endpoint: "https://push.example/sub", toJSON: () => ({ endpoint: "https://push.example/sub", keys: {} }) };
    Object.defineProperty(navigator, "serviceWorker", { configurable: true, value: { register: vi.fn().mockResolvedValue({ pushManager: { getSubscription: vi.fn().mockResolvedValue(incomplete), subscribe: vi.fn() } }) } });
    vi.stubGlobal("Notification", class { static permission = "granted"; static requestPermission = vi.fn(); });
    await expect(enableBackgroundPush("AQIDBA", vi.fn())).rejects.toThrow("incomplete push subscription");
    const missingEndpoint = { toJSON: () => ({ keys: { p256dh: "p", auth: "a" } }) };
    Object.defineProperty(navigator, "serviceWorker", { configurable: true, value: { register: vi.fn().mockResolvedValue({ pushManager: { getSubscription: vi.fn().mockResolvedValue(missingEndpoint) } }) } });
    await expect(enableBackgroundPush("AQIDBA", vi.fn())).rejects.toThrow("incomplete push subscription");
    const missingKeys = { toJSON: () => ({ endpoint: "https://push" }) };
    Object.defineProperty(navigator, "serviceWorker", { configurable: true, value: { register: vi.fn().mockResolvedValue({ pushManager: { getSubscription: vi.fn().mockResolvedValue(missingKeys) } }) } });
    await expect(enableBackgroundPush("AQIDBA", vi.fn())).rejects.toThrow("incomplete push subscription");
    const missingAuth = { toJSON: () => ({ endpoint: "https://push", keys: { p256dh: "p" } }) };
    Object.defineProperty(navigator, "serviceWorker", { configurable: true, value: { register: vi.fn().mockResolvedValue({ pushManager: { getSubscription: vi.fn().mockResolvedValue(missingAuth) } }) } });
    await expect(enableBackgroundPush("AQIDBA", vi.fn())).rejects.toThrow("incomplete push subscription");
    await expect(enableBackgroundPush("", vi.fn())).resolves.toBeNull();
    Object.defineProperty(navigator, "serviceWorker", { configurable: true, value: { register: vi.fn().mockResolvedValue({}) } });
    await expect(enableBackgroundPush("AQIDBA", vi.fn())).resolves.toBeNull();
  });
});
