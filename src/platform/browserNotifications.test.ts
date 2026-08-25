import { deliverBrowserNotifications, requestBrowserNotificationPermission } from "./browserNotifications";

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
  });
});
