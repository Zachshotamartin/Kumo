export interface BrowserNotificationItem {
  id: string;
  title: string;
  body: string;
  read_at: string | null;
}

const storageKey = "kumo:browser-notifications:shown";

const notificationApi = () => typeof window !== "undefined" && "Notification" in window
  ? window.Notification
  : null;

export const requestBrowserNotificationPermission = async () => {
  const api = notificationApi();
  if (!api) return false;
  if (api.permission === "granted") return true;
  if (api.permission === "denied") return false;
  return (await api.requestPermission()) === "granted";
};

export const urlBase64ToUint8Array = (value: string): Uint8Array<ArrayBuffer> => {
  const padding = "=".repeat((4 - value.length % 4) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  return Uint8Array.from(raw, (character) => character.charCodeAt(0));
};

export const registerKumoServiceWorker = async () => {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return null;
  return navigator.serviceWorker.register("/sw.js", { scope: "/" });
};

export const disableBackgroundPush = async () => {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return false;
  const registration = await navigator.serviceWorker.getRegistration("/");
  if (!registration || !("pushManager" in registration)) return false;
  const subscription = await registration.pushManager.getSubscription();
  return subscription ? subscription.unsubscribe() : false;
};

export const enableBackgroundPush = async (
  publicKey: string,
  save: (subscription: { endpoint: string; p256dh: string; auth: string }) => Promise<unknown>
) => {
  if (!publicKey || !(await requestBrowserNotificationPermission())) return null;
  const registration = await registerKumoServiceWorker();
  if (!registration || !("pushManager" in registration)) return null;
  const existing = await registration.pushManager.getSubscription();
  const subscription = existing ?? await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(publicKey),
  });
  const json = subscription.toJSON();
  const endpoint = json.endpoint;
  const p256dh = json.keys?.p256dh;
  const auth = json.keys?.auth;
  if (!endpoint || !p256dh || !auth) throw new Error("The browser returned an incomplete push subscription.");
  await save({ endpoint, p256dh, auth });
  return subscription;
};

const shownIds = () => {
  try {
    const value = JSON.parse(window.localStorage.getItem(storageKey) ?? "[]");
    return new Set(Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []);
  } catch {
    return new Set<string>();
  }
};

export const deliverBrowserNotifications = <T extends BrowserNotificationItem>(
  notifications: T[],
  onActivate: (notification: T) => void
) => {
  const api = notificationApi();
  if (!api || api.permission !== "granted") return 0;
  const shown = shownIds();
  let delivered = 0;
  notifications.filter((item) => !item.read_at && !shown.has(item.id)).forEach((item) => {
    const notification = new api(item.title, { body: item.body, tag: `kumo:${item.id}` });
    notification.onclick = () => {
      window.focus();
      notification.close();
      onActivate(item);
    };
    shown.add(item.id);
    delivered += 1;
  });
  window.localStorage.setItem(storageKey, JSON.stringify([...shown].slice(-200)));
  return delivered;
};
