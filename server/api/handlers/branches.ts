import { createHash, randomUUID } from "node:crypto";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireActor } from "../_auth.js";
import { syncBoardLinks } from "../_boardLinks.js";
import { getBoardAccess } from "../_boards.js";
import { replaceStorageDocument, withDocumentLease } from "../_documentMutation.js";
import { allowMethods, errorMessage, stringQuery } from "../_http.js";
import { boardDocumentFromJson, liveblocksAdmin } from "../_liveblocks.js";
import { supabaseAdmin } from "../_supabase.js";
import { branchVisualDiff, threeWayMergeDocuments } from "../_branchMerge.js";
import { sendPreferredPushToUser } from "../_push.js";
import { checkCoverageMergeGate } from "../_coverageGate.js";

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
        .select("id, board_id, name, room_id, created_by, status, base_checksum, updated_from_main_at, merge_description, created_at, updated_at, merged_at, branch_reviews(reviewer_id,status,note,reviewed_checksum,updated_at)")
        .eq("board_id", boardId)
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return response.status(200).json({ branches: data ?? [] });
    }

    const action = typeof request.body?.action === "string" ? request.body.action : "create";
    if (!editable(access.role) && !["diff", "review"].includes(action)) return response.status(403).json({ error: "Editing access is required to manage branches." });
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
        const { data, error } = await database.rpc("create_kumo_branch_record", {
          p_id: id,
          p_board_id: boardId,
          p_name: name,
          p_room_id: roomId,
          p_actor_id: actor.uid,
          p_base_checksum: checksum(document),
        });
        if (error) throw error;
        if (!data) throw new Error("The branch record could not be created.");
        const { error: baseError } = await database.from("document_branches").update({ base_document: document }).eq("id", id);
        if (baseError) throw baseError;
        return response.status(201).json({ branch: data });
      } catch (error) {
        await liveblocks.deleteRoom(roomId).catch(() => undefined);
        throw error;
      }
    }

    const branchId = typeof request.body?.branchId === "string" ? request.body.branchId : "";
    const { data: branch, error: branchError } = await database.from("document_branches")
      .select("id, board_id, name, room_id, created_by, status, base_checksum, base_document, updated_from_main_at, merge_description, created_at, updated_at, merged_at")
      .eq("id", branchId).eq("board_id", boardId).maybeSingle();
    if (branchError) throw branchError;
    if (!branch) return response.status(404).json({ error: "Branch not found." });

    if (action === "diff") {
      const [mainDocument, branchDocument] = await Promise.all([
        liveblocks.getStorageDocument(access.board.liveblocks_room_id, "json"),
        liveblocks.getStorageDocument(branch.room_id as string, "json"),
      ]);
      return response.status(200).json({ diff: branchVisualDiff(mainDocument, branchDocument) });
    }

    if (action === "rename") {
      const name = cleanName(request.body?.name);
      if (!name) return response.status(400).json({ error: "A branch name is required." });
      const { data, error } = await database.from("document_branches")
        .update({ name, updated_at: new Date().toISOString() }).eq("id", branchId)
        .select("id, board_id, name, room_id, created_by, status, base_checksum, updated_from_main_at, created_at, updated_at, merged_at").single();
      if (error) throw error;
      return response.status(200).json({ branch: data });
    }

    if (action === "restore") {
      if (branch.status !== "archived") return response.status(409).json({ error: "Only archived branches can be restored." });
      const { error } = await database.from("document_branches").update({ status: "open", updated_at: new Date().toISOString() }).eq("id", branchId);
      if (error) throw error;
      return response.status(200).json({ restored: true, branchId });
    }

    if (action === "request-review") {
      const requested: string[] = Array.isArray(request.body?.reviewers) ? request.body.reviewers.filter((value: unknown): value is string => typeof value === "string" && value.trim().length > 0).slice(0, 20) : [];
      if (!requested.length) return response.status(400).json({ error: "Choose at least one reviewer." });
      const normalized = requested.map((value) => value.trim());
      const { data: profiles, error: profileError } = await database.from("profiles")
        .select("firebase_uid, email").or(normalized.map((value) => value.includes("@") ? `email.ilike.${value}` : `firebase_uid.eq.${value}`).join(","));
      if (profileError) throw profileError;
      const reviewers = (profiles ?? []).filter((profile) => profile.firebase_uid !== actor.uid);
      if (!reviewers.length) return response.status(400).json({ error: "No eligible Kumo reviewers were found." });
      const rows = reviewers.map((reviewer) => ({ branch_id: branchId, reviewer_id: reviewer.firebase_uid, status: "requested", note: String(request.body?.note ?? "").slice(0, 1000), reviewed_checksum: null, updated_at: new Date().toISOString() }));
      const { error } = await database.from("branch_reviews").upsert(rows, { onConflict: "branch_id,reviewer_id" });
      if (error) throw error;
      const notifications = reviewers.map((reviewer) => ({ recipient_id: reviewer.firebase_uid, actor_id: actor.uid, board_id: boardId, kind: "branch", title: `Review requested: ${branch.name}`, body: String(request.body?.note ?? "Please review this branch.").slice(0, 500), action_url: `/?board=${encodeURIComponent(boardId)}&branch=${encodeURIComponent(branchId)}` }));
      const { error: noticeError } = await database.from("account_notifications").insert(notifications);
      if (noticeError) throw noticeError;
      await Promise.allSettled(notifications.map((notification) => sendPreferredPushToUser(notification.recipient_id, "branch_reviews", {
        title: notification.title, body: notification.body, url: notification.action_url, tag: `kumo:branch-review:${branchId}`,
      })));
      return response.status(200).json({ requested: reviewers.map((reviewer) => reviewer.firebase_uid) });
    }

    if (action === "update-from-main") {
      if (branch.status !== "open") return response.status(409).json({ error: "Only open branches can be updated." });
      const [mainDocument, branchDocument] = await Promise.all([
        liveblocks.getStorageDocument(access.board.liveblocks_room_id, "json"),
        liveblocks.getStorageDocument(branch.room_id as string, "json"),
      ]);
      const resolutions = request.body?.resolutions && typeof request.body.resolutions === "object"
        ? request.body.resolutions as Record<string, "main" | "branch">
        : {};
      const merged = threeWayMergeDocuments(branch.base_document ?? mainDocument, mainDocument, branchDocument, resolutions);
      const { error: clearError } = await database.from("branch_conflicts").delete().eq("branch_id", branchId);
      if (clearError) throw clearError;
      if (merged.conflicts.length) {
        const { error: conflictError } = await database.from("branch_conflicts").insert(merged.conflicts.map((conflict) => ({
          branch_id: branchId, shape_id: conflict.shapeId, base_value: conflict.baseValue ?? null,
          main_value: conflict.mainValue ?? null, branch_value: conflict.branchValue ?? null,
        })));
        if (conflictError) throw conflictError;
        return response.status(409).json({ error: "Resolve the branch conflicts before updating.", code: "BRANCH_CONFLICTS", conflicts: merged.conflicts });
      }
      await replaceStorageDocument({
        client: liveblocks,
        roomId: branch.room_id as string,
        current: boardDocumentFromJson(branchDocument),
        next: boardDocumentFromJson(merged.document),
        commit: async () => {
          const { error } = await database.from("document_branches").update({
            base_document: mainDocument,
            base_checksum: checksum(mainDocument),
            updated_from_main_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          }).eq("id", branchId);
          if (error) throw error;
        },
      });
      return response.status(200).json({ updated: true, branchId, diff: branchVisualDiff(mainDocument, merged.document) });
    }

    if (action === "review") {
      const status = request.body?.status === "approved" ? "approved" : request.body?.status === "changes-requested" ? "changes-requested" : null;
      if (!status) return response.status(400).json({ error: "A valid review status is required." });
      const reviewedDocument = await liveblocks.getStorageDocument(branch.room_id as string, "json");
      const { error } = await database.from("branch_reviews").upsert({
        branch_id: branchId,
        reviewer_id: actor.uid,
        status,
        note: String(request.body?.note ?? "").slice(0, 1000),
        reviewed_checksum: checksum(reviewedDocument),
        updated_at: new Date().toISOString(),
      }, { onConflict: "branch_id,reviewer_id" });
      if (error) throw error;
      return response.status(200).json({ reviewed: true, status });
    }

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
          error: "Main changed after this branch was created. Update the branch from main and resolve any conflicts before merging.",
          code: "BRANCH_BASE_DIVERGED",
        });
      }
      const { data: reviews, error: reviewError } = await database.from("branch_reviews")
        .select("reviewer_id, status, reviewed_checksum")
        .eq("branch_id", branchId);
      if (reviewError) throw reviewError;
      const branchChecksum = checksum(branchDocument);
      const coverageGate = await checkCoverageMergeGate(boardId, branchId, branchChecksum);
      if (coverageGate.blocked) {
        const overrideReason = typeof request.body?.coverageOverrideReason === "string" ? request.body.coverageOverrideReason.trim().slice(0, 1000) : "";
        if (access.role !== "owner" || overrideReason.length < 8) return response.status(409).json({ error: coverageGate.error, code: coverageGate.code, coverage: coverageGate.run ?? null });
        const { error: overrideError } = await database.from("coverage_gate_overrides").insert({ board_id: boardId, branch_id: branchId, run_id: coverageGate.run?.id ?? null, actor_id: actor.uid, reason: overrideReason });
        if (overrideError) throw overrideError;
      }
      const blockingReviews = (reviews ?? []).filter((review) => review.status === "changes-requested" && (!review.reviewed_checksum || review.reviewed_checksum === branchChecksum));
      if (blockingReviews.length) return response.status(409).json({
        error: "Resolve the requested branch changes before merging.",
        code: "BRANCH_CHANGES_REQUESTED",
        reviewers: blockingReviews.map((review) => review.reviewer_id),
      });
      const { data: checkpoint, error: checkpointError } = await database.from("document_snapshots").insert({
        board_id: boardId, liveblocks_room_id: access.board.liveblocks_room_id, document: current,
        checksum: checksum(current), name: `Before merging ${branch.name}`,
        created_by: actor.uid, kind: "before_restore", description: cleanName(request.body?.description) || `Automatic recovery point for branch ${branchId}.`,
      }).select("id").single();
      if (checkpointError) throw checkpointError;

      await replaceStorageDocument({
        client: liveblocks,
        roomId: access.board.liveblocks_room_id,
        current: boardDocumentFromJson(current),
        next: boardDocumentFromJson(branchDocument),
        commit: async () => {
          await syncBoardLinks(boardId, branchDocument);
          const mergeDescription = String(request.body?.description ?? "").trim().slice(0, 1000);
          if (mergeDescription) {
            const { error: descriptionError } = await database.from("document_branches").update({ merge_description: mergeDescription }).eq("id", branchId);
            if (descriptionError) throw descriptionError;
          }
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
    console.error("Branch API request failed", error);
    const message = errorMessage(error, "We couldn't update design branches.");
    const status = message === "Authentication required." ? 401
      : error instanceof Error && error.name === "DocumentConflict" ? 409
      : 500;
    return response.status(status).json({ error: message });
  }
}
