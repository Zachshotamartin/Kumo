import { createHash } from "node:crypto";
import { WebhookHandler } from "@liveblocks/node";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { allowMethods } from "../server/api/_http.js";
import { liveblocksAdmin } from "../server/api/_liveblocks.js";
import { supabaseAdmin } from "../server/api/_supabase.js";
import { syncBoardLinks } from "../server/api/_boardLinks.js";
import { updateBoardThumbnail } from "../server/api/_boardThumbnail.js";
import { sendCommentPushToUser } from "../server/api/_push.js";

export const config = { api: { bodyParser: false } };

const rawBody = async (request: VercelRequest): Promise<string> => {
  if (typeof request.body === "string") return request.body;
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
};

export default async function handler(request: VercelRequest, response: VercelResponse) {
  if (!allowMethods(request, response, ["POST"])) return;
  let event: ReturnType<WebhookHandler["verifyRequest"]>;
  try {
    const secret = process.env.LIVEBLOCKS_WEBHOOK_SECRET;
    if (!secret) throw new Error("Liveblocks webhook environment variables are incomplete.");
    event = new WebhookHandler(secret).verifyRequest({
      headers: request.headers,
      rawBody: await rawBody(request),
    });
  } catch {
    return response.status(400).json({ error: "Invalid webhook request." });
  }

  try {
    const database = supabaseAdmin();
    if (event.type === "notification" && (event.data.kind === "thread" || event.data.kind === "textMention")) {
      const { data: board, error: boardError } = await database.from("boards")
        .select("id, title")
        .eq("liveblocks_room_id", event.data.roomId)
        .is("deleted_at", null)
        .maybeSingle();
      if (boardError) throw boardError;
      if (!board) return response.status(200).json({ accepted: true });
      const { data: mute, error: muteError } = await database.from("board_notification_mutes").select("board_id").eq("board_id", board.id).eq("user_id", event.data.userId).maybeSingle();
      if (muteError) throw muteError;
      if (mute) return response.status(200).json({ accepted: true });
      const mention = event.data.kind === "textMention";
      const { data: preferences, error: preferenceError } = await database.from("notification_preferences")
        .select("board_comments")
        .eq("user_id", event.data.userId)
        .maybeSingle();
      if (preferenceError) throw preferenceError;
      const commentPreference = preferences?.board_comments ?? "all";
      const allowed = commentPreference === "all" || (commentPreference === "mentions" && mention);
      if (!allowed) return response.status(200).json({ accepted: true });
      const notification = {
        recipient_id: event.data.userId,
        board_id: board.id,
        kind: mention ? "mention" : "comment",
        title: mention ? `You were mentioned in ${board.title}` : `New reply in ${board.title}`,
        body: mention ? "Open the board to read the mention." : "A thread you follow has a new reply.",
        action_url: `/?board=${encodeURIComponent(board.id)}`,
        source_key: `liveblocks:${event.data.inboxNotificationId}`,
        created_at: event.data.triggeredAt,
      };
      const { error: insertError } = await database.from("account_notifications")
        .upsert(notification, { onConflict: "source_key", ignoreDuplicates: true });
      if (insertError) throw insertError;
      await sendCommentPushToUser(event.data.userId, mention, {
        title: notification.title,
        body: notification.body,
        url: notification.action_url,
        tag: `kumo:comment:${board.id}`,
      });
      return response.status(200).json({ accepted: true });
    }
    if (event.type !== "storageUpdated") return response.status(200).json({ accepted: true });

    const { data: board, error: boardError } = await database
      .from("boards")
      .select("id, owner_id, thumbnail_asset_id")
      .eq("liveblocks_room_id", event.data.roomId)
      .is("deleted_at", null)
      .maybeSingle();
    if (boardError) throw boardError;
    if (!board) return response.status(200).json({ accepted: true });

    await database.from("boards").update({ updated_at: event.data.updatedAt }).eq("id", board.id);
    const { data: latest, error: latestError } = await database
      .from("document_snapshots")
      .select("created_at")
      .eq("board_id", board.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (latestError) throw latestError;
    const recent = latest && Date.now() - new Date(latest.created_at).getTime() < 5 * 60_000;
    const document = await liveblocksAdmin().getStorageDocument(event.data.roomId, "json");
    await syncBoardLinks(board.id, document);
    await updateBoardThumbnail(board, document);
    if (!recent) {
      const serialized = JSON.stringify(document);
      const { error } = await database.from("document_snapshots").insert({
        board_id: board.id,
        liveblocks_room_id: event.data.roomId,
        document,
        checksum: createHash("sha256").update(serialized).digest("hex"),
      });
      if (error) throw error;
    }
    return response.status(200).json({ accepted: true });
  } catch {
    return response.status(500).json({ error: "The webhook could not be processed." });
  }
}
