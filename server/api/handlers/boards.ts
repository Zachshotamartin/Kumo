import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireActor } from "../_auth.js";
import {
  boardSummary,
  getBoardAccess,
  linkedBoardsForActor,
  listBoardsForUser,
  provisionBoard,
  searchPublicBoards,
} from "../_boards.js";
import { allowMethods, errorMessage, stringQuery } from "../_http.js";
import { boardDocumentFromJson, liveblocksAdmin } from "../_liveblocks.js";
import { ensureActorProfile, supabaseAdmin } from "../_supabase.js";
import {
  cloneAssetsToBoard,
  documentAssetIds,
  rewriteDocumentAssetIds,
} from "../_assets.js";
import { syncBoardLinks } from "../_boardLinks.js";
import { randomUUID } from "node:crypto";
import { purgeBoardResources } from "../_lifecycle.js";

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
        const linkedBoards = await linkedBoardsForActor(boardId, actor.uid);
        return response.status(200).json({
          board: { ...boardSummary(access.board, access.role), members, linkedBoards },
        });
      }
      if (scope === "public") {
        return response.status(200).json({ boards: await searchPublicBoards(stringQuery(request.query.query), actor.uid) });
      }
      if (scope === "deleted") {
        const { data, error } = await supabaseAdmin().from("boards")
          .select("id, owner_id, title, visibility, liveblocks_room_id, thumbnail_asset_id, legacy_rtdb_id, created_at, updated_at, deleted_at, workspace_id")
          .eq("owner_id", actor.uid)
          .not("deleted_at", "is", null)
          .order("deleted_at", { ascending: false });
        if (error) throw error;
        return response.status(200).json({ boards: (data ?? []).map((board) => boardSummary(board as never, "owner")) });
      }
      return response.status(200).json({ boards: await listBoardsForUser(actor.uid) });
    }

    if (request.method === "POST") {
      if (request.body?.action === "create-onboarding") {
        const database = supabaseAdmin();
        const { data: claimed, error: claimError } = await database.rpc("claim_kumo_onboarding", { p_user_id: actor.uid });
        if (claimError) throw claimError;
        if (claimed !== true) return response.status(409).json({ error: "The guided sample is available only before creating your first board." });
        const created: Array<Awaited<ReturnType<typeof provisionBoard>>> = [];
        try {
          const linked = await provisionBoard({ ownerId: actor.uid, title: "Kumo tour · Linked ideas", document: {
            backgroundColor: "#252629",
            nodes: {
              intro: { id: "intro", type: "text", name: "Linked board", text: "This is a separate board. Head back to the tour to follow the live board link.", x1: 120, y1: 120, x2: 760, y2: 220, width: 640, height: 100, level: 0, zIndex: 1, parentId: null },
            },
          } });
          created.push(linked);
          const tourDocument = {
            backgroundColor: "#252629",
            nodes: {
              welcome: { id: "welcome", type: "text", name: "Welcome", text: "Welcome to Kumo", x1: 100, y1: 80, x2: 620, y2: 160, width: 520, height: 80, level: 0, zIndex: 1, parentId: null },
              guide: { id: "guide", type: "text", name: "Tour steps", text: "1. Select and move a layer\n2. Open Share to invite someone\n3. Press C to pin a comment\n4. Open Version history from the board menu\n5. Open the linked board below", x1: 100, y1: 190, x2: 700, y2: 410, width: 600, height: 220, level: 0, zIndex: 2, parentId: null },
              link: { id: "link", type: "board", name: "Live linked board", title: linked.title, boardId: linked.id, x1: 100, y1: 450, x2: 460, y2: 660, width: 360, height: 210, level: 0, zIndex: 3, parentId: null },
            },
          };
          const tour = await provisionBoard({ ownerId: actor.uid, title: "Welcome to Kumo", document: tourDocument });
          created.push(tour);
          await syncBoardLinks(tour.id, tourDocument);
          const { error: snapshotError } = await database.from("document_snapshots").insert({
            id: randomUUID(), board_id: tour.id, liveblocks_room_id: tour.liveblocks_room_id,
            document: tourDocument, created_by: actor.uid, kind: "checkpoint",
            name: "Tour starting point", description: "The original guided sample.",
          });
          if (snapshotError) throw snapshotError;
          const { error: completionError } = await database.rpc("complete_kumo_onboarding", { p_user_id: actor.uid });
          if (completionError) throw completionError;
          return response.status(201).json({ board: boardSummary(tour, "owner"), linkedBoardId: linked.id });
        } catch (error) {
          for (const board of created.reverse()) await purgeBoardResources(board).catch(() => undefined);
          await database.rpc("release_kumo_onboarding", { p_user_id: actor.uid });
          throw error;
        }
      }
      if (request.body?.action === "restore") {
        const boardId = typeof request.body?.boardId === "string" ? request.body.boardId : "";
        const { data, error } = await supabaseAdmin().rpc("restore_kumo_board", { p_board_id: boardId, p_actor_id: actor.uid });
        if (error) throw error;
        if (!data) return response.status(404).json({ error: "Deleted board not found." });
        return response.status(200).json({ board: boardSummary(data as never, "owner") });
      }
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
        try {
          let duplicatedDocument: unknown = document;
          const replacements = await cloneAssetsToBoard({
            actorUid: actor.uid,
            targetBoardId: board.id,
            assetIds: documentAssetIds(document),
          });
          if (replacements.size) {
            duplicatedDocument = rewriteDocumentAssetIds(document, replacements);
            const liveblocks = liveblocksAdmin();
            await liveblocks.deleteStorageDocument(board.liveblocks_room_id);
            await liveblocks.initializeStorageDocument(
              board.liveblocks_room_id,
              boardDocumentFromJson(duplicatedDocument)
            );
          }
          await syncBoardLinks(board.id, duplicatedDocument);
        } catch (error) {
          const database = supabaseAdmin();
          const { data: assets } = await database
            .from("assets")
            .select("storage_key")
            .eq("board_id", board.id);
          const storageKeys = (assets ?? []).map((asset) => asset.storage_key as string);
          if (storageKeys.length) {
            await database.storage.from("board-assets").remove(storageKeys).catch(() => undefined);
          }
          await database.from("boards").delete().eq("id", board.id);
          await liveblocksAdmin().deleteRoom(board.liveblocks_room_id).catch(() => undefined);
          throw error;
        }
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
      .select("id, owner_id, title, visibility, liveblocks_room_id, thumbnail_asset_id, legacy_rtdb_id, created_at, updated_at, deleted_at")
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
    console.error("Board API request failed", error);
    const message = errorMessage(error, "The board request failed.");
    return response.status(message === "Authentication required." ? 401 : 500).json({ error: message });
  }
}
