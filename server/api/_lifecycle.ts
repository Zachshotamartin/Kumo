import { adminDatabase, privilegedAdminAuth } from "./_firebaseAdmin.js";
import { liveblocksAdmin } from "./_liveblocks.js";
import { supabaseAdmin } from "./_supabase.js";
import { sendDueNotificationDigests } from "./_push.js";

export interface LifecycleBoard {
  id: string;
  liveblocks_room_id: string;
  legacy_rtdb_id: string | null;
}

interface CommentRoom {
  roomId: string;
}

export interface AccountDeletionClaim {
  user_id: string;
  attempt_count: number;
}

export interface LifecycleSummary {
  accountsClaimed: number;
  accountsDeleted: number;
  accountFailures: number;
  boardsPurged: number;
  boardFailures: number;
  storageCleanups: number;
  storageCleanupFailures: number;
  digestUsers: number;
  digestDeliveries: number;
}

type Database = ReturnType<typeof supabaseAdmin>;

const missingExternalResource = (error: unknown) => {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { status?: number; statusCode?: number; code?: string };
  return candidate.status === 404 || candidate.statusCode === 404 || candidate.code === "auth/user-not-found";
};

const removeStorageObjects = async (database: Database, bucket: string, keys: string[]) => {
  const unique = [...new Set(keys.filter(Boolean))];
  if (!unique.length) return;
  const { error } = await database.storage.from(bucket).remove(unique);
  if (error) throw error;
};

export const purgeBoardResources = async (board: LifecycleBoard, database = supabaseAdmin()) => {
  const [{ data: assets, error: assetError }, { data: branches, error: branchError }] = await Promise.all([
    database.from("assets").select("storage_key").eq("board_id", board.id),
    database.from("document_branches").select("room_id").eq("board_id", board.id),
  ]);
  if (assetError) throw assetError;
  if (branchError) throw branchError;
  await removeStorageObjects(database, "board-assets", (assets ?? []).map((asset) => asset.storage_key as string));
  for (const roomId of [board.liveblocks_room_id, ...(branches ?? []).map((branch) => branch.room_id as string)]) {
    try {
      await liveblocksAdmin().deleteRoom(roomId);
    } catch (error) {
      if (!missingExternalResource(error)) throw error;
    }
  }
  if (board.legacy_rtdb_id) await adminDatabase().ref(`boards/${board.legacy_rtdb_id}`).remove();
  const { error } = await database.from("boards").delete().eq("id", board.id);
  if (error) throw error;
};

const deleteAccountComments = async (userId: string, database: Database) => {
  const { data: memberships, error: membershipError } = await database
    .from("board_members")
    .select("board_id")
    .eq("user_id", userId);
  if (membershipError) throw membershipError;
  const boardIds = [...new Set((memberships ?? []).map((membership) => membership.board_id as string))];
  if (!boardIds.length) return;
  const [{ data: boards, error: boardError }, { data: branches, error: branchError }] = await Promise.all([
    database.from("boards").select("liveblocks_room_id").in("id", boardIds),
    database.from("document_branches").select("room_id").in("board_id", boardIds),
  ]);
  if (boardError) throw boardError;
  if (branchError) throw branchError;
  const rooms: CommentRoom[] = [
    ...(boards ?? []).map((board) => ({ roomId: board.liveblocks_room_id as string })),
    ...(branches ?? []).map((branch) => ({ roomId: branch.room_id as string })),
  ];
  const liveblocks = liveblocksAdmin();
  for (const { roomId } of rooms) {
    try {
      const { data: threads } = await liveblocks.getThreads({ roomId });
      for (const thread of threads) {
        for (const comment of thread.comments) {
          if (comment.userId !== userId) continue;
          try {
            await liveblocks.deleteComment({ roomId, threadId: thread.id, commentId: comment.id });
          } catch (error) {
            if (!missingExternalResource(error)) throw error;
          }
        }
      }
    } catch (error) {
      if (!missingExternalResource(error)) throw error;
    }
  }
};

