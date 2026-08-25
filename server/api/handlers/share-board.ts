import { randomBytes } from "node:crypto";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireActor } from "../_auth.js";
import { getBoardAccess } from "../_boards.js";
import { linkedBoardSharePlan, membershipBoardIds } from "../_boardSharing.js";
import { allowMethods, errorMessage, stringQuery } from "../_http.js";
import { friendshipBetween } from "../_profiles.js";
import { enforceRateLimit, hashSecret, requestOrigin } from "../_security.js";
import { ensureActorProfile, supabaseAdmin } from "../_supabase.js";

type BoardRole = "editor" | "viewer";
type ShareAction = "invite" | "remove" | "update-role" | "transfer-owner" | "leave" | "accept-invitation" | "cancel-invitation" | "refresh-invitation";

interface ShareRequest {
  boardId?: string;
  action?: ShareAction;
  email?: string;
  friendUid?: string;
  memberUid?: string;
  invitationId?: string;
  token?: string;
  role?: BoardRole;
  includeLinkedBoards?: boolean;
}

const invitationLink = (request: VercelRequest, token: string) => `${requestOrigin(request)}/?invite=${encodeURIComponent(token)}`;

export default async function handler(request: VercelRequest, response: VercelResponse) {
  if (!allowMethods(request, response, ["GET", "POST"])) return;
  try {
    const actor = await requireActor(request);
    const actorProfile = await ensureActorProfile(actor);
    const body = (request.body ?? {}) as ShareRequest;
    const database = supabaseAdmin();

    if (request.method === "POST" && body.action === "accept-invitation") {
      if (!(await enforceRateLimit(request, response, "board-invitation-accept", actor.uid, 10, 60))) return;
      const token = body.token?.trim() ?? "";
      if (!token) return response.status(400).json({ error: "Invitation token is required." });
      const tokenHash = hashSecret(token);
      const { data: invitation, error: invitationError } = await database.from("board_invitations")
        .select("id, board_id, invited_by, include_linked_boards").eq("token_hash", tokenHash).maybeSingle();
      if (invitationError) throw invitationError;
      if (!invitation) return response.status(404).json({ error: "Invitation is unavailable." });
      const { data: acceptedBoardId, error } = await database.rpc("accept_kumo_board_invitation", {
        p_token_hash: tokenHash,
        p_actor_id: actor.uid,
        p_actor_email: actor.email ?? actorProfile.email,
      });
      if (error) throw error;
      if (invitation.include_linked_boards) {
        const plan = await linkedBoardSharePlan(invitation.board_id as string, invitation.invited_by as string);
        const rootAccess = await getBoardAccess(invitation.board_id as string, actor.uid);
        const linkedIds = plan.boards.filter((candidate) => candidate.manageable).map((candidate) => candidate.id);
        if (rootAccess && linkedIds.length > 1) {
          const { error: linkedError } = await database.rpc("share_kumo_board_set", {
            p_board_ids: linkedIds, p_actor_id: invitation.invited_by, p_user_id: actor.uid, p_role: rootAccess.role,
          });
          if (linkedError) throw linkedError;
        }
      }
      return response.status(200).json({ accepted: true, boardId: acceptedBoardId });
    }

    const boardId = request.method === "GET" ? stringQuery(request.query.boardId) : body.boardId ?? "";
    if (!boardId) return response.status(400).json({ error: "Board is required." });
    const access = await getBoardAccess(boardId, actor.uid);
    if (!access) return response.status(404).json({ error: "Board not found." });

    if (request.method === "POST" && body.action === "leave") {
      if (access.role === "owner") return response.status(409).json({ error: "Transfer ownership before leaving this board." });
      const { error } = await database.from("board_members").delete().eq("board_id", boardId).eq("user_id", actor.uid);
      if (error) throw error;
      await database.from("audit_events").insert({ board_id: boardId, actor_id: actor.uid, event_type: "board.member_left" });
      return response.status(200).json({ left: true });
    }

    if (access.role !== "owner") return response.status(403).json({ error: "Only the board owner can manage access." });
    const plan = await linkedBoardSharePlan(boardId, actor.uid);
    if (request.method === "GET") {
      const { data: invitations, error } = await database.from("board_invitations")
        .select("id, email, role, status, expires_at, last_sent_at, created_at").eq("board_id", boardId).eq("status", "pending").order("created_at", { ascending: false });
      if (error) throw error;
      return response.status(200).json({ plan, invitations: invitations ?? [] });
    }

    if (!body.action) return response.status(400).json({ error: "Board and action are required." });
    if (!(await enforceRateLimit(request, response, `board-share-${body.action}`, actor.uid, 30, 60))) return;
    if (plan.truncated && body.includeLinkedBoards !== false && ["invite", "remove", "update-role"].includes(body.action)) {
      return response.status(409).json({ error: "This connected-board graph is larger than Kumo's safe sharing limit. Share this board directly or reduce the link graph first." });
    }

    if (body.action === "cancel-invitation") {
      const { error } = await database.from("board_invitations").update({ status: "cancelled" }).eq("id", body.invitationId ?? "").eq("board_id", boardId).eq("status", "pending");
      if (error) throw error;
      return response.status(200).json({ cancelled: true });
    }

    if (body.action === "refresh-invitation") {
      const { data: invitation, error } = await database.from("board_invitations")
        .select("id").eq("id", body.invitationId ?? "").eq("board_id", boardId).eq("status", "pending").maybeSingle();
      if (error) throw error;
      if (!invitation) return response.status(404).json({ error: "Pending invitation not found." });
      const token = randomBytes(32).toString("base64url");
      const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
      const { error: updateError } = await database.from("board_invitations").update({ token_hash: hashSecret(token), expires_at: expiresAt, last_sent_at: new Date().toISOString() }).eq("id", invitation.id);
      if (updateError) throw updateError;
      const url = invitationLink(request, token);
      return response.status(200).json({ refreshed: true, url });
    }

    if (body.action === "transfer-owner") {
      if (!body.memberUid || body.memberUid === actor.uid) return response.status(400).json({ error: "Choose another board member as owner." });
      const { error } = await database.rpc("transfer_kumo_board_ownership", { p_board_id: boardId, p_actor_id: actor.uid, p_new_owner_id: body.memberUid });
      if (error) throw error;
      return response.status(200).json({ transferred: true, newOwnerId: body.memberUid });
    }

    if (body.action === "invite") {
      const friendUid = body.friendUid?.trim() ?? "";
      const email = body.email?.trim().toLowerCase() ?? "";
      if (!friendUid && (!email || !/^\S+@\S+\.\S+$/.test(email))) return response.status(400).json({ error: "Enter a valid email address or choose a friend." });
      let relationship = friendUid ? await friendshipBetween(actor.uid, friendUid) : null;
      if (friendUid && relationship?.status !== "accepted") return response.status(403).json({ error: "Only accepted friends can be shared with from the friends list." });
      const profileQuery = database.from("profiles").select("firebase_uid, email, display_name, avatar_url");
      const { data: invited, error: invitedError } = friendUid
        ? await profileQuery.eq("firebase_uid", friendUid).maybeSingle()
        : await profileQuery.ilike("email", email).maybeSingle();
      if (invitedError) throw invitedError;
      const role: BoardRole = body.role === "viewer" ? "viewer" : "editor";
      if (!invited) {
        if (friendUid) return response.status(400).json({ error: "Friend profile not found." });
        const token = randomBytes(32).toString("base64url");
        const { data: pending, error } = await database.rpc("create_or_refresh_kumo_board_invitation", {
          p_board_id: boardId, p_email: email, p_role: role, p_token_hash: hashSecret(token),
          p_include_linked_boards: body.includeLinkedBoards !== false, p_invited_by: actor.uid,
        });
        if (error) throw error;
        const url = invitationLink(request, token);
        return response.status(202).json({ pending: true, invitation: pending, url });
      }
      if (invited.firebase_uid === actor.uid) return response.status(400).json({ error: "You already own this board." });
      relationship ??= await friendshipBetween(actor.uid, invited.firebase_uid);
      if (relationship?.status === "blocked") return response.status(403).json({ error: "This profile cannot be invited." });
      const managedBoards = plan.boards.filter((candidate) => candidate.manageable);
      const selectedBoards = body.includeLinkedBoards === false ? managedBoards.filter((candidate) => candidate.id === boardId) : managedBoards;
      const { error } = await database.rpc("share_kumo_board_set", { p_board_ids: selectedBoards.map((candidate) => candidate.id), p_actor_id: actor.uid, p_user_id: invited.firebase_uid, p_role: role });
      if (error) throw error;
      const existingAccess = await membershipBoardIds(invited.firebase_uid, plan.boards.map((candidate) => candidate.id));
      const unavailableBoards = plan.boards.filter((candidate) => !candidate.manageable && candidate.visibility === "private" && !existingAccess.has(candidate.id));
      return response.status(200).json({ uid: invited.firebase_uid, email: invited.email, name: invited.display_name, avatar: invited.avatar_url, role, sharedBoards: selectedBoards, unavailableBoards });
    }

    if (!body.memberUid || body.memberUid === actor.uid) return response.status(400).json({ error: "Select another collaborator." });
    const managedBoards = plan.boards.filter((candidate) => candidate.manageable);
    const selectedBoards = body.includeLinkedBoards === false ? managedBoards.filter((candidate) => candidate.id === boardId) : managedBoards;
    if (body.action === "update-role") {
      const role: BoardRole = body.role === "viewer" ? "viewer" : "editor";
      const { error } = await database.rpc("share_kumo_board_set", { p_board_ids: selectedBoards.map((candidate) => candidate.id), p_actor_id: actor.uid, p_user_id: body.memberUid, p_role: role });
      if (error) throw error;
      return response.status(200).json({ uid: body.memberUid, role, updatedBoards: selectedBoards });
    }
    if (body.action !== "remove") return response.status(400).json({ error: "Unknown sharing action." });
    const { error } = await database.rpc("remove_kumo_board_member_set", { p_board_ids: selectedBoards.map((candidate) => candidate.id), p_actor_id: actor.uid, p_user_id: body.memberUid });
    if (error) throw error;
    return response.status(200).json({ uid: body.memberUid, removedBoards: selectedBoards });
  } catch (error) {
    const message = errorMessage(error, "We couldn't update board access.");
    const status = message === "Authentication required." ? 401 : /not found|unavailable/i.test(message) ? 404 : 400;
    return response.status(status).json({ error: message });
  }
}
