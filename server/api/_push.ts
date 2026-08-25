import webPush from "web-push";
import { supabaseAdmin } from "./_supabase.js";

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
  tag?: string;
}

export type PushPreference = "branch_reviews" | "library_updates" | "access_changes";

export const pushConfigured = () => Boolean(
  process.env.VAPID_PUBLIC_KEY?.trim()
  && process.env.VAPID_PRIVATE_KEY?.trim()
  && process.env.VAPID_SUBJECT?.trim()
);

const configure = () => {
  const publicKey = process.env.VAPID_PUBLIC_KEY?.trim();
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim();
  const subject = process.env.VAPID_SUBJECT?.trim();
  if (!publicKey || !privateKey || !subject) throw new Error("Web Push environment variables are incomplete.");
  if (!/^mailto:\S+@\S+\.\S+$|^https:\/\//.test(subject)) throw new Error("VAPID_SUBJECT must be a mailto: or HTTPS URL.");
  webPush.setVapidDetails(subject, publicKey, privateKey);
};

export const sendPushToUser = async (userId: string, payload: PushPayload) => {
  configure();
  const database = supabaseAdmin();
  const { data, error } = await database.from("push_subscriptions").select("id, endpoint, p256dh, auth, failure_count").eq("user_id", userId);
  if (error) throw error;
  let delivered = 0;
  await Promise.all((data ?? []).map(async (subscription) => {
    try {
      await webPush.sendNotification({ endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } }, JSON.stringify(payload), { TTL: 60 * 60, urgency: "normal" });
      delivered += 1;
      await database.from("push_subscriptions").update({ last_success_at: new Date().toISOString(), failure_count: 0, updated_at: new Date().toISOString() }).eq("id", subscription.id);
    } catch (error) {
      const statusCode = typeof error === "object" && error && "statusCode" in error ? Number(error.statusCode) : 0;
      if (statusCode === 404 || statusCode === 410) await database.from("push_subscriptions").delete().eq("id", subscription.id);
      else await database.from("push_subscriptions").update({ failure_count: Number(subscription.failure_count ?? 0) + 1, updated_at: new Date().toISOString() }).eq("id", subscription.id);
    }
  }));
  return { delivered, subscriptions: data?.length ?? 0 };
};

export const sendPreferredPushToUser = async (userId: string, preference: PushPreference, payload: PushPayload) => {
  if (!pushConfigured()) return { delivered: 0, subscriptions: 0, skipped: true };
  const { data, error } = await supabaseAdmin().from("notification_preferences")
    .select(`browser_enabled, ${preference}`).eq("user_id", userId).maybeSingle();
  if (error) throw error;
  const preferences = data as Record<PushPreference | "browser_enabled", boolean> | null;
  if (!preferences?.browser_enabled || preferences[preference] === false) return { delivered: 0, subscriptions: 0, skipped: true };
  return { ...(await sendPushToUser(userId, payload)), skipped: false };
};
