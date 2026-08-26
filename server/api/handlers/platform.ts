import { randomBytes, randomUUID } from "node:crypto";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireActor } from "../_auth.js";
import { getBoardAccess, listBoardsForUser, provisionBoard, searchPublicBoards } from "../_boards.js";
import { allowMethods, errorMessage, stringQuery } from "../_http.js";
import { liveblocksAdmin } from "../_liveblocks.js";
import { folderMoveCreatesCycle, hashPassword, sanitizeExtensionManifest, summarizeConnectionTelemetry, verifyPassword } from "../_platform.js";
import { enforceRateLimit, hashSecret, openSessionGuestId, requestOrigin, validOpenSessionGuestNonce } from "../_security.js";
import { ensureActorProfile, supabaseAdmin } from "../_supabase.js";
import { pushConfigured, sendPushToUser } from "../_push.js";
import { friendshipRowsForActor, otherUserId } from "../_profiles.js";
import { buildAccountExport } from "../_accountExport.js";

type WorkspaceRole = "owner" | "admin" | "member" | "guest";
const clean = (value: unknown, fallback = "", limit = 120) => typeof value === "string" ? value.trim().slice(0, limit) || fallback : fallback;
const isCommunityModerator = (uid: string) => (process.env.KUMO_MODERATOR_UIDS ?? "").split(",").map((id) => id.trim()).filter(Boolean).includes(uid);

const primaryWorkspace = async (uid: string, displayName: string) => {
  const database = supabaseAdmin();
  const { data: membership, error: membershipError } = await database.from("workspace_members")
    .select("workspace_id, role, workspaces(id, name, owner_id, created_at, updated_at)").eq("user_id", uid).order("created_at", { ascending: true }).limit(1).maybeSingle();
  if (membershipError) throw membershipError;
  if (membership) {
    const relatedWorkspace = Array.isArray(membership.workspaces) ? membership.workspaces[0] : membership.workspaces;
    return { workspace_id: membership.workspace_id as string, role: membership.role as WorkspaceRole, workspaces: relatedWorkspace as { id: string; name: string; owner_id: string } };
  }
  const { data: workspace, error } = await database.from("workspaces").insert({ name: `${displayName}'s workspace`, owner_id: uid }).select("id, name, owner_id, created_at, updated_at").single();
  if (error) throw error;
  const { error: memberError } = await database.from("workspace_members").insert({ workspace_id: workspace.id, user_id: uid, role: "owner" });
  if (memberError) throw memberError;
  return { workspace_id: workspace.id as string, role: "owner" as const, workspaces: workspace as { id: string; name: string; owner_id: string } };
};

const workspaceAccess = async (workspaceId: string, uid: string) => {
  const { data, error } = await supabaseAdmin().from("workspace_members").select("role").eq("workspace_id", workspaceId).eq("user_id", uid).maybeSingle();
  if (error) throw error;
  return data?.role as WorkspaceRole | undefined;
};

const requireWorkspaceAdmin = async (workspaceId: string, uid: string) => {
  const role = await workspaceAccess(workspaceId, uid);
  if (role !== "owner" && role !== "admin") {
    const error = new Error("Workspace administration access is required.");
    error.name = "Forbidden";
    throw error;
  }
  return role;
};

