import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireActor } from "../_auth.js";
import { getBoardAccess } from "../_boards.js";
import { allowMethods, errorMessage } from "../_http.js";
import { ensureActorProfile, supabaseAdmin } from "../_supabase.js";

const allowedEvents = new Set(["ready", "lost", "failed", "restored"]);
const finiteMetric = (value: unknown, maximum: number): number | null =>
  typeof value === "number" && Number.isFinite(value)
    ? Math.min(maximum, Math.max(0, Math.round(value)))
    : null;

export default async function handler(request: VercelRequest, response: VercelResponse) {
  if (!allowMethods(request, response, ["POST"])) return;
  try {
    const actor = await requireActor(request);
    await ensureActorProfile(actor);
    const boardId = typeof request.body?.boardId === "string" ? request.body.boardId.trim() : "";
    const roomId = typeof request.body?.roomId === "string" ? request.body.roomId.trim() : "";
    const event = typeof request.body?.event === "string" ? request.body.event : "";
    if (!boardId || !roomId || !allowedEvents.has(event)) {
      return response.status(400).json({ error: "Valid collaboration telemetry is required." });
    }
    const access = await getBoardAccess(boardId, actor.uid);
    const database = supabaseAdmin();
    let roomMatches = access?.board.liveblocks_room_id === roomId;
    if (access && roomId.startsWith("branch:")) {
      const { data: branch, error: branchError } = await database.from("document_branches")
        .select("board_id")
        .eq("room_id", roomId)
        .eq("board_id", boardId)
        .maybeSingle();
      if (branchError) throw branchError;
      roomMatches = Boolean(branch);
    }
    if (!roomMatches) return response.status(404).json({ error: "Board not found." });

    const { error } = await database.from("audit_events").insert({
      board_id: boardId,
      actor_id: actor.uid,
      event_type: `collaboration.connection_${event}`,
      payload: {
        roomId,
        attempts: finiteMetric(request.body?.attempts, 100),
        durationMs: finiteMetric(request.body?.durationMs, 86_400_000),
        connectionStatus: typeof request.body?.connectionStatus === "string"
          ? request.body.connectionStatus.slice(0, 40)
          : null,
        online: typeof request.body?.online === "boolean" ? request.body.online : null,
      },
    });
    if (error) throw error;
    return response.status(202).json({ accepted: true });
  } catch (error) {
    const message = errorMessage(error, "We couldn't record collaboration telemetry.");
    return response.status(message === "Authentication required." ? 401 : 500).json({ error: message });
  }
}
