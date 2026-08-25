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
