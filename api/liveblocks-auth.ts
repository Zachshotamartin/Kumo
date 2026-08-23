import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireActor } from "./_auth.js";
import { getBoardAccess } from "./_boards.js";
import { allowMethods, errorMessage } from "./_http.js";
import { liveblocksAdmin } from "./_liveblocks.js";
import { ensureActorProfile } from "./_supabase.js";

export default async function handler(request: VercelRequest, response: VercelResponse) {
  if (!allowMethods(request, response, ["POST"])) return;
  try {
    const actor = await requireActor(request);
    const room = typeof request.body?.room === "string" ? request.body.room : "";
    if (!room.startsWith("board:")) {
      return response.status(400).json({ error: "A valid board room is required." });
    }
    const access = await getBoardAccess(room.slice("board:".length), actor.uid);
    if (!access || access.board.liveblocks_room_id !== room) {
      return response.status(403).json({ error: "You do not have access to this board." });
    }
    const profile = await ensureActorProfile(actor);
    const session = liveblocksAdmin().prepareSession(actor.uid, {
      userInfo: {
        name: profile.displayName,
        email: profile.email,
        avatar: profile.avatarUrl ?? "",
      },
    });
    session.allow(
      room,
      access.role === "owner" || access.role === "editor"
        ? ["*:write"]
        : ["*:read", "room:presence:write"]
    );
    const authorization = await session.authorize();
    response.setHeader("Content-Type", "application/json");
    return response.status(authorization.status).send(authorization.body);
  } catch (error) {
    const message = errorMessage(error, "We couldn't authorize collaboration.");
    return response.status(message === "Authentication required." ? 401 : 500).json({ error: message });
  }
}
