import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireActor } from "./_auth.js";
import { serializeBoardThumbnail, updateBoardThumbnail } from "./_boardThumbnail.js";
import { getBoardAccess } from "./_boards.js";
import { allowMethods, errorMessage, stringQuery } from "./_http.js";
import { liveblocksAdmin } from "./_liveblocks.js";

export default async function handler(request: VercelRequest, response: VercelResponse) {
  if (!allowMethods(request, response, ["GET"])) return;
  try {
    const actor = await requireActor(request);
    const boardId = stringQuery(request.query.id);
    if (!boardId) return response.status(400).json({ error: "Board id is required." });
    const access = await getBoardAccess(boardId, actor.uid);
    if (!access) return response.status(404).json({ error: "Board not found." });
    const document = await liveblocksAdmin().getStorageDocument(access.board.liveblocks_room_id, "json");
    const svg = serializeBoardThumbnail(document);
    await updateBoardThumbnail(access.board, document).catch(() => undefined);
    response.setHeader("Content-Type", "image/svg+xml; charset=utf-8");
    response.setHeader("Cache-Control", "private, max-age=30, stale-while-revalidate=120");
    return response.status(200).send(svg);
  } catch (error) {
    const message = errorMessage(error, "The board preview could not be loaded.");
    return response.status(message === "Authentication required." ? 401 : 500).json({ error: message });
  }
}
