import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireActor } from "./_auth.js";
import { getBoardAccess } from "./_boards.js";
import { linkedBoardSharePlan, membershipBoardIds } from "./_boardSharing.js";
import { allowMethods, errorMessage, stringQuery } from "./_http.js";
import { ensureActorProfile, supabaseAdmin } from "./_supabase.js";

type BoardRole = "editor" | "viewer";

interface ShareRequest {
  boardId?: string;
  action?: "invite" | "remove";
  email?: string;
  memberUid?: string;
  role?: BoardRole;
  includeLinkedBoards?: boolean;
}

export default async function handler(request: VercelRequest, response: VercelResponse) {
  if (!allowMethods(request, response, ["GET", "POST"])) return;

  try {
    const actor = await requireActor(request);
    await ensureActorProfile(actor);
    const boardId = request.method === "GET"
      ? stringQuery(request.query.boardId)
      : ((request.body ?? {}) as ShareRequest).boardId ?? "";
    if (!boardId) return response.status(400).json({ error: "Board is required." });

    const access = await getBoardAccess(boardId, actor.uid);
    if (!access) return response.status(404).json({ error: "Board not found." });
    if (access.role !== "owner") {
      return response.status(403).json({ error: "Only the board owner can manage access." });
    }
    const plan = await linkedBoardSharePlan(boardId, actor.uid);
    if (request.method === "GET") return response.status(200).json({ plan });

    const body = (request.body ?? {}) as ShareRequest;
    if (!body.action) {
      return response.status(400).json({ error: "Board and action are required." });
    }
    if (plan.truncated && body.includeLinkedBoards !== false) {
      return response.status(409).json({
        error: "This connected-board graph is larger than Kumo's safe sharing limit. Share this board directly or reduce the link graph first.",
      });
    }

    if (body.action === "invite") {
      const email = body.email?.trim().toLowerCase();
      if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
        return response.status(400).json({ error: "Enter a valid email address." });
      }
      const database = supabaseAdmin();
      const { data: invited, error: invitedError } = await database
        .from("profiles")
        .select("firebase_uid, email")
        .ilike("email", email)
        .maybeSingle();
      if (invitedError) throw invitedError;
      if (!invited) {
        return response.status(400).json({ error: "No Kumo account uses that email." });
      }
      if (invited.firebase_uid === actor.uid) {
        return response.status(400).json({ error: "You already own this board." });
      }
      const role: BoardRole = body.role === "viewer" ? "viewer" : "editor";
      const managedBoards = plan.boards.filter((board) => board.manageable);
      const selectedBoards = body.includeLinkedBoards === false
        ? managedBoards.filter((board) => board.id === boardId)
        : managedBoards;
      const selectedIds = selectedBoards.map((board) => board.id);
      const { error } = await database.rpc("share_kumo_board_set", {
        p_board_ids: selectedIds,
        p_actor_id: actor.uid,
        p_user_id: invited.firebase_uid,
        p_role: role,
      });
      if (error) throw error;
      const existingAccess = await membershipBoardIds(
        invited.firebase_uid,
        plan.boards.map((board) => board.id)
      );
      const unavailableBoards = plan.boards.filter((board) =>
        !board.manageable && board.visibility === "private" && !existingAccess.has(board.id)
      );
      return response.status(200).json({
        uid: invited.firebase_uid,
        email: invited.email,
        role,
        sharedBoards: selectedBoards,
        unavailableBoards,
      });
    }

    if (!body.memberUid || body.memberUid === actor.uid) {
      return response.status(400).json({ error: "Select a collaborator to remove." });
    }
    const database = supabaseAdmin();
    const managedBoards = plan.boards.filter((board) => board.manageable);
    const selectedBoards = body.includeLinkedBoards === false
      ? managedBoards.filter((board) => board.id === boardId)
      : managedBoards;
    const { error } = await database.rpc("remove_kumo_board_member_set", {
      p_board_ids: selectedBoards.map((board) => board.id),
      p_actor_id: actor.uid,
      p_user_id: body.memberUid,
    });
    if (error) throw error;
    return response.status(200).json({ uid: body.memberUid, removedBoards: selectedBoards });
  } catch (error) {
    const message = errorMessage(error, "We couldn't update board access.");
    return response.status(message === "Authentication required." ? 401 : 400).json({ error: message });
  }
}