export default async function handler(request: VercelRequest, response: VercelResponse) {
  if (!allowMethods(request, response, ["GET", "POST"])) return;
  try {
    const action = typeof request.body?.action === "string" ? request.body.action : "";
    if (request.method === "POST" && action === "redeem-prototype") {
      if (!(await enforceRateLimit(request, response, action, "anonymous", 20, 60))) return;
      const database = supabaseAdmin();
      const token = clean(request.body?.token, "", 256);
      const { data: link, error } = await database.from("prototype_share_links").select("id, board_id, start_shape_id, password_hash, device_frame, expires_at, revoked_at").eq("token_hash", hashSecret(token)).maybeSingle();
      if (error) throw error;
      if (!link || link.revoked_at || (link.expires_at && new Date(link.expires_at).getTime() <= Date.now())) return response.status(404).json({ error: "Prototype link is unavailable." });
      if (!verifyPassword(clean(request.body?.password, "", 256), link.password_hash)) return response.status(403).json({ error: "Prototype password is incorrect." });
      const { data: board, error: boardError } = await database.from("boards").select("id, title, liveblocks_room_id").eq("id", link.board_id).is("deleted_at", null).maybeSingle();
      if (boardError) throw boardError;
      if (!board) return response.status(404).json({ error: "Prototype board no longer exists." });
      const document = await liveblocksAdmin().getStorageDocument(board.liveblocks_room_id, "json");
      return response.status(200).json({ prototype: { boardId: board.id, title: board.title, startShapeId: link.start_shape_id, deviceFrame: link.device_frame, document } });
    }
    if (request.method === "POST" && action === "redeem-open-session") {
      if (!(await enforceRateLimit(request, response, action, "anonymous", 20, 60))) return;
      const database = supabaseAdmin();
      const token = clean(request.body?.token, "", 256);
      const guestNonce = clean(request.body?.guestNonce, "", 80);
      if (!validOpenSessionGuestNonce(guestNonce)) return response.status(400).json({ error: "A valid guest session nonce is required." });
      const { data: session, error } = await database.from("board_open_sessions")
        .select("id, board_id, password_hash, role, expires_at, revoked_at, use_count, boards(id, title, liveblocks_room_id, visibility, owner_id, updated_at)")
        .eq("token_hash", hashSecret(token)).maybeSingle();
      if (error) throw error;
      if (!session || session.revoked_at || new Date(session.expires_at).getTime() <= Date.now()) return response.status(404).json({ error: "This open session is unavailable." });
      if (!verifyPassword(clean(request.body?.password, "", 256), session.password_hash)) return response.status(403).json({ error: "The session password is incorrect." });
      const relatedBoard = Array.isArray(session.boards) ? session.boards[0] : session.boards;
      if (!relatedBoard?.liveblocks_room_id) return response.status(404).json({ error: "This board no longer exists." });
      await database.from("board_open_sessions").update({ last_used_at: new Date().toISOString(), use_count: Number(session.use_count ?? 0) + 1 }).eq("id", session.id);
      return response.status(200).json({ session: {
        id: session.id,
        boardId: relatedBoard.id,
        title: relatedBoard.title,
        roomId: relatedBoard.liveblocks_room_id,
        ownerId: relatedBoard.owner_id,
        visibility: relatedBoard.visibility,
        role: session.role,
        expiresAt: session.expires_at,
        guestId: openSessionGuestId(token, guestNonce),
        updatedAt: relatedBoard.updated_at ? new Date(relatedBoard.updated_at).getTime() : null,
      } });
    }
    const actor = await requireActor(request);
    const profile = await ensureActorProfile(actor);
    const database = supabaseAdmin();

    if (request.method === "POST" && action === "accept-workspace-invitation") {
      if (!(await enforceRateLimit(request, response, action, actor.uid, 10, 60))) return;
      const token = clean(request.body?.token, "", 256);
      const { data, error } = await database.rpc("accept_kumo_workspace_invitation", { p_token_hash: hashSecret(token), p_actor_id: actor.uid, p_actor_email: profile.email });
      if (error) throw error;
      return response.status(200).json({ accepted: true, workspaceId: data });
    }

    if (request.method === "GET") {
      const scope = stringQuery(request.query.scope) || "workspace-admin";
      if (scope === "workspace-admin") {
        const workspace = await primaryWorkspace(actor.uid, profile.displayName);
        const [{ data: memberships, error: memberError }, { data: folders, error: folderError }, { data: invitations, error: invitationError }] = await Promise.all([
          database.from("workspace_members").select("user_id, role, created_at").eq("workspace_id", workspace.workspace_id).order("created_at"),
          database.from("workspace_folders").select("id, workspace_id, parent_id, name, created_by, created_at, updated_at").eq("workspace_id", workspace.workspace_id).order("name"),
          database.from("workspace_invitations").select("id, email, role, status, expires_at, created_at").eq("workspace_id", workspace.workspace_id).eq("status", "pending").order("created_at", { ascending: false }),
        ]);
        if (memberError) throw memberError;
        if (folderError) throw folderError;
        if (invitationError) throw invitationError;
        const ids = (memberships ?? []).map((membership) => membership.user_id as string);
        const { data: profiles, error: profileError } = ids.length
          ? await database.from("profiles").select("firebase_uid, display_name, email, avatar_url, username").in("firebase_uid", ids)
          : { data: [], error: null };
        if (profileError) throw profileError;
        const byId = new Map((profiles ?? []).map((item) => [item.firebase_uid as string, item]));
        return response.status(200).json({ workspace, members: (memberships ?? []).map((membership) => ({ ...membership, profile: byId.get(membership.user_id as string) ?? null })), folders: folders ?? [], invitations: invitations ?? [] });
      }
      if (scope === "notification-preferences") {
        const defaults = { user_id: actor.uid, browser_enabled: false, digest: "instant", board_comments: "all", branch_reviews: true, library_updates: true, access_changes: true };
        const { data, error } = await database.from("notification_preferences").select("*").eq("user_id", actor.uid).maybeSingle();
        if (error) throw error;
        return response.status(200).json({ preferences: data ?? defaults });
      }
      if (scope === "push-config") {
        return response.status(200).json({ configured: pushConfigured(), publicKey: pushConfigured() ? process.env.VAPID_PUBLIC_KEY!.trim() : "" });
      }
      if (scope === "workspace-fonts") {
        const workspace = await primaryWorkspace(actor.uid, profile.displayName);
        const { data, error } = await database.from("workspace_fonts").select("id, workspace_id, family, style, weight_min, weight_max, storage_key, mime_type, created_at").eq("workspace_id", workspace.workspace_id).order("family");
        if (error) throw error;
        const keys = (data ?? []).map((font) => font.storage_key as string);
        const signed = keys.length ? await database.storage.from("workspace-fonts").createSignedUrls(keys, 60 * 60) : { data: [], error: null };
        if (signed.error) throw signed.error;
        const urls = new Map((signed.data ?? []).map((item) => [item.path, item.signedUrl]));
        return response.status(200).json({ fonts: (data ?? []).map((font) => ({ ...font, url: urls.get(font.storage_key as string) ?? null })) });
      }
      if (scope === "global-search") {
        const query = clean(stringQuery(request.query.q), "", 120);
        if (!query) return response.status(200).json({ results: [] });
        const [ownBoards, publicBoards, profileResult, templateResult, communityResult, relationships] = await Promise.all([
          listBoardsForUser(actor.uid), searchPublicBoards(query, actor.uid),
          database.from("profiles").select("firebase_uid, username, display_name, avatar_url").eq("discoverable", true).eq("email_verified", true).or(`username.ilike.%${query.replace(/[%,]/g, "")}%,display_name.ilike.%${query.replace(/[%,]/g, "")}%`).limit(12),
          database.from("board_templates").select("id, owner_id, name, description, visibility").or(`owner_id.eq.${actor.uid},visibility.eq.public`).ilike("name", `%${query.replace(/[%,]/g, "")}%`).limit(12),
          database.from("community_publications").select("board_id, published_by, slug, description, tags, remix_count, boards(title)").ilike("description", `%${query.replace(/[%,]/g, "")}%`).limit(12),
          friendshipRowsForActor(actor.uid),
        ]);
        if (profileResult.error) throw profileResult.error;
        if (templateResult.error) throw templateResult.error;
        if (communityResult.error) throw communityResult.error;
        const boardResults = [...new Map([...ownBoards.filter((board) => board.title.toLowerCase().includes(query.toLowerCase())), ...publicBoards].map((board) => [board.id, board])).values()];
        const hiddenProfileIds = new Set(relationships
          .filter((row) => row.status === "blocked")
          .map((row) => otherUserId(row, actor.uid)));
        const visibleProfiles = (profileResult.data ?? []).filter((item) => item.firebase_uid !== actor.uid && !hiddenProfileIds.has(item.firebase_uid));
        return response.status(200).json({ results: [
          ...boardResults.map((board) => ({ kind: "board", id: board.id, label: board.title, detail: board.role ?? "public", actionUrl: `/?board=${encodeURIComponent(board.id)}` })),
          ...visibleProfiles.map((item) => ({ kind: "profile", id: item.firebase_uid, label: item.display_name, detail: `@${item.username}`, actionUrl: `/?profile=${encodeURIComponent(item.username)}` })),
          ...(templateResult.data ?? []).filter((item) => item.owner_id === actor.uid || !hiddenProfileIds.has(item.owner_id)).map((item) => ({ kind: "template", id: item.id, label: item.name, detail: item.description, actionUrl: `/?template=${encodeURIComponent(item.id)}` })),
          ...(communityResult.data ?? []).filter((item) => !hiddenProfileIds.has(item.published_by)).map((item) => ({ kind: "community", id: item.board_id, label: (item.boards as { title?: string } | null)?.title ?? item.slug, detail: item.description, actionUrl: `/?community=${encodeURIComponent(item.slug)}` })),
        ].slice(0, 40) });
      }
      if (scope === "operations") {
        const boardId = stringQuery(request.query.boardId);
        if (boardId && !(await getBoardAccess(boardId, actor.uid))) return response.status(404).json({ error: "Board not found." });
        const { data: events, error } = await database.from("audit_events").select("id, board_id, actor_id, event_type, payload, created_at")
          .eq(boardId ? "board_id" : "actor_id", boardId || actor.uid).order("created_at", { ascending: false }).limit(250);
        if (error) throw error;
        const telemetry = (events ?? []).filter((event) => event.event_type === "collaboration.connection").map((event) => ({ ...(event.payload as Record<string, unknown>), at: event.created_at })) as Array<{ event: "ready" | "lost" | "failed" | "restored"; retryCount?: number; durationMs?: number; at: string }>;
        return response.status(200).json({ events: events ?? [], telemetry: summarizeConnectionTelemetry(telemetry) });
      }
      if (scope === "extensions") {
        const { data, error } = await database.from("extension_catalog")
          .select("id, name, description, manifest, publisher_id, verified, updated_at, installed_extensions!left(user_id, granted_permissions, enabled)")
          .or(`verified.eq.true,publisher_id.eq.${actor.uid}`)
          .eq("installed_extensions.user_id", actor.uid)
          .order("verified", { ascending: false });
        if (error) throw error;
        return response.status(200).json({ extensions: data ?? [] });
      }
      if (scope === "prototype-links") {
        const boardId = stringQuery(request.query.boardId);
        const access = await getBoardAccess(boardId, actor.uid);
        if (!access || access.role !== "owner") return response.status(403).json({ error: "Only the owner can manage prototype links." });
        const { data, error } = await database.from("prototype_share_links").select("id, board_id, start_shape_id, device_frame, expires_at, revoked_at, created_at").eq("board_id", boardId).order("created_at", { ascending: false });
        if (error) throw error;
        return response.status(200).json({ links: data ?? [] });
      }
      if (scope === "open-sessions") {
        const boardId = stringQuery(request.query.boardId);
        const access = await getBoardAccess(boardId, actor.uid);
        if (!access || access.role !== "owner") return response.status(403).json({ error: "Only the owner can manage open sessions." });
        const { data, error } = await database.from("board_open_sessions").select("id, board_id, role, expires_at, revoked_at, last_used_at, use_count, created_at").eq("board_id", boardId).order("created_at", { ascending: false });
        if (error) throw error;
        return response.status(200).json({ sessions: data ?? [] });
      }
      if (scope === "community") {
        const [{ data, error }, relationships] = await Promise.all([
          database.from("community_publications").select("board_id, published_by, slug, description, tags, remix_allowed, remix_count, published_at, boards(title, thumbnail_asset_id)").order("published_at", { ascending: false }).limit(48),
          friendshipRowsForActor(actor.uid),
        ]);
        if (error) throw error;
        const hiddenProfileIds = new Set(relationships.filter((row) => row.status === "blocked").map((row) => otherUserId(row, actor.uid)));
        return response.status(200).json({ publications: (data ?? []).filter((publication) => !hiddenProfileIds.has(publication.published_by)), canModerate: isCommunityModerator(actor.uid) });
      }
      if (scope === "community-moderation") {
        if (!isCommunityModerator(actor.uid)) return response.status(403).json({ error: "Community moderator access is required." });
        const { data, error } = await database.from("community_reports")
          .select("id, board_id, reporter_id, category, reason, status, reviewed_by, reviewed_at, review_note, created_at, boards(title), community_publications(slug)")
          .eq("status", "open")
          .order("created_at", { ascending: true })
          .limit(100);
        if (error) throw error;
        return response.status(200).json({ reports: data ?? [] });
      }
      if (scope === "account-export") {
        return response.status(200).json(await buildAccountExport(actor.uid, profile));
      }
      if (scope === "account-sessions") {
        const { data, error } = await database.from("account_sessions").select("id, user_agent, created_at, last_seen_at, revoked_at").eq("user_id", actor.uid).order("last_seen_at", { ascending: false }).limit(20);
        if (error) throw error;
        const rawCurrent = request.headers["x-kumo-session-id"];
        const currentSessionId = (Array.isArray(rawCurrent) ? rawCurrent[0] : rawCurrent) ?? "";
        return response.status(200).json({ sessions: (data ?? []).map((session) => ({ ...session, current: session.id === currentSessionId })) });
      }
      if (scope === "account-deletion") {
        const { data, error } = await database.from("account_deletion_requests")
          .select("requested_at, scheduled_for, cancelled_at, processing_started_at, attempt_count, last_error")
          .eq("user_id", actor.uid)
          .maybeSingle();
        if (error) throw error;
        return response.status(200).json({ deletion: data });
      }
      return response.status(400).json({ error: "Unknown platform scope." });
    }

    if (!(await enforceRateLimit(request, response, `platform-${action || "unknown"}`, actor.uid, 40, 60))) return;

    if (["rename-workspace", "invite-workspace-member", "cancel-workspace-invitation", "update-workspace-member", "remove-workspace-member", "transfer-workspace-ownership", "rename-folder", "move-folder", "delete-folder"].includes(action)) {
      const workspaceId = clean(request.body?.workspaceId);
      const role = await requireWorkspaceAdmin(workspaceId, actor.uid);
      if (action === "rename-workspace") {
        const { data, error } = await database.from("workspaces").update({ name: clean(request.body?.name, "Untitled workspace") }).eq("id", workspaceId).select("id, name, owner_id").single();
        if (error) throw error;
        return response.status(200).json({ workspace: data });
      }
      if (action === "invite-workspace-member") {
        const email = clean(request.body?.email, "", 320).toLowerCase();
        const memberRole = ["admin", "member", "guest"].includes(request.body?.role) ? request.body.role : "member";
        if (!/^\S+@\S+\.\S+$/.test(email)) return response.status(400).json({ error: "Enter a valid email address." });
        const { data: existing, error: existingError } = await database.from("profiles").select("firebase_uid, email, display_name").eq("email_verified", true).ilike("email", email).maybeSingle();
        if (existingError) throw existingError;
        if (existing) {
          const { error } = await database.rpc("upsert_kumo_workspace_member", {
            p_workspace_id: workspaceId, p_actor_id: actor.uid,
            p_user_id: existing.firebase_uid, p_role: memberRole,
          });
          if (error) throw error;
          return response.status(200).json({ added: true, userId: existing.firebase_uid, role: memberRole });
        }
        const token = randomBytes(32).toString("base64url");
        const { data, error } = await database.rpc("create_or_refresh_kumo_workspace_invitation", {
          p_workspace_id: workspaceId,
          p_email: email,
          p_role: memberRole,
          p_token_hash: hashSecret(token),
          p_invited_by: actor.uid,
        });
        if (error) throw error;
        const url = `${requestOrigin(request)}/?workspaceInvite=${encodeURIComponent(token)}`;
        return response.status(202).json({ invitation: data, url });
      }
      if (action === "cancel-workspace-invitation") {
        const { error } = await database.from("workspace_invitations").update({ status: "cancelled" }).eq("workspace_id", workspaceId).eq("id", clean(request.body?.invitationId));
        if (error) throw error;
        return response.status(200).json({ cancelled: true });
      }
      if (action === "update-workspace-member" || action === "remove-workspace-member") {
        const userId = clean(request.body?.userId);
        if (userId === actor.uid && role === "owner") return response.status(409).json({ error: "The workspace owner cannot remove or demote themselves." });
        if (action === "remove-workspace-member") {
          const { error } = await database.rpc("remove_kumo_workspace_member", { p_workspace_id: workspaceId, p_actor_id: actor.uid, p_user_id: userId });
          if (error) throw error;
          return response.status(200).json({ removed: true });
        }
        const memberRole = ["admin", "member", "guest"].includes(request.body?.role) ? request.body.role : "member";
        const { error } = await database.rpc("update_kumo_workspace_member", {
          p_workspace_id: workspaceId, p_actor_id: actor.uid, p_user_id: userId, p_role: memberRole,
        });
        if (error) throw error;
        return response.status(200).json({ updated: true, role: memberRole });
      }
      if (action === "transfer-workspace-ownership") {
        if (role !== "owner") return response.status(403).json({ error: "Only the workspace owner can transfer ownership." });
        const userId = clean(request.body?.userId);
        if (!userId || userId === actor.uid) return response.status(400).json({ error: "Choose another workspace member." });
        const { error } = await database.rpc("transfer_kumo_workspace_ownership", {
          p_workspace_id: workspaceId,
          p_actor_id: actor.uid,
          p_new_owner_id: userId,
        });
        if (error) throw error;
        return response.status(200).json({ transferred: true, ownerId: userId });
      }
      const folderId = clean(request.body?.folderId);
      const { data: folders, error: folderError } = await database.from("workspace_folders").select("id, parent_id").eq("workspace_id", workspaceId);
      if (folderError) throw folderError;
      const folderList = folders ?? [];
      if (!folderList.some((folder) => folder.id === folderId)) return response.status(404).json({ error: "Folder not found." });
      if (action === "rename-folder") {
        const { data, error } = await database.from("workspace_folders").update({ name: clean(request.body?.name, "Untitled folder") }).eq("id", folderId).eq("workspace_id", workspaceId).select("id, workspace_id, parent_id, name").single();
        if (error) throw error;
        return response.status(200).json({ folder: data });
      }
      if (action === "move-folder") {
        const parentId = clean(request.body?.parentId) || null;
        if (parentId && !folderList.some((folder) => folder.id === parentId)) return response.status(404).json({ error: "Parent folder not found in this workspace." });
        if (folderMoveCreatesCycle(folderList, folderId, parentId)) return response.status(409).json({ error: "A folder cannot be moved into itself or one of its descendants." });
        const { data, error } = await database.from("workspace_folders").update({ parent_id: parentId }).eq("id", folderId).eq("workspace_id", workspaceId).select("id, workspace_id, parent_id, name").single();
        if (error) throw error;
        return response.status(200).json({ folder: data });
      }
      const hasChildren = folderList.some((folder) => folder.parent_id === folderId);
      if (hasChildren && request.body?.recursive !== true) return response.status(409).json({ error: "Move or delete nested folders first, or confirm recursive deletion." });
      const { error } = await database.from("workspace_folders").delete().eq("id", folderId).eq("workspace_id", workspaceId);
      if (error) throw error;
      return response.status(200).json({ deleted: true });
    }

    if (action === "leave-workspace") {
      const workspaceId = clean(request.body?.workspaceId);
      const role = await workspaceAccess(workspaceId, actor.uid);
      if (role === "owner") return response.status(409).json({ error: "The owner cannot leave without transferring the workspace." });
      const { error } = await database.rpc("leave_kumo_workspace", { p_workspace_id: workspaceId, p_user_id: actor.uid });
      if (error) throw error;
      return response.status(200).json({ left: true });
    }

    if (action === "update-notification-preferences") {
      const input = request.body?.preferences && typeof request.body.preferences === "object" ? request.body.preferences as Record<string, unknown> : {};
      const preferences = {
        user_id: actor.uid,
        browser_enabled: input.browser_enabled === true,
        digest: ["instant", "daily", "weekly", "off"].includes(String(input.digest)) ? input.digest : "instant",
        board_comments: ["all", "mentions", "off"].includes(String(input.board_comments)) ? input.board_comments : "all",
        branch_reviews: input.branch_reviews !== false,
        library_updates: input.library_updates !== false,
        access_changes: input.access_changes !== false,
        updated_at: new Date().toISOString(),
      };
      const { data, error } = await database.from("notification_preferences").upsert(preferences, { onConflict: "user_id" }).select("*").single();
      if (error) throw error;
      if (!preferences.browser_enabled) {
        const { error: subscriptionError } = await database.from("push_subscriptions").delete().eq("user_id", actor.uid);
        if (subscriptionError) throw subscriptionError;
      }
      return response.status(200).json({ preferences: data });
    }

    if (["subscribe-push", "unsubscribe-push", "test-push"].includes(action)) {
      if (action === "test-push") {
        const result = await sendPushToUser(actor.uid, { title: "Kumo notifications are ready", body: "Background push delivery is connected.", url: "/?view=inbox", tag: "kumo:push-test" });
        return response.status(200).json(result);
      }
      const endpoint = clean(request.body?.endpoint, "", 2048);
      if (!endpoint.startsWith("https://")) return response.status(400).json({ error: "A secure push endpoint is required." });
      if (action === "unsubscribe-push") {
        const { error } = await database.from("push_subscriptions").delete().eq("user_id", actor.uid).eq("endpoint", endpoint);
        if (error) throw error;
        return response.status(200).json({ unsubscribed: true });
      }
      const p256dh = clean(request.body?.p256dh, "", 512);
      const auth = clean(request.body?.auth, "", 512);
      if (!p256dh || !auth) return response.status(400).json({ error: "Push encryption keys are required." });
      const { data, error } = await database.from("push_subscriptions").upsert({ user_id: actor.uid, endpoint, p256dh, auth, user_agent: clean(request.headers["user-agent"], "", 500), updated_at: new Date().toISOString() }, { onConflict: "endpoint" }).select("id, endpoint, updated_at").single();
      if (error) throw error;
      return response.status(201).json({ subscription: data });
    }

    if (["prepare-font-upload", "complete-font-upload"].includes(action)) {
      const workspace = await primaryWorkspace(actor.uid, profile.displayName);
      if (workspace.role === "guest") return response.status(403).json({ error: "Workspace guests cannot upload fonts." });
      const allowed = new Set(["font/woff", "font/woff2", "font/ttf", "font/otf"]);
      if (action === "prepare-font-upload") {
        const mimeType = clean(request.body?.mimeType, "", 80);
        const byteSize = Number(request.body?.byteSize);
        if (!allowed.has(mimeType) || !Number.isFinite(byteSize) || byteSize <= 0 || byteSize > 10 * 1024 * 1024) return response.status(400).json({ error: "Upload a WOFF, WOFF2, TTF, or OTF font no larger than 10 MB." });
        const extension = clean(request.body?.fileName, "font", 240).split(".").pop()?.replace(/[^a-z0-9]/gi, "").slice(0, 8).toLowerCase();
        const path = `${workspace.workspace_id}/${randomUUID()}${extension ? `.${extension}` : ""}`;
        const { data, error } = await database.storage.from("workspace-fonts").createSignedUploadUrl(path);
        if (error) throw error;
        return response.status(200).json({ upload: data, workspaceId: workspace.workspace_id });
      }
      const storageKey = clean(request.body?.storageKey, "", 500);
      if (!storageKey.startsWith(`${workspace.workspace_id}/`) || storageKey.includes("..")) return response.status(400).json({ error: "Invalid font path." });
      const folder = storageKey.slice(0, storageKey.lastIndexOf("/"));
      const fileName = storageKey.slice(storageKey.lastIndexOf("/") + 1);
      const { data: objects, error: listError } = await database.storage.from("workspace-fonts").list(folder, { search: fileName, limit: 2 });
      if (listError) throw listError;
      const object = objects.find((item) => item.name === fileName);
      const mimeType = typeof object?.metadata?.mimetype === "string" ? object.metadata.mimetype : "";
      if (!object || !allowed.has(mimeType)) return response.status(409).json({ error: "Font upload has not completed." });
      const family = clean(request.body?.family, "", 120);
      if (!family) return response.status(400).json({ error: "A font family name is required." });
      const weightMin = Math.min(1000, Math.max(1, Number(request.body?.weightMin) || 400));
      const weightMax = Math.min(1000, Math.max(weightMin, Number(request.body?.weightMax) || weightMin));
      const { data, error } = await database.from("workspace_fonts").insert({ workspace_id: workspace.workspace_id, family, style: request.body?.style === "italic" ? "italic" : "normal", weight_min: weightMin, weight_max: weightMax, storage_key: storageKey, mime_type: mimeType, uploaded_by: actor.uid }).select("id, workspace_id, family, style, weight_min, weight_max, storage_key, mime_type, created_at").single();
      if (error) throw error;
      const { data: signed, error: signedError } = await database.storage.from("workspace-fonts").createSignedUrl(storageKey, 60 * 60);
      if (signedError) throw signedError;
      return response.status(201).json({ font: { ...data, url: signed.signedUrl } });
    }

    if (["create-prototype-link", "revoke-prototype-link"].includes(action)) {
      const boardId = clean(request.body?.boardId);
      const access = await getBoardAccess(boardId, actor.uid);
      if (!access || access.role !== "owner") return response.status(403).json({ error: "Only the owner can manage prototype links." });
      if (action === "revoke-prototype-link") {
        const { error } = await database.from("prototype_share_links").update({ revoked_at: new Date().toISOString() }).eq("id", clean(request.body?.linkId)).eq("board_id", boardId);
        if (error) throw error;
        return response.status(200).json({ revoked: true });
      }
      const token = randomBytes(32).toString("base64url");
      const password = clean(request.body?.password, "", 256);
      const expiresAt = clean(request.body?.expiresAt, "", 64);
      const { data, error } = await database.from("prototype_share_links").insert({
        board_id: boardId, token_hash: hashSecret(token), start_shape_id: clean(request.body?.startShapeId) || null,
        password_hash: password ? hashPassword(password) : null,
        device_frame: ["none", "phone", "tablet", "desktop"].includes(request.body?.deviceFrame) ? request.body.deviceFrame : "none",
        expires_at: expiresAt || null, created_by: actor.uid,
      }).select("id, board_id, start_shape_id, device_frame, expires_at, revoked_at, created_at").single();
      if (error) throw error;
      return response.status(201).json({ link: data, token, url: `${requestOrigin(request)}/?prototype=${encodeURIComponent(token)}` });
    }

    if (["create-open-session", "revoke-open-session"].includes(action)) {
      const boardId = clean(request.body?.boardId);
      const access = await getBoardAccess(boardId, actor.uid);
      if (!access || access.role !== "owner") return response.status(403).json({ error: "Only the owner can manage open sessions." });
      if (action === "revoke-open-session") {
        const { error } = await database.from("board_open_sessions").update({ revoked_at: new Date().toISOString() }).eq("id", clean(request.body?.sessionId)).eq("board_id", boardId);
        if (error) throw error;
        await database.from("audit_events").insert({ board_id: boardId, actor_id: actor.uid, event_type: "board.open_session_revoked" });
        return response.status(200).json({ revoked: true });
      }
      const role = request.body?.role === "editor" ? "editor" : "viewer";
      const password = clean(request.body?.password, "", 256);
      if (role === "editor" && password.length < 8) return response.status(400).json({ error: "Editor sessions require a password of at least 8 characters." });
      const requestedExpiry = new Date(clean(request.body?.expiresAt, "", 64)).getTime();
      const minimum = Date.now() + 15 * 60_000;
      const maximum = Date.now() + 7 * 24 * 60 * 60_000;
      const expiresAt = new Date(Math.min(maximum, Math.max(minimum, Number.isFinite(requestedExpiry) ? requestedExpiry : Date.now() + 24 * 60 * 60_000))).toISOString();
      const token = randomBytes(32).toString("base64url");
      const { data, error } = await database.from("board_open_sessions").insert({
        board_id: boardId,
        token_hash: hashSecret(token),
        password_hash: password ? hashPassword(password) : null,
        role,
        expires_at: expiresAt,
        created_by: actor.uid,
      }).select("id, board_id, role, expires_at, created_at").single();
      if (error) throw error;
      await database.from("audit_events").insert({ board_id: boardId, actor_id: actor.uid, event_type: "board.open_session_created", payload: { role, expiresAt } });
      return response.status(201).json({ session: data, token, url: `${requestOrigin(request)}/?openSession=${encodeURIComponent(token)}` });
    }

    if (["publish-extension", "install-extension", "toggle-extension", "uninstall-extension"].includes(action)) {
      if (action === "publish-extension") {
        const manifest = sanitizeExtensionManifest(request.body?.manifest);
        const { data, error } = await database.from("extension_catalog").upsert({ id: manifest.id, name: manifest.name, description: clean(request.body?.description, "", 500), manifest, publisher_id: actor.uid, updated_at: new Date().toISOString() }, { onConflict: "id" }).select("id, name, description, manifest, verified").single();
        if (error) throw error;
        return response.status(201).json({ extension: data });
      }
      const extensionId = clean(request.body?.extensionId);
      if (action === "uninstall-extension") {
        const { error } = await database.from("installed_extensions").delete().eq("user_id", actor.uid).eq("extension_id", extensionId);
        if (error) throw error;
        return response.status(200).json({ uninstalled: true });
      }
      if (action === "toggle-extension") {
        const { error } = await database.from("installed_extensions").update({ enabled: request.body?.enabled === true }).eq("user_id", actor.uid).eq("extension_id", extensionId);
        if (error) throw error;
        return response.status(200).json({ enabled: request.body?.enabled === true });
      }
      const { data: extension, error: extensionError } = await database.from("extension_catalog").select("manifest, verified, publisher_id").eq("id", extensionId).single();
      if (extensionError) throw extensionError;
      if (!extension.verified && extension.publisher_id !== actor.uid) return response.status(403).json({ error: "Only verified extensions or your own extension can be installed." });
      const requested = Array.isArray(request.body?.permissions) ? request.body.permissions : [];
      const allowed = Array.isArray(extension.manifest?.permissions) ? extension.manifest.permissions : [];
      if (requested.some((permission: unknown) => !allowed.includes(permission))) return response.status(400).json({ error: "Requested extension permissions exceed its manifest." });
      const { error } = await database.from("installed_extensions").upsert({ user_id: actor.uid, extension_id: extensionId, granted_permissions: requested, enabled: true }, { onConflict: "user_id,extension_id" });
      if (error) throw error;
      return response.status(201).json({ installed: true, permissions: requested });
    }

    if (action === "moderate-community") {
      if (!isCommunityModerator(actor.uid)) return response.status(403).json({ error: "Community moderator access is required." });
      const reportId = clean(request.body?.reportId);
      const decision = ["reviewed", "dismissed", "removed"].includes(request.body?.decision) ? request.body.decision as "reviewed" | "dismissed" | "removed" : null;
      if (!reportId || !decision) return response.status(400).json({ error: "Choose a valid moderation decision." });
      const { error } = await database.rpc("moderate_kumo_community_report", {
        p_report_id: reportId, p_actor_id: actor.uid, p_decision: decision,
        p_note: clean(request.body?.note, "", 500),
      });
      if (error) throw error;
      return response.status(200).json({ moderated: true, decision });
    }

    if (["publish-community", "unpublish-community", "report-community", "remix-community"].includes(action)) {
      const boardId = clean(request.body?.boardId);
      if (action === "report-community") {
        const { data: publication, error: publicationError } = await database.from("community_publications").select("board_id").eq("board_id", boardId).maybeSingle();
        if (publicationError) throw publicationError;
        if (!publication) return response.status(404).json({ error: "Community publication not found." });
        const category = ["spam", "harassment", "copyright", "unsafe", "misleading", "other"].includes(request.body?.category) ? request.body.category : "other";
        const { error } = await database.from("community_reports").upsert({ board_id: boardId, reporter_id: actor.uid, category, reason: clean(request.body?.reason, "Please review this publication.", 500), status: "open", reviewed_by: null, reviewed_at: null, review_note: "" }, { onConflict: "board_id,reporter_id" });
        if (error) throw error;
        return response.status(201).json({ reported: true });
      }
      if (action === "remix-community") {
        const { data: publication, error } = await database.from("community_publications").select("remix_allowed, remix_count, boards(title, liveblocks_room_id)").eq("board_id", boardId).maybeSingle();
        if (error) throw error;
        if (!publication) return response.status(404).json({ error: "Community publication not found." });
        if (!publication.remix_allowed) return response.status(403).json({ error: "The creator disabled remixing." });
        const relatedBoard = Array.isArray(publication.boards) ? publication.boards[0] : publication.boards;
        if (!relatedBoard?.liveblocks_room_id) return response.status(404).json({ error: "Community publication not found." });
        const document = await liveblocksAdmin().getStorageDocument(relatedBoard.liveblocks_room_id, "json");
        const created = await provisionBoard({ ownerId: actor.uid, title: `${relatedBoard.title ?? "Community board"} remix`, document });
        await database.from("community_publications").update({ remix_count: Number(publication.remix_count ?? 0) + 1 }).eq("board_id", boardId);
        return response.status(201).json({ boardId: created.id });
      }
      const access = await getBoardAccess(boardId, actor.uid);
      if (!access) return response.status(404).json({ error: "Board not found." });
      if (access.role !== "owner") return response.status(403).json({ error: "Only the owner can publish this board." });
      if (action === "unpublish-community") {
        const { error } = await database.from("community_publications").delete().eq("board_id", boardId).eq("published_by", actor.uid);
        if (error) throw error;
        return response.status(200).json({ unpublished: true });
      }
      const slug = clean(request.body?.slug || access.board.title, "kumo-board").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80);
      const rawTags: unknown[] = Array.isArray(request.body?.tags) ? request.body.tags : [];
      const tags = rawTags.filter((tag): tag is string => typeof tag === "string").map((tag) => tag.trim().toLowerCase().slice(0, 30)).filter(Boolean).slice(0, 10);
      const { data, error } = await database.from("community_publications").upsert({ board_id: boardId, published_by: actor.uid, slug, description: clean(request.body?.description, "", 1000), tags, remix_allowed: request.body?.remixAllowed !== false, updated_at: new Date().toISOString() }, { onConflict: "board_id" }).select("*").single();
      if (error) throw error;
      return response.status(201).json({ publication: data });
    }

    if (action === "revoke-account-session") {
      const sessionId = clean(request.body?.sessionId, "", 100);
      const rawCurrent = request.headers["x-kumo-session-id"];
      const currentSessionId = (Array.isArray(rawCurrent) ? rawCurrent[0] : rawCurrent) ?? "";
      if (!sessionId || sessionId === currentSessionId) return response.status(400).json({ error: "The current session cannot be revoked here." });
      const { error } = await database.from("account_sessions").update({ revoked_at: new Date().toISOString() }).eq("user_id", actor.uid).eq("id", sessionId);
      if (error) throw error;
      return response.status(200).json({ revoked: true });
    }
    if (action === "revoke-sessions") {
      const rawCurrent = request.headers["x-kumo-session-id"];
      const currentSessionId = (Array.isArray(rawCurrent) ? rawCurrent[0] : rawCurrent) ?? "";
      let sessionQuery = database.from("account_sessions").update({ revoked_at: new Date().toISOString() }).eq("user_id", actor.uid).is("revoked_at", null);
      if (currentSessionId) sessionQuery = sessionQuery.neq("id", currentSessionId);
      const { error: sessionError } = await sessionQuery;
      if (sessionError) throw sessionError;
      await database.from("audit_events").insert({ actor_id: actor.uid, event_type: "account.sessions_revoked" });
      return response.status(200).json({ revoked: true });
    }
    if (action === "request-account-deletion") {
      const { data, error } = await database.rpc("schedule_kumo_account_deletion", { p_user_id: actor.uid });
      if (error) throw error;
      return response.status(202).json({ deletion: data?.[0] ?? null });
    }
    if (action === "cancel-account-deletion") {
      const { error } = await database.rpc("cancel_kumo_account_deletion", { p_user_id: actor.uid });
      if (error) throw error;
      return response.status(200).json({ cancelled: true });
    }
    return response.status(400).json({ error: "Unknown platform action." });
  } catch (error) {
    const message = errorMessage(error, "We couldn't update the Kumo platform.");
    const status = message === "Authentication required." ? 401
      : error instanceof Error && error.name === "Forbidden" ? 403
      : /not found|prototype link is unavailable|invitation is unavailable|no longer exists/i.test(message) ? 404
      : /cannot|conflict|before leaving|nested|already/i.test(message) ? 409
      : /invalid|enter a valid|choose another|required|incorrect|expired|belongs to|exceed|only verified|disabled/i.test(message) ? 400
      : 500;
    return response.status(status).json({ error: status === 500 ? "We couldn't update the Kumo platform." : message });
  }
}
