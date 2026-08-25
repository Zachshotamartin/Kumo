import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireActor } from "../_auth.js";
import { getBoardAccess } from "../_boards.js";
import { allowMethods, errorMessage } from "../_http.js";
import { liveblocksAdmin } from "../_liveblocks.js";
import { ensureActorProfile, supabaseAdmin } from "../_supabase.js";
import { hashSecret, openSessionGuestId, validOpenSessionGuestNonce } from "../_security.js";
import { verifyPassword } from "../_platform.js";

export default async function handler(request: VercelRequest, response: VercelResponse) {
  if (!allowMethods(request, response, ["POST"])) return;
  try {
    const room = typeof request.body?.room === "string" ? request.body.room : "";
    if (!room.startsWith("board:") && !room.startsWith("branch:")) {
      return response.status(400).json({ error: "A valid board room is required." });
    }
    const openSessionToken = typeof request.body?.openSessionToken === "string" ? request.body.openSessionToken.trim().slice(0, 256) : "";
    if (openSessionToken) {
      if (!room.startsWith("board:")) return response.status(403).json({ error: "Open sessions cannot access design branches." });
      const database = supabaseAdmin();
      const { data: session, error } = await database.from("board_open_sessions")
        .select("id, board_id, password_hash, role, expires_at, revoked_at, boards(liveblocks_room_id)")
        .eq("token_hash", hashSecret(openSessionToken)).maybeSingle();
      if (error) throw error;
      const relatedBoard = session ? (Array.isArray(session.boards) ? session.boards[0] : session.boards) : null;
      if (!session || session.revoked_at || new Date(session.expires_at).getTime() <= Date.now() || relatedBoard?.liveblocks_room_id !== room) {
        return response.status(403).json({ error: "This open session is unavailable." });
      }
      const password = typeof request.body?.openSessionPassword === "string" ? request.body.openSessionPassword.slice(0, 256) : "";
      if (!verifyPassword(password, session.password_hash)) return response.status(403).json({ error: "The session password is incorrect." });
      const guestNonce = typeof request.body?.openSessionGuestNonce === "string" ? request.body.openSessionGuestNonce.trim().slice(0, 80) : "";
      if (!validOpenSessionGuestNonce(guestNonce)) return response.status(400).json({ error: "A valid guest session nonce is required." });
      const guestId = openSessionGuestId(openSessionToken, guestNonce);
      const guest = liveblocksAdmin().prepareSession(guestId, { userInfo: { name: "Kumo guest", email: "", avatar: "" } });
      guest.allow(room, session.role === "editor" ? ["*:write"] : ["*:read", "room:presence:write"]);
      const authorization = await guest.authorize();
      response.setHeader("Content-Type", "application/json");
      return response.status(authorization.status).send(authorization.body);
    }
    const actor = await requireActor(request);
    let boardId = room.startsWith("board:") ? room.slice("board:".length) : "";
    if (room.startsWith("branch:")) {
      const { data: branch, error } = await supabaseAdmin().from("document_branches")
        .select("board_id, status").eq("room_id", room).maybeSingle();
      if (error) throw error;
      if (!branch || branch.status !== "open") return response.status(403).json({ error: "This design branch is not open." });
      boardId = branch.board_id as string;
    }
    const access = await getBoardAccess(boardId, actor.uid);
    if (!access || (room.startsWith("board:") && access.board.liveblocks_room_id !== room)) {
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
        : ["*:read", "room:presence:write", "comments:write"]
    );
    const authorization = await session.authorize();
    response.setHeader("Content-Type", "application/json");
    return response.status(authorization.status).send(authorization.body);
  } catch (error) {
    const message = errorMessage(error, "We couldn't authorize collaboration.");
    return response.status(message === "Authentication required." ? 401 : 500).json({ error: message });
  }
}