export const deleteAccountResources = async (claim: AccountDeletionClaim, database = supabaseAdmin()) => {
  const { data: profile, error: profileLookupError } = await database.from("profiles").select("avatar_storage_key").eq("firebase_uid", claim.user_id).maybeSingle();
  if (profileLookupError) throw profileLookupError;
  if (profile?.avatar_storage_key) await removeStorageObjects(database, "profile-avatars", [profile.avatar_storage_key as string]);
  const { data: boards, error: boardError } = await database
    .from("boards")
    .select("id, liveblocks_room_id, legacy_rtdb_id")
    .eq("owner_id", claim.user_id);
  if (boardError) throw boardError;
  for (const board of (boards ?? []) as LifecycleBoard[]) await purgeBoardResources(board, database);

  // Remove authored comments from collaborative rooms that remain after the
  // user's own boards are purged. Asset/font rows on those surviving resources
  // are intentionally preserved; their attribution is nulled by FK on delete.
  await deleteAccountComments(claim.user_id, database);

  try {
    await privilegedAdminAuth().deleteUser(claim.user_id);
  } catch (error) {
    if (!missingExternalResource(error)) throw error;
  }
  const { error: profileError } = await database.from("profiles").delete().eq("firebase_uid", claim.user_id);
  if (profileError) throw profileError;
};

export const runLifecycleMaintenance = async (now = new Date()): Promise<LifecycleSummary> => {
  const database = supabaseAdmin();
  const summary: LifecycleSummary = { accountsClaimed: 0, accountsDeleted: 0, accountFailures: 0, boardsPurged: 0, boardFailures: 0, storageCleanups: 0, storageCleanupFailures: 0, digestUsers: 0, digestDeliveries: 0 };
  const { data: claims, error: claimError } = await database.rpc("claim_due_kumo_account_deletions", { p_limit: 20 });
  if (claimError) throw claimError;
  summary.accountsClaimed = claims?.length ?? 0;
  for (const claim of (claims ?? []) as AccountDeletionClaim[]) {
    try {
      await deleteAccountResources(claim, database);
      summary.accountsDeleted += 1;
    } catch (error) {
      summary.accountFailures += 1;
      await database.from("account_deletion_requests").update({
        processing_started_at: null,
        last_error: error instanceof Error ? error.message.slice(0, 1000) : "Unknown account deletion failure",
      }).eq("user_id", claim.user_id);
    }
  }

  const cutoff = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const { data: expiredBoards, error: expiredError } = await database.rpc("claim_expired_kumo_boards", {
    p_cutoff: cutoff,
    p_limit: 50,
  });
  if (expiredError) throw expiredError;
  for (const board of (expiredBoards ?? []) as LifecycleBoard[]) {
    try {
      await purgeBoardResources(board, database);
      summary.boardsPurged += 1;
    } catch (error) {
      summary.boardFailures += 1;
      await database.from("boards").update({
        purge_started_at: null,
        purge_last_error: error instanceof Error ? error.message.slice(0, 1000) : "Unknown purge failure",
      }).eq("id", board.id);
      await database.from("audit_events").insert({
        board_id: board.id,
        event_type: "board.purge_failed",
        payload: { message: error instanceof Error ? error.message.slice(0, 1000) : "Unknown purge failure" },
      });
    }
  }
  const { data: cleanupClaims, error: cleanupClaimError } = await database.rpc("claim_due_kumo_storage_cleanups", { p_limit: 50 });
  if (cleanupClaimError) throw cleanupClaimError;
  for (const cleanup of (cleanupClaims ?? []) as Array<{ id: string; bucket: string; storage_key: string }>) {
    try {
      await removeStorageObjects(database, cleanup.bucket, [cleanup.storage_key]);
      const { error } = await database.from("storage_cleanup_jobs").delete().eq("id", cleanup.id);
      if (error) throw error;
      summary.storageCleanups += 1;
    } catch (error) {
      summary.storageCleanupFailures += 1;
      await database.from("storage_cleanup_jobs").update({
        processing_started_at: null,
        next_attempt_at: new Date(now.getTime() + 30 * 60 * 1000).toISOString(),
        last_error: error instanceof Error ? error.message.slice(0, 1000) : "Unknown storage cleanup failure",
      }).eq("id", cleanup.id);
    }
  }
  const digests = await sendDueNotificationDigests(now);
  summary.digestUsers = digests.users;
  summary.digestDeliveries = digests.delivered;
  return summary;
};
