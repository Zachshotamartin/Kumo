import { createHash } from "node:crypto";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireActor } from "./_auth.js";
import { getBoardAccess } from "./_boards.js";
import { replaceStorageDocument, withDocumentLease } from "./_documentMutation.js";
import { syncBoardLinks } from "./_boardLinks.js";
import { boardDocumentFromJson, liveblocksAdmin } from "./_liveblocks.js";
import { allowMethods, errorMessage, stringQuery } from "./_http.js";
import { supabaseAdmin } from "./_supabase.js";

const checksum = (document: unknown) => createHash("sha256")
  .update(JSON.stringify(document))
  .digest("hex");

const cleanText = (value: unknown, limit: number): string | null => {
  const text = typeof value === "string" ? value.trim().slice(0, limit) : "";
  return text || null;
};

const requireEditable = (role: string) => {
  if (role !== "owner" && role !== "editor") {
    const error = new Error("Editing access is required to change version history.");
    error.name = "Forbidden";
    throw error;
  }
};

const requestedBranchId = (request: VercelRequest) => request.method === "GET"
  ? stringQuery(request.query.branchId).trim()
  : typeof request.body?.branchId === "string" ? request.body.branchId.trim() : "";

const resolveRoomId = async (
  database: ReturnType<typeof supabaseAdmin>,
  boardId: string,
  mainRoomId: string,
  branchId: string
): Promise<string | null> => {
  if (!branchId) return mainRoomId;
  const { data, error } = await database.from("document_branches")
    .select("room_id, status")
    .eq("id", branchId)
    .eq("board_id", boardId)
    .maybeSingle();
  if (error) throw error;
  return data?.status === "open" && typeof data.room_id === "string" ? data.room_id : null;
};

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
    const branchId = requestedBranchId(request);
    const roomId = await resolveRoomId(database, boardId, access.board.liveblocks_room_id, branchId);
    if (!roomId) return response.status(404).json({ error: "Branch not found or no longer open." });

    if (request.method === "GET") {
      const versionId = stringQuery(request.query.versionId).trim();
      if (versionId) {
        const { data, error } = await database
          .from("document_snapshots")
          .select("id, board_id, name, description, created_by, kind, created_at, document")
          .eq("id", versionId)
          .eq("board_id", boardId)
          .eq("liveblocks_room_id", roomId)
          .maybeSingle();
        if (error) throw error;
        if (!data) return response.status(404).json({ error: "Version not found." });
        return response.status(200).json({ version: data });
      }
      const { data, error } = await database
        .from("document_snapshots")
        .select("id, board_id, name, description, created_by, kind, created_at, checksum")
        .eq("board_id", boardId)
        .eq("liveblocks_room_id", roomId)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      const userIds = [...new Set((data ?? [])
        .map((version) => version.created_by as string | null)
        .filter((id): id is string => Boolean(id)))];
      let creators = new Map<string, string>();
      if (userIds.length) {
        const { data: profiles, error: profileError } = await database
          .from("profiles")
          .select("firebase_uid, display_name")
          .in("firebase_uid", userIds);
        if (profileError) throw profileError;
        creators = new Map((profiles ?? []).map((profile) => [
          profile.firebase_uid as string,
          profile.display_name as string,
        ]));
      }
      return response.status(200).json({
        versions: (data ?? []).map((version) => ({
          ...version,
          creatorName: creators.get(version.created_by as string) ?? null,
        })),
      });
    }

    requireEditable(access.role);
    const action = request.body?.action === "restore" ? "restore" : "checkpoint";
    const liveblocks = liveblocksAdmin();
    if (action === "checkpoint") {
      const document = await liveblocks.getStorageDocument(roomId, "json");
      const { data, error } = await database.from("document_snapshots").insert({
        board_id: boardId,
        liveblocks_room_id: roomId,
        document,
        checksum: checksum(document),
        name: cleanText(request.body?.name, 120) ?? "Checkpoint",
        description: cleanText(request.body?.description, 500),
        created_by: actor.uid,
        kind: "checkpoint",
      }).select("id, board_id, name, description, created_by, kind, created_at, checksum").single();
      if (error) throw error;
      const { error: auditError } = await database.from("audit_events").insert({
        board_id: boardId,
        actor_id: actor.uid,
        event_type: "version.checkpoint_created",
        payload: { versionId: data.id, name: data.name, roomId },
      });
      if (auditError) throw auditError;
      return response.status(201).json({ version: data });
    }

    const versionId = typeof request.body?.versionId === "string" ? request.body.versionId : "";
    const { data: target, error: targetError } = await database
      .from("document_snapshots")
      .select("id, document")
      .eq("id", versionId)
      .eq("board_id", boardId)
      .eq("liveblocks_room_id", roomId)
      .maybeSingle();
    if (targetError) throw targetError;
    if (!target) return response.status(404).json({ error: "Version not found." });

    return await withDocumentLease(database, roomId, async () => {
      const current = await liveblocks.getStorageDocument(roomId, "json");
      const { data: beforeRestore, error: beforeError } = await database
        .from("document_snapshots")
        .insert({
          board_id: boardId,
          liveblocks_room_id: roomId,
          document: current,
          checksum: checksum(current),
          name: "Before restore",
          description: `Automatically saved before restoring ${versionId}.`,
          created_by: actor.uid,
          kind: "before_restore",
        })
        .select("id")
        .single();
      if (beforeError) throw beforeError;

      await replaceStorageDocument({
        client: liveblocks,
        roomId,
        current: boardDocumentFromJson(current),
        next: boardDocumentFromJson(target.document),
        commit: async () => {
          if (!branchId) await syncBoardLinks(boardId, target.document);
          const { error } = await database.rpc("complete_kumo_version_restore", {
            p_board_id: boardId,
            p_actor_id: actor.uid,
            p_version_id: versionId,
            p_before_restore_id: beforeRestore.id,
            p_room_id: roomId,
          });
          if (error) throw error;
        },
        rollback: branchId ? undefined : () => syncBoardLinks(boardId, current),
      });
      const revision = Date.now();
      await liveblocks.broadcastEvent(roomId, {
        type: "DOCUMENT_RESTORED", actorId: actor.uid, revision,
      }).catch(() => undefined);
      return response.status(200).json({ restored: true, versionId, beforeRestoreId: beforeRestore.id, revision });
    });
  } catch (error) {
    const message = errorMessage(error, "We couldn't update version history.");
    const status = message === "Authentication required." ? 401
      : error instanceof Error && error.name === "Forbidden" ? 403
      : error instanceof Error && error.name === "DocumentConflict" ? 409
      : 500;
    return response.status(status).json({ error: message });
  }
}
