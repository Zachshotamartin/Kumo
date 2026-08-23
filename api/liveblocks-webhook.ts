import { createHash } from "node:crypto";
import { WebhookHandler } from "@liveblocks/node";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { allowMethods } from "./_http.js";
import { liveblocksAdmin } from "./_liveblocks.js";
import { supabaseAdmin } from "./_supabase.js";

export const config = { api: { bodyParser: false } };

const rawBody = async (request: VercelRequest): Promise<string> => {
  if (typeof request.body === "string") return request.body;
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
};

const syncBoardLinks = async (
  sourceBoardId: string,
  document: unknown
): Promise<void> => {
  const source = document && typeof document === "object" ? document as Record<string, unknown> : {};
  const nodes = source.nodes && typeof source.nodes === "object"
    ? source.nodes as Record<string, unknown>
    : {};
  const candidates = Object.entries(nodes).flatMap(([shapeId, value]) => {
    if (!value || typeof value !== "object") return [];
    const shape = value as Record<string, unknown>;
    return shape.type === "board" && typeof shape.boardId === "string" && shape.boardId !== sourceBoardId
      ? [{ source_board_id: sourceBoardId, target_board_id: shape.boardId, shape_id: shapeId }]
      : [];
  });
  const database = supabaseAdmin();
  const { error: deleteError } = await database
    .from("board_links")
    .delete()
    .eq("source_board_id", sourceBoardId);
  if (deleteError) throw deleteError;
  if (!candidates.length) return;
  const targetIds = [...new Set(candidates.map((link) => link.target_board_id))];
  const { data: targets, error: targetError } = await database
    .from("boards")
    .select("id")
    .in("id", targetIds)
    .is("deleted_at", null);
  if (targetError) throw targetError;
  const existing = new Set((targets ?? []).map((target) => target.id));
  const valid = candidates.filter((link) => existing.has(link.target_board_id));
  if (valid.length) {
    const { error } = await database.from("board_links").insert(valid);
    if (error) throw error;
  }
};

export default async function handler(request: VercelRequest, response: VercelResponse) {
  if (!allowMethods(request, response, ["POST"])) return;
  try {
    const secret = process.env.LIVEBLOCKS_WEBHOOK_SECRET;
    if (!secret) throw new Error("Liveblocks webhook environment variables are incomplete.");
    const event = new WebhookHandler(secret).verifyRequest({
      headers: request.headers,
      rawBody: await rawBody(request),
    });
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
    if (!recent) {
      const document = await liveblocksAdmin().getStorageDocument(event.data.roomId, "json");
      const serialized = JSON.stringify(document);
      const { error } = await database.from("document_snapshots").insert({
        board_id: board.id,
        liveblocks_room_id: event.data.roomId,
        document,
        checksum: createHash("sha256").update(serialized).digest("hex"),
      });
      if (error) throw error;
      await syncBoardLinks(board.id, document);
    }
    return response.status(200).json({ accepted: true });
  } catch {
    return response.status(400).json({ error: "Invalid webhook request." });
  }
}
