import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireActor } from "./_auth.js";
import { getBoardAccess } from "./_boards.js";
import { adminAuth } from "./_firebaseAdmin.js";
import { allowMethods, errorMessage } from "./_http.js";
import { ensureActorProfile, supabaseAdmin } from "./_supabase.js";

type BoardRole = "editor" | "viewer";

interface ShareRequest {
  boardId?: string;
  action?: "invite" | "remove";
  email?: string;
  memberUid?: string;
  role?: BoardRole;
}

export default async function handler(request: VercelRequest, response: VercelResponse) {
  if (!allowMethods(request, response, ["POST"])) return;

  try {
    const actor = await requireActor(request);
    await ensureActorProfile(actor);
    const body = (request.body ?? {}) as ShareRequest;
    if (!body.boardId || !body.action) {
      return response.status(400).json({ error: "Board and action are required." });
    }

    const access = await getBoardAccess(body.boardId, actor.uid);
    if (!access) return response.status(404).json({ error: "Board not found." });
    if (access.role !== "owner") {
      return response.status(403).json({ error: "Only the board owner can manage access." });
    }

    if (body.action === "invite") {
      const email = body.email?.trim().toLowerCase();
      if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
        return response.status(400).json({ error: "Enter a valid email address." });
      }
      const invited = await adminAuth().getUserByEmail(email);
      if (invited.uid === actor.uid) {
        return response.status(400).json({ error: "You already own this board." });
      }
      await ensureActorProfile({
        uid: invited.uid,
        email: invited.email,
        name: invited.displayName,
        picture: invited.photoURL,
      });
      const role: BoardRole = body.role === "viewer" ? "viewer" : "editor";
      const database = supabaseAdmin();
      const { error } = await database.from("board_members").upsert({
        board_id: body.boardId,
        user_id: invited.uid,
        role,
      }, { onConflict: "board_id,user_id" });
      if (error) throw error;
      await database.from("audit_events").insert({
        board_id: body.boardId,
        actor_id: actor.uid,
        event_type: "board.member_invited",
        payload: { memberId: invited.uid, role },
      });
      return response.status(200).json({ uid: invited.uid, email, role });
    }

    if (!body.memberUid || body.memberUid === actor.uid) {
      return response.status(400).json({ error: "Select a collaborator to remove." });
    }
    const database = supabaseAdmin();
    const { error } = await database
      .from("board_members")
      .delete()
      .eq("board_id", body.boardId)
      .eq("user_id", body.memberUid)
      .neq("role", "owner");
    if (error) throw error;
    await database.from("audit_events").insert({
      board_id: body.boardId,
      actor_id: actor.uid,
      event_type: "board.member_removed",
      payload: { memberId: body.memberUid },
    });
    return response.status(200).json({ uid: body.memberUid });
  } catch (error) {
    const message = error instanceof Error && error.message.includes("user-not-found")
      ? "No Kumo account uses that email."
      : errorMessage(error, "We couldn't update board access.");
    return response.status(message === "Authentication required." ? 401 : 400).json({ error: message });
  }
}
