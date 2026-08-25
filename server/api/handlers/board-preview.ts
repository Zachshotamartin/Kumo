import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireActor } from "../_auth.js";
import { serializeBoardThumbnail, updateBoardThumbnail } from "../_boardThumbnail.js";
import { getBoardAccess } from "../_boards.js";
import { allowMethods, errorMessage, stringQuery } from "../_http.js";
import { liveblocksAdmin } from "../_liveblocks.js";

export const BOARD_PREVIEW_FETCH_TIMEOUT_MS = 4_000;

const loadPreviewDocument = async (roomId: string): Promise<unknown> => {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const document = liveblocksAdmin().getStorageDocument(roomId, "json")
    .then((value) => ({ value }))
    .catch((error: unknown) => ({ error }));
  const deadline = new Promise<{ timedOut: true }>((resolve) => {
    timeout = setTimeout(() => resolve({ timedOut: true }), BOARD_PREVIEW_FETCH_TIMEOUT_MS);
  });
  const result = await Promise.race([document, deadline]);
  clearTimeout(timeout);
  if ("timedOut" in result) return { backgroundColor: "#252629", nodes: {} };
  if ("error" in result) throw result.error;
  return result.value;
};

export default async function handler(request: VercelRequest, response: VercelResponse) {
  if (!allowMethods(request, response, ["GET"])) return;
  try {
    const actor = await requireActor(request);
    const boardId = stringQuery(request.query.id);
    if (!boardId) return response.status(400).json({ error: "Board id is required." });
    const access = await getBoardAccess(boardId, actor.uid);
    if (!access) return response.status(404).json({ error: "Board not found." });
    const document = await loadPreviewDocument(access.board.liveblocks_room_id);
    const svg = serializeBoardThumbnail(document);
    // The generated SVG is already complete. Persisting its cache must never hold
    // a dashboard connection open and starve the editor's lazy-loaded route.
    void updateBoardThumbnail(access.board, document).catch(() => undefined);
    response.setHeader("Content-Type", "image/svg+xml; charset=utf-8");
    response.setHeader("Cache-Control", "private, max-age=30, stale-while-revalidate=120");
    return response.status(200).send(svg);
  } catch (error) {
    const message = errorMessage(error, "The board preview could not be loaded.");
    return response.status(message === "Authentication required." ? 401 : 500).json({ error: message });
  }
}
