import { createHash } from "node:crypto";
import { WebhookHandler } from "@liveblocks/node";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { allowMethods } from "./_http.js";
import { liveblocksAdmin } from "./_liveblocks.js";
import { supabaseAdmin } from "./_supabase.js";
import { syncBoardLinks } from "./_boardLinks.js";

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
    if (event.type !== "storageUpdated") return response.status(200).json({ accepted: true });

    const database = supabaseAdmin();
    const { data: board, error: boardError } = await database
      .from("boards")
      .select("id")
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
