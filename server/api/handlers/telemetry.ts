import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireActor } from "../_auth.js";
import { getBoardAccess } from "../_boards.js";
import { allowMethods, errorMessage } from "../_http.js";
import { enforceRateLimit } from "../_security.js";
import { ensureActorProfile, supabaseAdmin } from "../_supabase.js";

const allowedEvents = new Set(["ready", "lost", "failed", "restored"]);
const allowedMetrics = new Set(["CLS", "FCP", "INP", "LCP", "TTFB", "api_latency", "long_task"]);
const finiteMetric = (value: unknown, maximum: number): number | null =>
  typeof value === "number" && Number.isFinite(value)
    ? Math.min(maximum, Math.max(0, Math.round(value)))
    : null;
const redactTelemetryText = (value: unknown, fallback: string, limit: number) => {
  const text = typeof value === "string" ? value : fallback;
  return text.replace(/([?&][^=&#\s]*(?:token|password|secret|invite|share|openSession)[^=&#\s]*=)[^&#\s)\]}]*/gi, "$1[redacted]").slice(0, limit);
};

export default async function handler(request: VercelRequest, response: VercelResponse) {
  if (!allowMethods(request, response, ["POST"])) return;
  try {
    const actor = await requireActor(request);
    await ensureActorProfile(actor);
    if (!(await enforceRateLimit(request, response, "telemetry", actor.uid, 120, 60))) return;
    const boardId = typeof request.body?.boardId === "string" ? request.body.boardId.trim() : "";
    const kind = typeof request.body?.kind === "string" ? request.body.kind : "collaboration";
    if (kind === "performance") {
      const metric = typeof request.body?.metric === "string" ? request.body.metric : "";
      const value = Number(request.body?.value);
      if (!allowedMetrics.has(metric) || !Number.isFinite(value) || value < 0) return response.status(400).json({ error: "Valid performance telemetry is required." });
      if (boardId && !(await getBoardAccess(boardId, actor.uid))) return response.status(404).json({ error: "Board not found." });
      const { error } = await supabaseAdmin().from("performance_events").insert({
        board_id: boardId || null,
        actor_id: actor.uid,
        release: typeof request.body?.release === "string" ? request.body.release.slice(0, 120) : null,
        route: redactTelemetryText(request.body?.route, "/", 500),
        metric,
        value,
        rating: ["good", "needs-improvement", "poor"].includes(request.body?.rating) ? request.body.rating : null,
        metadata: request.body?.metadata && typeof request.body.metadata === "object" ? request.body.metadata : {},
      });
      if (error) throw error;
      return response.status(202).json({ accepted: true });
    }
    if (kind === "error") {
      const message = redactTelemetryText(request.body?.message, "Client error", 1000);
      if (boardId && !(await getBoardAccess(boardId, actor.uid))) return response.status(404).json({ error: "Board not found." });
      const { error } = await supabaseAdmin().from("audit_events").insert({ board_id: boardId || null, actor_id: actor.uid, event_type: "client.error", payload: { message, stack: typeof request.body?.stack === "string" ? redactTelemetryText(request.body.stack, "", 4000) : null, route: redactTelemetryText(request.body?.route, "/", 500), release: typeof request.body?.release === "string" ? request.body.release.slice(0, 120) : null } });
      if (error) throw error;
      return response.status(202).json({ accepted: true });
    }
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
