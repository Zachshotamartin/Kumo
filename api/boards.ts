import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireActor } from "./_auth";
import {
  boardSummary,
  getBoardAccess,
  listBoardsForUser,
  provisionBoard,
  searchPublicBoards,
} from "./_boards";
import { allowMethods, errorMessage, stringQuery } from "./_http";
import { liveblocksAdmin } from "./_liveblocks";
import { ensureActorProfile, supabaseAdmin } from "./_supabase";

const cleanTitle = (value: unknown): string =>
  (typeof value === "string" ? value.trim() : "").slice(0, 120) || "Untitled board";

export default async function handler(request: VercelRequest, response: VercelResponse) {
  if (!allowMethods(request, response, ["GET", "POST", "PATCH", "DELETE"])) return;
  try {
    const actor = await requireActor(request);
    await ensureActorProfile(actor);

    if (request.method === "GET") {
      const boardId = stringQuery(request.query.id);
      const scope = stringQuery(request.query.scope);
      if (boardId) {
        const access = await getBoardAccess(boardId, actor.uid);
        if (!access) return response.status(404).json({ error: "Board not found." });
        const { data: memberRows, error: memberError } = await supabaseAdmin()
          .from("board_members")
          .select("user_id, role")
          .eq("board_id", boardId);
        if (memberError) throw memberError;
        const members = Object.fromEntries(
          (memberRows ?? []).map((member) => [member.user_id, member.role])
        );
        return response.status(200).json({
          board: { ...boardSummary(access.board, access.role), members },
        });
      }
      if (scope === "public") {
        return response.status(200).json({ boards: await searchPublicBoards(stringQuery(request.query.query)) });
      }
      return response.status(200).json({ boards: await listBoardsForUser(actor.uid) });
    }

    if (request.method === "POST") {
      const action = request.body?.action === "duplicate" ? "duplicate" : "create";
      if (action === "duplicate") {
        const sourceId = typeof request.body?.boardId === "string" ? request.body.boardId : "";
        const access = await getBoardAccess(sourceId, actor.uid);
        if (!access) return response.status(404).json({ error: "Board not found." });
        const document = await liveblocksAdmin().getStorageDocument(access.board.liveblocks_room_id, "json");
        const board = await provisionBoard({
          ownerId: actor.uid,
          title: `${access.board.title} copy`,
          document,
        });
        return response.status(201).json({ board: boardSummary(board, "owner") });
      }
      const board = await provisionBoard({ ownerId: actor.uid, title: cleanTitle(request.body?.title) });
      return response.status(201).json({ board: boardSummary(board, "owner") });
    }

    const boardId = typeof request.body?.boardId === "string" ? request.body.boardId : "";
    const access = await getBoardAccess(boardId, actor.uid);
    if (!access) return response.status(404).json({ error: "Board not found." });
    if (access.role !== "owner") {
      return response.status(403).json({ error: "Only the board owner can change board settings." });
    }

    if (request.method === "DELETE") {
      const { error } = await supabaseAdmin().rpc("soft_delete_kumo_board", {
        p_board_id: boardId,
        p_actor_id: actor.uid,
      });
      if (error) throw error;
      return response.status(204).end();
    }

    const patch: Record<string, unknown> = {};
    if (request.body?.title !== undefined) patch.title = cleanTitle(request.body.title);
    if (request.body?.visibility === "private" || request.body?.visibility === "public") {
      patch.visibility = request.body.visibility;
    }
    if (Object.keys(patch).length === 0) {
      return response.status(400).json({ error: "No valid board settings were provided." });
    }
    const { data, error } = await supabaseAdmin()
      .from("boards")
      .update(patch)
      .eq("id", boardId)
      .eq("owner_id", actor.uid)
      .select("id, owner_id, title, visibility, liveblocks_room_id, legacy_rtdb_id, created_at, updated_at, deleted_at")
      .single();
    if (error) throw error;
    await supabaseAdmin().from("audit_events").insert({
      board_id: boardId,
      actor_id: actor.uid,
      event_type: "board.settings_updated",
      payload: patch,
    });
    return response.status(200).json({ board: boardSummary(data, "owner") });
  } catch (error) {
    const message = errorMessage(error, "The board request failed.");
    return response.status(message === "Authentication required." ? 401 : 500).json({ error: message });
  }
}
