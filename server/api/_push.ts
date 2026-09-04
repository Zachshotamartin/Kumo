import webPush from "web-push";
import { validEmailAddress } from "./_security.js";
import { supabaseAdmin } from "./_supabase.js";

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
  tag?: string;
}

export type PushPreference = "branch_reviews" | "library_updates" | "access_changes";
export type CommentPushPreference = "all" | "mentions" | "off";

interface DigestNotification {
  id: string;
  title: string;
  kind: string;
  board_id: string | null;
}

const digestCategoryAllowed = (notification: DigestNotification, preference: Record<string, unknown>) => {
  if (notification.kind === "comment") return preference.board_comments === "all";
  if (notification.kind === "mention") return preference.board_comments === "all" || preference.board_comments === "mentions";
  if (notification.kind === "branch") return preference.branch_reviews !== false;
  if (notification.kind === "library") return preference.library_updates !== false;
  if (["access-request", "share", "access-change"].includes(notification.kind)) return preference.access_changes !== false;
  return true;
};

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
  const validSubject = subject.startsWith("https://")
    || (subject.startsWith("mailto:") && validEmailAddress(subject.slice("mailto:".length)));
  if (!validSubject) throw new Error("VAPID_SUBJECT must be a mailto: or HTTPS URL.");
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
    .select(`browser_enabled, digest, ${preference}`).eq("user_id", userId).maybeSingle();
  if (error) throw error;
  const preferences = data as (Record<PushPreference | "browser_enabled", boolean> & { digest?: string }) | null;
  if (!preferences?.browser_enabled || preferences[preference] === false) return { delivered: 0, subscriptions: 0, skipped: true };
  if (preferences.digest !== undefined && preferences.digest !== "instant") return { delivered: 0, subscriptions: 0, skipped: true, queued: preferences.digest === "daily" || preferences.digest === "weekly" };
  return { ...(await sendPushToUser(userId, payload)), skipped: false };
};

export const sendCommentPushToUser = async (userId: string, mention: boolean, payload: PushPayload) => {
  if (!pushConfigured()) return { delivered: 0, subscriptions: 0, skipped: true };
  const { data, error } = await supabaseAdmin().from("notification_preferences")
    .select("browser_enabled, digest, board_comments").eq("user_id", userId).maybeSingle();
  if (error) throw error;
  const preferences = data as { browser_enabled?: boolean; digest?: string; board_comments?: CommentPushPreference } | null;
  const categoryAllowed = preferences?.board_comments === "all" || (preferences?.board_comments === "mentions" && mention);
  if (!preferences?.browser_enabled || !categoryAllowed) return { delivered: 0, subscriptions: 0, skipped: true };
  if (preferences.digest !== undefined && preferences.digest !== "instant") return { delivered: 0, subscriptions: 0, skipped: true, queued: preferences.digest === "daily" || preferences.digest === "weekly" };
  return { ...(await sendPushToUser(userId, payload)), skipped: false };
};

export const sendDueNotificationDigests = async (now = new Date()) => {
  if (!pushConfigured()) return { users: 0, delivered: 0 };
  const database = supabaseAdmin();
  const { data, error } = await database.from("notification_preferences")
    .select("user_id, digest, last_digest_at, board_comments, branch_reviews, library_updates, access_changes")
    .eq("browser_enabled", true)
    .in("digest", ["daily", "weekly"]);
  if (error) throw error;
  let users = 0;
  let delivered = 0;
  for (const preference of data ?? []) {
    const period = preference.digest === "weekly" ? 7 * 24 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000;
    const last = preference.last_digest_at ? new Date(preference.last_digest_at as string).getTime() : 0;
    if (last && now.getTime() - last < period) continue;
    const since = new Date(Math.max(last, now.getTime() - period)).toISOString();
    const [{ data: notifications, error: notificationError }, { data: mutes, error: muteError }] = await Promise.all([
      database.from("account_notifications")
        .select("id, title, kind, board_id")
        .eq("recipient_id", preference.user_id)
        .is("read_at", null)
        .gt("created_at", since)
        .order("created_at", { ascending: false })
        .limit(50),
      database.from("board_notification_mutes").select("board_id").eq("user_id", preference.user_id),
    ]);
    if (notificationError) throw notificationError;
    if (muteError) throw muteError;
    const mutedBoardIds = new Set((mutes ?? []).map((mute) => mute.board_id as string));
    const included = ((notifications ?? []) as DigestNotification[]).filter((notification) =>
      (!notification.board_id || !mutedBoardIds.has(notification.board_id)) && digestCategoryAllowed(notification, preference));
    if (included.length) {
      const result = await sendPushToUser(preference.user_id as string, {
        title: `${included.length} Kumo update${included.length === 1 ? "" : "s"}`,
        body: included[0]?.title as string,
        url: "/?view=inbox",
        tag: `kumo:${preference.digest}-digest`,
      });
      users += 1;
      delivered += result.delivered;
    }
    const { error: updateError } = await database.from("notification_preferences")
      .update({ last_digest_at: now.toISOString() })
      .eq("user_id", preference.user_id);
    if (updateError) throw updateError;
  }
  return { users, delivered };
};
