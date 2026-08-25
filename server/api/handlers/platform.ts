import { randomBytes } from "node:crypto";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireActor } from "../_auth.js";
import { getBoardAccess, listBoardsForUser, provisionBoard, searchPublicBoards } from "../_boards.js";
import { sendInvitationEmail } from "../_email.js";
import { privilegedAdminAuth } from "../_firebaseAdmin.js";
import { allowMethods, errorMessage, stringQuery } from "../_http.js";
import { liveblocksAdmin } from "../_liveblocks.js";
import { folderMoveCreatesCycle, hashPassword, sanitizeExtensionManifest, summarizeConnectionTelemetry, verifyPassword } from "../_platform.js";
import { enforceRateLimit, hashSecret, requestOrigin } from "../_security.js";
import { ensureActorProfile, supabaseAdmin } from "../_supabase.js";

type WorkspaceRole = "owner" | "admin" | "member" | "guest";
const clean = (value: unknown, fallback = "", limit = 120) => typeof value === "string" ? value.trim().slice(0, limit) || fallback : fallback;

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
        const defaults = { user_id: actor.uid, email_enabled: true, browser_enabled: false, digest: "instant", board_comments: "all", branch_reviews: true, library_updates: true, access_changes: true };
        const { data, error } = await database.from("notification_preferences").select("*").eq("user_id", actor.uid).maybeSingle();
        if (error) throw error;
        return response.status(200).json({ preferences: data ?? defaults });
      }
      if (scope === "global-search") {
        const query = clean(stringQuery(request.query.q), "", 120);
        if (!query) return response.status(200).json({ results: [] });
        const [ownBoards, publicBoards, profileResult, templateResult, communityResult] = await Promise.all([
          listBoardsForUser(actor.uid), searchPublicBoards(query),
          database.from("profiles").select("firebase_uid, username, display_name, avatar_url").eq("discoverable", true).or(`username.ilike.%${query.replace(/[%,]/g, "")}%,display_name.ilike.%${query.replace(/[%,]/g, "")}%`).limit(12),
          database.from("board_templates").select("id, name, description, visibility").or(`owner_id.eq.${actor.uid},visibility.eq.public`).ilike("name", `%${query.replace(/[%,]/g, "")}%`).limit(12),
          database.from("community_publications").select("board_id, slug, description, tags, remix_count, boards(title)").ilike("description", `%${query.replace(/[%,]/g, "")}%`).limit(12),
        ]);
        if (profileResult.error) throw profileResult.error;
        if (templateResult.error) throw templateResult.error;
        if (communityResult.error) throw communityResult.error;
        const boardResults = [...new Map([...ownBoards.filter((board) => board.title.toLowerCase().includes(query.toLowerCase())), ...publicBoards].map((board) => [board.id, board])).values()];
        return response.status(200).json({ results: [
          ...boardResults.map((board) => ({ kind: "board", id: board.id, label: board.title, detail: board.role ?? "public", actionUrl: `/?board=${encodeURIComponent(board.id)}` })),
          ...(profileResult.data ?? []).map((item) => ({ kind: "profile", id: item.firebase_uid, label: item.display_name, detail: `@${item.username}`, actionUrl: `/?profile=${encodeURIComponent(item.username)}` })),
          ...(templateResult.data ?? []).map((item) => ({ kind: "template", id: item.id, label: item.name, detail: item.description, actionUrl: `/?template=${encodeURIComponent(item.id)}` })),
          ...(communityResult.data ?? []).map((item) => ({ kind: "community", id: item.board_id, label: (item.boards as { title?: string } | null)?.title ?? item.slug, detail: item.description, actionUrl: `/?community=${encodeURIComponent(item.slug)}` })),
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
      if (scope === "community") {
        const { data, error } = await database.from("community_publications").select("board_id, published_by, slug, description, tags, remix_allowed, remix_count, published_at, boards(title, thumbnail_asset_id)").order("published_at", { ascending: false }).limit(48);
        if (error) throw error;
        return response.status(200).json({ publications: data ?? [] });
      }
      if (scope === "account-export") {
        const [boards, notifications, friendships, audits] = await Promise.all([
          listBoardsForUser(actor.uid),
          database.from("account_notifications").select("*").eq("recipient_id", actor.uid).order("created_at", { ascending: false }),
          database.from("friendships").select("*").or(`user_low_id.eq.${actor.uid},user_high_id.eq.${actor.uid}`),
          database.from("audit_events").select("*").eq("actor_id", actor.uid).order("created_at", { ascending: false }).limit(1000),
        ]);
        if (notifications.error) throw notifications.error;
        if (friendships.error) throw friendships.error;
        if (audits.error) throw audits.error;
        return response.status(200).json({ exportedAt: new Date().toISOString(), profile, boards, notifications: notifications.data ?? [], friendships: friendships.data ?? [], auditEvents: audits.data ?? [] });
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
        const { data: existing, error: existingError } = await database.from("profiles").select("firebase_uid, email, display_name").ilike("email", email).maybeSingle();
        if (existingError) throw existingError;
        if (existing) {
          const { error } = await database.from("workspace_members").upsert({ workspace_id: workspaceId, user_id: existing.firebase_uid, role: memberRole }, { onConflict: "workspace_id,user_id" });
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
        const workspace = await primaryWorkspace(actor.uid, profile.displayName);
        const delivery = await sendInvitationEmail({ to: email, inviterName: profile.displayName, resourceName: workspace.workspaces.name, acceptUrl: url, kind: "workspace" });
        return response.status(202).json({ invitation: data, url, delivery });
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
          const { error } = await database.from("workspace_members").delete().eq("workspace_id", workspaceId).eq("user_id", userId).neq("role", "owner");
          if (error) throw error;
          return response.status(200).json({ removed: true });
        }
        const memberRole = ["admin", "member", "guest"].includes(request.body?.role) ? request.body.role : "member";
        const { error } = await database.from("workspace_members").update({ role: memberRole }).eq("workspace_id", workspaceId).eq("user_id", userId).neq("role", "owner");
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
      if (!(folders ?? []).some((folder) => folder.id === folderId)) return response.status(404).json({ error: "Folder not found." });
      if (action === "rename-folder") {
        const { data, error } = await database.from("workspace_folders").update({ name: clean(request.body?.name, "Untitled folder") }).eq("id", folderId).eq("workspace_id", workspaceId).select("id, workspace_id, parent_id, name").single();
        if (error) throw error;
        return response.status(200).json({ folder: data });
      }
      if (action === "move-folder") {
        const parentId = clean(request.body?.parentId) || null;
        if (folderMoveCreatesCycle(folders ?? [], folderId, parentId)) return response.status(409).json({ error: "A folder cannot be moved into itself or one of its descendants." });
        const { data, error } = await database.from("workspace_folders").update({ parent_id: parentId }).eq("id", folderId).eq("workspace_id", workspaceId).select("id, workspace_id, parent_id, name").single();
        if (error) throw error;
        return response.status(200).json({ folder: data });
      }
      const hasChildren = (folders ?? []).some((folder) => folder.parent_id === folderId);
      if (hasChildren && request.body?.recursive !== true) return response.status(409).json({ error: "Move or delete nested folders first, or confirm recursive deletion." });
      const { error } = await database.from("workspace_folders").delete().eq("id", folderId).eq("workspace_id", workspaceId);
      if (error) throw error;
      return response.status(200).json({ deleted: true });
    }

    if (action === "leave-workspace") {
      const workspaceId = clean(request.body?.workspaceId);
      const role = await workspaceAccess(workspaceId, actor.uid);
      if (role === "owner") return response.status(409).json({ error: "The owner cannot leave without transferring the workspace." });
      const { error } = await database.from("workspace_members").delete().eq("workspace_id", workspaceId).eq("user_id", actor.uid);
      if (error) throw error;
      return response.status(200).json({ left: true });
    }

    if (action === "update-notification-preferences") {
      const input = request.body?.preferences && typeof request.body.preferences === "object" ? request.body.preferences as Record<string, unknown> : {};
      const preferences = {
        user_id: actor.uid,
        email_enabled: input.email_enabled !== false,
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
      return response.status(200).json({ preferences: data });
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

    if (["publish-community", "unpublish-community", "report-community", "remix-community"].includes(action)) {
      const boardId = clean(request.body?.boardId);
      if (action === "report-community") {
        const { data: publication, error: publicationError } = await database.from("community_publications").select("board_id").eq("board_id", boardId).maybeSingle();
        if (publicationError) throw publicationError;
        if (!publication) return response.status(404).json({ error: "Community publication not found." });
        const { error } = await database.from("community_reports").upsert({ board_id: boardId, reporter_id: actor.uid, reason: clean(request.body?.reason, "", 500) }, { onConflict: "board_id,reporter_id" });
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

    if (action === "revoke-sessions") {
      await privilegedAdminAuth().revokeRefreshTokens(actor.uid);
      await database.from("audit_events").insert({ actor_id: actor.uid, event_type: "account.sessions_revoked" });
      return response.status(200).json({ revoked: true });
    }
    if (action === "request-account-deletion") {
      const { data, error } = await database.from("account_deletion_requests").upsert({ user_id: actor.uid, requested_at: new Date().toISOString(), scheduled_for: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), cancelled_at: null }, { onConflict: "user_id" }).select("requested_at, scheduled_for").single();
      if (error) throw error;
      return response.status(202).json({ deletion: data });
    }
    if (action === "cancel-account-deletion") {
      const { error } = await database.from("account_deletion_requests").update({ cancelled_at: new Date().toISOString() }).eq("user_id", actor.uid).is("cancelled_at", null);
      if (error) throw error;
      return response.status(200).json({ cancelled: true });
    }
    return response.status(400).json({ error: "Unknown platform action." });
  } catch (error) {
    const message = errorMessage(error, "We couldn't update the Kumo platform.");
    const status = message === "Authentication required." ? 401
      : error instanceof Error && error.name === "Forbidden" ? 403
      : /not found|prototype link is unavailable|invitation is unavailable|no longer exists/i.test(message) ? 404
      : /cannot|conflict|before leaving|nested/i.test(message) ? 409
      : /invalid|enter a valid|choose another|required|incorrect|expired|belongs to|exceed|only verified|disabled/i.test(message) ? 400
      : 500;
    return response.status(status).json({ error: status === 500 ? "We couldn't update the Kumo platform." : message });
  }
}
