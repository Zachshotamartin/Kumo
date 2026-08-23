import { createHash, randomUUID } from "node:crypto";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireActor } from "./_auth.js";
import { syncBoardLinks } from "./_boardLinks.js";
import { getBoardAccess } from "./_boards.js";
import { replaceStorageDocument, withDocumentLease } from "./_documentMutation.js";
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
        .select("id, board_id, name, room_id, created_by, status, base_checksum, created_at, updated_at, merged_at")
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
        }).select("id, board_id, name, room_id, created_by, status, base_checksum, created_at, updated_at, merged_at").single();
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
      .select("id, board_id, name, room_id, created_by, status, base_checksum, created_at, updated_at, merged_at")
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
    return await withDocumentLease(database, access.board.liveblocks_room_id, async () => {
      const branchDocument = await liveblocks.getStorageDocument(branch.room_id as string, "json");
      const current = await liveblocks.getStorageDocument(access.board.liveblocks_room_id, "json");
      if (typeof branch.base_checksum !== "string" || checksum(current) !== branch.base_checksum) {
        return response.status(409).json({
          error: "Main changed after this branch was created. Create a new branch from the latest main board before merging.",
          code: "BRANCH_BASE_DIVERGED",
        });
      }
      const { data: checkpoint, error: checkpointError } = await database.from("document_snapshots").insert({
        board_id: boardId, liveblocks_room_id: access.board.liveblocks_room_id, document: current,
        checksum: checksum(current), name: `Before merging ${branch.name}`, description: `Automatic recovery point for branch ${branchId}.`,
        created_by: actor.uid, kind: "before_restore",
      }).select("id").single();
      if (checkpointError) throw checkpointError;

      await replaceStorageDocument({
        client: liveblocks,
        roomId: access.board.liveblocks_room_id,
        current: boardDocumentFromJson(current),
        next: boardDocumentFromJson(branchDocument),
        commit: async () => {
          await syncBoardLinks(boardId, branchDocument);
          const { error } = await database.rpc("complete_kumo_branch_merge", {
            p_board_id: boardId,
            p_branch_id: branchId,
            p_actor_id: actor.uid,
            p_checkpoint_id: checkpoint.id,
          });
          if (error) throw error;
        },
        rollback: () => syncBoardLinks(boardId, current),
      });
      const revision = Date.now();
      await liveblocks.broadcastEvent(access.board.liveblocks_room_id, {
        type: "DOCUMENT_RESTORED", actorId: actor.uid, revision,
      }).catch(() => undefined);
      return response.status(200).json({ merged: true, branchId, checkpointId: checkpoint.id, revision });
    });
  } catch (error) {
    const message = errorMessage(error, "We couldn't update design branches.");
    const status = message === "Authentication required." ? 401
      : error instanceof Error && error.name === "DocumentConflict" ? 409
      : 500;
    return response.status(status).json({ error: message });
  }
}
