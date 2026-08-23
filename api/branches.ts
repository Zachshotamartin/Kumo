import { createHash, randomUUID } from "node:crypto";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireActor } from "./_auth.js";
import { syncBoardLinks } from "./_boardLinks.js";
import { getBoardAccess } from "./_boards.js";
import { allowMethods, errorMessage, stringQuery } from "./_http.js";
import { boardDocumentFromJson, liveblocksAdmin } from "./_liveblocks.js";
import { supabaseAdmin } from "./_supabase.js";

const cleanName = (value: unknown) => typeof value === "string" ? value.trim().slice(0, 120) : "";
const checksum = (document: unknown) => createHash("sha256").update(JSON.stringify(document)).digest("hex");

const editable = (role: string) => role === "owner" || role === "editor";

export default async function handler(request: VercelRequest, response: VercelResponse) {
  if (!allowMethods(request, response, ["GET", "POST"])) return;
  try {
    const actor = await requireActor(request);
    const boardId = request.method === "GET"
      ? stringQuery(request.query.boardId).trim()
      : typeof request.body?.boardId === "string" ? request.body.boardId.trim() : "";
    if (!boardId) return response.status(400).json({ error: "A board is required." });
    const access = await getBoardAccess(boardId, actor.uid);
    if (!access) return response.status(404).json({ error: "Board not found." });
    const database = supabaseAdmin();

    if (request.method === "GET") {
      const { data, error } = await database.from("document_branches")
        .select("id, board_id, name, room_id, created_by, status, created_at, updated_at, merged_at")
        .eq("board_id", boardId)
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return response.status(200).json({ branches: data ?? [] });
    }

    if (!editable(access.role)) return response.status(403).json({ error: "Editing access is required to manage branches." });
    const action = typeof request.body?.action === "string" ? request.body.action : "create";
    const liveblocks = liveblocksAdmin();

    if (action === "create") {
      const name = cleanName(request.body?.name);
      if (!name) return response.status(400).json({ error: "A branch name is required." });
      const id = randomUUID();
      const roomId = `branch:${id}`;
      const document = await liveblocks.getStorageDocument(access.board.liveblocks_room_id, "json");
      await liveblocks.createRoom(roomId, { defaultAccesses: [], metadata: { boardId, branchId: id } });
      try {
        await liveblocks.initializeStorageDocument(roomId, boardDocumentFromJson(document));
        const { data, error } = await database.from("document_branches").insert({
          id, board_id: boardId, name, room_id: roomId, created_by: actor.uid,
          status: "open", base_checksum: checksum(document),
        }).select("id, board_id, name, room_id, created_by, status, created_at, updated_at, merged_at").single();
        if (error) throw error;
        await database.from("audit_events").insert({ board_id: boardId, actor_id: actor.uid, event_type: "branch.created", payload: { branchId: id, name } });
        return response.status(201).json({ branch: data });
      } catch (error) {
        await liveblocks.deleteRoom(roomId).catch(() => undefined);
        throw error;
      }
    }

    const branchId = typeof request.body?.branchId === "string" ? request.body.branchId : "";
    const { data: branch, error: branchError } = await database.from("document_branches")
      .select("id, board_id, name, room_id, created_by, status, created_at, updated_at, merged_at")
      .eq("id", branchId).eq("board_id", boardId).maybeSingle();
    if (branchError) throw branchError;
    if (!branch) return response.status(404).json({ error: "Branch not found." });

    if (action === "archive") {
      if (branch.status !== "open") return response.status(409).json({ error: "Only open branches can be archived." });
      const { error } = await database.from("document_branches").update({ status: "archived", updated_at: new Date().toISOString() }).eq("id", branchId);
      if (error) throw error;
      return response.status(200).json({ archived: true, branchId });
    }

    if (action !== "merge") return response.status(400).json({ error: "Unknown branch action." });
    if (branch.status !== "open") return response.status(409).json({ error: "Only open branches can be merged." });
    const branchDocument = await liveblocks.getStorageDocument(branch.room_id as string, "json");
    const current = await liveblocks.getStorageDocument(access.board.liveblocks_room_id, "json");
    const { data: checkpoint, error: checkpointError } = await database.from("document_snapshots").insert({
      board_id: boardId, liveblocks_room_id: access.board.liveblocks_room_id, document: current,
      checksum: checksum(current), name: `Before merging ${branch.name}`, description: `Automatic recovery point for branch ${branchId}.`,
      created_by: actor.uid, kind: "before_restore",
    }).select("id").single();
    if (checkpointError) throw checkpointError;

    await liveblocks.deleteStorageDocument(access.board.liveblocks_room_id);
    try {
      await liveblocks.initializeStorageDocument(access.board.liveblocks_room_id, boardDocumentFromJson(branchDocument));
    } catch (mergeError) {
      await liveblocks.initializeStorageDocument(access.board.liveblocks_room_id, boardDocumentFromJson(current));
      throw mergeError;
    }
    await syncBoardLinks(boardId, branchDocument);
    const now = new Date().toISOString();
    await database.from("document_branches").update({ status: "merged", merged_at: now, updated_at: now }).eq("id", branchId);
    await database.from("boards").update({ updated_at: now }).eq("id", boardId);
    await database.from("audit_events").insert({ board_id: boardId, actor_id: actor.uid, event_type: "branch.merged", payload: { branchId, checkpointId: checkpoint.id } });
    await liveblocks.broadcastEvent(access.board.liveblocks_room_id, { type: "DOCUMENT_RESTORED", actorId: actor.uid });
    return response.status(200).json({ merged: true, branchId, checkpointId: checkpoint.id });
  } catch (error) {
    const message = errorMessage(error, "We couldn't update design branches.");
    return response.status(message === "Authentication required." ? 401 : 500).json({ error: message });
  }
}
