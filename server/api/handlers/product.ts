import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireActor } from "../_auth.js";
import { getBoardAccess, provisionBoard } from "../_boards.js";
import { replaceStorageDocument, withDocumentLease } from "../_documentMutation.js";
import { allowMethods, errorMessage, stringQuery } from "../_http.js";
import { boardDocumentFromJson, liveblocksAdmin } from "../_liveblocks.js";
import { cleanProductName, diffLibraryPayload, documentNodes, extractLibraryAssets, mergeLibraryPayload } from "../_product.js";
import { ensureActorProfile, supabaseAdmin } from "../_supabase.js";

const editable = (role: string) => role === "owner" || role === "editor";
const ownerOnly = (role: string) => role === "owner";
const tokenHash = (token: string) => createHash("sha256").update(token).digest("hex");

const ensureWorkspace = async (uid: string, name: string) => {
  const database = supabaseAdmin();
  const { data: membership, error: membershipError } = await database.from("workspace_members")
    .select("workspace_id, role, workspaces(id, name, owner_id, created_at, updated_at)")
    .eq("user_id", uid).order("created_at", { ascending: true }).limit(1).maybeSingle();
  if (membershipError) throw membershipError;
  if (membership) return membership;
  const { data: workspace, error } = await database.from("workspaces")
    .insert({ name: `${name}'s workspace`, owner_id: uid }).select("id, name, owner_id, created_at, updated_at").single();
  if (error) throw error;
  const { error: memberError } = await database.from("workspace_members").insert({ workspace_id: workspace.id, user_id: uid, role: "owner" });
  if (memberError) throw memberError;
  return { workspace_id: workspace.id, role: "owner", workspaces: workspace };
};

const graphResponse = async (boardId: string, actorUid: string) => {
  const database = supabaseAdmin();
  const access = await getBoardAccess(boardId, actorUid);
  if (!access) return null;
  const { data: links, error } = await database.from("board_links")
    .select("source_board_id, target_board_id, shape_id")
    .or(`source_board_id.eq.${boardId},target_board_id.eq.${boardId}`);
  if (error) throw error;
  const ids = [...new Set([boardId, ...(links ?? []).flatMap((link) => [link.source_board_id as string, link.target_board_id as string])])];
  const [{ data: boards, error: boardError }, { data: memberships, error: memberError }] = await Promise.all([
    database.from("boards").select("id, title, visibility, owner_id").in("id", ids).is("deleted_at", null),
    database.from("board_members").select("board_id, role").eq("user_id", actorUid).in("board_id", ids),
  ]);
  if (boardError) throw boardError;
  if (memberError) throw memberError;
  const roles = new Map((memberships ?? []).map((membership) => [membership.board_id as string, membership.role as string]));
  const nodes = (boards ?? []).map((board) => {
    const role = roles.get(board.id as string) ?? null;
    const accessible = Boolean(role) || board.visibility === "public";
    return { id: board.id, title: accessible ? board.title : "Private board", visibility: board.visibility, accessible, manageable: role === "owner" };
  });
  return {
    sourceId: boardId,
    nodes,
    edges: (links ?? []).map((link) => ({ sourceId: link.source_board_id, targetId: link.target_board_id, shapeId: link.shape_id })),
    incoming: (links ?? []).filter((link) => link.target_board_id === boardId).map((link) => ({ sourceId: link.source_board_id, targetId: link.target_board_id, shapeId: link.shape_id })),
  };
};

export default async function handler(request: VercelRequest, response: VercelResponse) {
  if (!allowMethods(request, response, ["GET", "POST"])) return;
  try {
    const actor = await requireActor(request);
    const profile = await ensureActorProfile(actor);
    const database = supabaseAdmin();

    if (request.method === "GET") {
      const scope = stringQuery(request.query.scope) || "workspace";
      if (scope === "graph") {
        const result = await graphResponse(stringQuery(request.query.boardId), actor.uid);
        return result ? response.status(200).json({ graph: result }) : response.status(404).json({ error: "Board not found." });
      }
      if (scope === "notifications") {
        const { data, error } = await database.from("account_notifications")
          .select("id, actor_id, board_id, kind, title, body, action_url, read_at, created_at")
          .eq("recipient_id", actor.uid).order("created_at", { ascending: false }).limit(100);
        if (error) throw error;
        return response.status(200).json({ notifications: data ?? [] });
      }
      if (scope === "libraries") {
        const boardId = stringQuery(request.query.boardId);
        if (boardId && !(await getBoardAccess(boardId, actor.uid))) return response.status(404).json({ error: "Board not found." });
        const { data: libraries, error } = await database.from("design_libraries")
          .select("id, source_board_id, owner_id, name, description, visibility, latest_version, updated_at")
          .or(`owner_id.eq.${actor.uid},visibility.eq.public`).order("updated_at", { ascending: false });
        if (error) throw error;
        const { data: subscriptions, error: subscriptionError } = boardId
          ? await database.from("design_library_subscriptions").select("library_id, accepted_version").eq("board_id", boardId)
          : { data: [], error: null };
        if (subscriptionError) throw subscriptionError;
        return response.status(200).json({ libraries: libraries ?? [], subscriptions: subscriptions ?? [] });
      }
      if (scope === "library-versions") {
        const libraryId = stringQuery(request.query.libraryId);
        const { data: library, error: libraryError } = await database.from("design_libraries").select("id, source_board_id, owner_id, latest_version, name").eq("id", libraryId).maybeSingle();
        if (libraryError) throw libraryError;
        if (!library) return response.status(404).json({ error: "Library not found." });
        const sourceAccess = await getBoardAccess(library.source_board_id as string, actor.uid);
        if (!sourceAccess && library.owner_id !== actor.uid) return response.status(403).json({ error: "Library access is required." });
        const { data, error } = await database.from("design_library_versions").select("library_id, version, semantic_version, description, release_status, approved_by, approved_at, changelog, created_by, created_at").eq("library_id", libraryId).order("version", { ascending: false });
        if (error) throw error;
        return response.status(200).json({ library, versions: data ?? [] });
      }
      if (scope === "templates") {
        const { data, error } = await database.from("board_templates")
          .select("id, owner_id, source_board_id, name, description, visibility, created_at, updated_at")
          .or(`owner_id.eq.${actor.uid},visibility.eq.public`).order("updated_at", { ascending: false });
        if (error) throw error;
        return response.status(200).json({ templates: data ?? [] });
      }
      if (scope === "access-requests") {
        const boardId = stringQuery(request.query.boardId);
        const access = await getBoardAccess(boardId, actor.uid);
        if (!access || !ownerOnly(access.role)) return response.status(403).json({ error: "Only the owner can review access requests." });
        const { data, error } = await database.from("board_access_requests")
          .select("id, board_id, requester_id, requested_role, message, status, created_at, profiles!board_access_requests_requester_id_fkey(display_name, email, avatar_url)")
          .eq("board_id", boardId).order("created_at", { ascending: false });
        if (error) throw error;
        return response.status(200).json({ requests: data ?? [] });
      }
      if (scope === "share-links") {
        const boardId = stringQuery(request.query.boardId);
        const access = await getBoardAccess(boardId, actor.uid);
        if (!access || !ownerOnly(access.role)) return response.status(403).json({ error: "Only the owner can manage share links." });
        const { data, error } = await database.from("board_share_links")
          .select("id, board_id, role, allowed_domain, expires_at, revoked_at, created_at, last_used_at")
          .eq("board_id", boardId).order("created_at", { ascending: false });
        if (error) throw error;
        return response.status(200).json({ links: data ?? [] });
      }
      const workspace = await ensureWorkspace(actor.uid, profile.displayName);
      const workspaceId = workspace.workspace_id as string;
      const [{ data: folders, error: folderError }, { data: organization, error: organizationError }] = await Promise.all([
        database.from("workspace_folders").select("id, workspace_id, parent_id, name, created_by, created_at, updated_at").eq("workspace_id", workspaceId).order("name"),
        database.from("board_organization").select("board_id, workspace_id, folder_id, favorite, archived_at, trashed_at").eq("user_id", actor.uid),
      ]);
      if (folderError) throw folderError;
      if (organizationError) throw organizationError;
      return response.status(200).json({ workspace, folders: folders ?? [], organization: organization ?? [] });
    }

    const action = typeof request.body?.action === "string" ? request.body.action : "";
    if (action === "mark-notification") {
      const id = typeof request.body?.id === "string" ? request.body.id : "";
      let query = database.from("account_notifications").update({ read_at: new Date().toISOString() }).eq("recipient_id", actor.uid).is("read_at", null);
      if (id) query = query.eq("id", id);
      const { error } = await query;
      if (error) throw error;
      return response.status(200).json({ updated: true });
    }

    if (action === "create-folder") {
      const workspace = await ensureWorkspace(actor.uid, profile.displayName);
      const { data, error } = await database.from("workspace_folders").insert({
        workspace_id: workspace.workspace_id, created_by: actor.uid,
        name: cleanProductName(request.body?.name, "Untitled folder"),
        parent_id: typeof request.body?.parentId === "string" ? request.body.parentId : null,
      }).select("id, workspace_id, parent_id, name, created_by, created_at, updated_at").single();
      if (error) throw error;
      return response.status(201).json({ folder: data });
    }

    if (["move-board", "favorite-board", "archive-board", "trash-board", "restore-board"].includes(action)) {
      const boardId = typeof request.body?.boardId === "string" ? request.body.boardId : "";
      if (!(await getBoardAccess(boardId, actor.uid))) return response.status(404).json({ error: "Board not found." });
      const workspace = await ensureWorkspace(actor.uid, profile.displayName);
      const patch = action === "move-board" ? { workspace_id: workspace.workspace_id, folder_id: request.body?.folderId ?? null }
        : action === "favorite-board" ? { favorite: Boolean(request.body?.favorite) }
        : action === "archive-board" ? { archived_at: new Date().toISOString(), trashed_at: null }
        : action === "trash-board" ? { trashed_at: new Date().toISOString(), archived_at: null }
        : { archived_at: null, trashed_at: null };
      const { data, error } = await database.from("board_organization").upsert({ board_id: boardId, user_id: actor.uid, workspace_id: workspace.workspace_id, ...patch }, { onConflict: "board_id,user_id" }).select().single();
      if (error) throw error;
      return response.status(200).json({ organization: data });
    }

    if (action === "publish-library") {
      const boardId = typeof request.body?.boardId === "string" ? request.body.boardId : "";
      const access = await getBoardAccess(boardId, actor.uid);
      if (!access || !ownerOnly(access.role)) return response.status(403).json({ error: "Only the board owner can publish its library." });
      const document = await liveblocksAdmin().getStorageDocument(access.board.liveblocks_room_id, "json");
      const assets = extractLibraryAssets(document);
      if (!assets.length) return response.status(400).json({ error: "Create a component, style, or variable before publishing." });
      const { data: prior, error: priorError } = await database.from("design_libraries").select("id, latest_version").eq("source_board_id", boardId).maybeSingle();
      if (priorError) throw priorError;
      const { data: lastRelease, error: lastReleaseError } = prior?.id
        ? await database.from("design_library_versions").select("version").eq("library_id", prior.id).order("version", { ascending: false }).limit(1).maybeSingle()
        : { data: null, error: null };
      if (lastReleaseError) throw lastReleaseError;
      const version = Number(lastRelease?.version ?? 0) + 1;
      const libraryId = prior?.id ?? randomUUID();
      const releaseStatus = ["draft", "review", "published"].includes(request.body?.releaseStatus) ? request.body.releaseStatus : "published";
      const { error: libraryError } = await database.from("design_libraries").upsert({
        id: libraryId, source_board_id: boardId, owner_id: actor.uid,
        name: cleanProductName(request.body?.name, access.board.title), description: String(request.body?.description ?? "").slice(0, 500),
        visibility: ["private", "workspace", "public"].includes(request.body?.visibility) ? request.body.visibility : "private",
        latest_version: releaseStatus === "published" ? version : prior?.latest_version ?? 0, updated_at: new Date().toISOString(),
      }, { onConflict: "source_board_id" });
      if (libraryError) throw libraryError;
      const { error: versionError } = await database.from("design_library_versions").insert({
        library_id: libraryId, version, semantic_version: cleanProductName(request.body?.semanticVersion, `${version}.0.0`),
        description: String(request.body?.versionDescription ?? "").slice(0, 500), assets, created_by: actor.uid,
        release_status: releaseStatus, approved_by: releaseStatus === "published" ? actor.uid : null,
        approved_at: releaseStatus === "published" ? new Date().toISOString() : null,
        changelog: Array.isArray(request.body?.changelog) ? request.body.changelog.slice(0, 100) : [],
      });
      if (versionError) throw versionError;
      return response.status(201).json({ libraryId, version, assetCount: assets.length, releaseStatus });
    }

    if (["approve-library-release", "deprecate-library-release", "rollback-library"].includes(action)) {
      const libraryId = typeof request.body?.libraryId === "string" ? request.body.libraryId : "";
      const version = Number(request.body?.version);
      const { data: library, error: libraryError } = await database.from("design_libraries").select("id, source_board_id, owner_id, latest_version, name").eq("id", libraryId).single();
      if (libraryError) throw libraryError;
      if (library.owner_id !== actor.uid) return response.status(403).json({ error: "Only the library owner can govern releases." });
      if (!Number.isInteger(version) || version < 1) return response.status(400).json({ error: "A valid library version is required." });
      if (action === "rollback-library") {
        const { data: target, error: targetError } = await database.from("design_library_versions").select("version, release_status").eq("library_id", libraryId).eq("version", version).maybeSingle();
        if (targetError) throw targetError;
        if (!target || target.release_status === "deprecated") return response.status(409).json({ error: "Only a non-deprecated release can become current." });
        const { error } = await database.from("design_libraries").update({ latest_version: version, updated_at: new Date().toISOString() }).eq("id", libraryId);
        if (error) throw error;
      } else {
        const releaseStatus = action === "approve-library-release" ? "published" : "deprecated";
        const { error } = await database.from("design_library_versions").update({
          release_status: releaseStatus,
          approved_by: releaseStatus === "published" ? actor.uid : null,
          approved_at: releaseStatus === "published" ? new Date().toISOString() : null,
        }).eq("library_id", libraryId).eq("version", version);
        if (error) throw error;
        if (releaseStatus === "published") {
          const { error: currentError } = await database.from("design_libraries").update({ latest_version: version, updated_at: new Date().toISOString() }).eq("id", libraryId);
          if (currentError) throw currentError;
        }
      }
      const { data: subscribers, error: subscriberError } = await database.from("design_library_subscriptions").select("subscribed_by, board_id").eq("library_id", libraryId);
      if (subscriberError) throw subscriberError;
      if (subscribers?.length) {
        const { error: noticeError } = await database.from("account_notifications").insert(subscribers.map((subscriber) => ({ recipient_id: subscriber.subscribed_by, actor_id: actor.uid, board_id: subscriber.board_id, kind: "library", title: `${library.name} release changed`, body: `Version ${version} was ${action === "rollback-library" ? "made current" : action === "approve-library-release" ? "approved" : "deprecated"}.`, action_url: `/?board=${encodeURIComponent(subscriber.board_id)}` })));
        if (noticeError) throw noticeError;
      }
      return response.status(200).json({ updated: true, libraryId, version, action });
    }

    if (action === "library-diff" || action === "apply-library") {
      const boardId = typeof request.body?.boardId === "string" ? request.body.boardId : "";
      const libraryId = typeof request.body?.libraryId === "string" ? request.body.libraryId : "";
      const access = await getBoardAccess(boardId, actor.uid);
      if (!access || !editable(access.role)) return response.status(403).json({ error: "Editing access is required." });
      const { data: library, error: libraryError } = await database.from("design_libraries").select("id, latest_version, visibility, owner_id").eq("id", libraryId).single();
      if (libraryError) throw libraryError;
      if (library.visibility === "private" && library.owner_id !== actor.uid) return response.status(403).json({ error: "This library is private." });
      const { data: version, error: versionError } = await database.from("design_library_versions").select("assets, version").eq("library_id", libraryId).eq("version", library.latest_version).single();
      if (versionError) throw versionError;
      const current = await liveblocksAdmin().getStorageDocument(access.board.liveblocks_room_id, "json");
      const currentAssets = Object.values(documentNodes(current)).filter((shape) => shape.libraryId === libraryId);
      const diff = diffLibraryPayload(currentAssets, version.assets ?? []);
      if (action === "library-diff") return response.status(200).json({ version: version.version, diff });
      return await withDocumentLease(database, access.board.liveblocks_room_id, async () => {
        const next = mergeLibraryPayload(current, version.assets ?? [], libraryId, version.version);
        await replaceStorageDocument({ client: liveblocksAdmin(), roomId: access.board.liveblocks_room_id, current: boardDocumentFromJson(current), next: boardDocumentFromJson(next), commit: async () => {
          const { error } = await database.from("design_library_subscriptions").upsert({ library_id: libraryId, board_id: boardId, accepted_version: version.version, subscribed_by: actor.uid, updated_at: new Date().toISOString() }, { onConflict: "library_id,board_id" });
          if (error) throw error;
        } });
        return response.status(200).json({ applied: true, version: version.version, diff });
      });
    }

    if (action === "create-template") {
      const boardId = typeof request.body?.boardId === "string" ? request.body.boardId : "";
      const access = await getBoardAccess(boardId, actor.uid);
      if (!access || !editable(access.role)) return response.status(403).json({ error: "Editing access is required." });
      const document = await liveblocksAdmin().getStorageDocument(access.board.liveblocks_room_id, "json");
      const { data, error } = await database.from("board_templates").insert({ owner_id: actor.uid, source_board_id: boardId, name: cleanProductName(request.body?.name, access.board.title), description: String(request.body?.description ?? "").slice(0, 500), visibility: request.body?.visibility === "public" ? "public" : "private", document }).select("id, name, description, visibility").single();
      if (error) throw error;
      return response.status(201).json({ template: data });
    }

    if (action === "instantiate-template") {
      const templateId = typeof request.body?.templateId === "string" ? request.body.templateId : "";
      const { data: template, error } = await database.from("board_templates").select("owner_id, name, visibility, document").eq("id", templateId).single();
      if (error) throw error;
      if (template.visibility !== "public" && template.owner_id !== actor.uid) return response.status(403).json({ error: "This template is private." });
      const board = await provisionBoard({ ownerId: actor.uid, title: cleanProductName(request.body?.name, template.name), document: template.document });
      return response.status(201).json({ boardId: board.id });
    }

    if (action === "request-access") {
      const boardId = typeof request.body?.boardId === "string" ? request.body.boardId : "";
      const { data: board, error: boardError } = await database.from("boards").select("id, owner_id, title").eq("id", boardId).is("deleted_at", null).single();
      if (boardError) throw boardError;
      if (board.owner_id === actor.uid) return response.status(400).json({ error: "You already own this board." });
      const role = request.body?.role === "editor" ? "editor" : "viewer";
      const { data, error } = await database.from("board_access_requests").upsert({ board_id: boardId, requester_id: actor.uid, requested_role: role, message: String(request.body?.message ?? "").slice(0, 500), status: "pending" }, { onConflict: "board_id,requester_id,status" }).select("id, status").single();
      if (error) throw error;
      await database.from("account_notifications").insert({ recipient_id: board.owner_id, actor_id: actor.uid, board_id: boardId, kind: "access-request", title: `Access requested for ${board.title}`, body: `${profile.displayName} requested ${role} access.` });
      return response.status(201).json({ request: data });
    }

    if (action === "resolve-access") {
      const requestId = typeof request.body?.requestId === "string" ? request.body.requestId : "";
      const { data: accessRequest, error } = await database.from("board_access_requests").select("id, board_id, requester_id, requested_role, status").eq("id", requestId).single();
      if (error) throw error;
      const access = await getBoardAccess(accessRequest.board_id, actor.uid);
      if (!access || !ownerOnly(access.role)) return response.status(403).json({ error: "Only the owner can resolve access requests." });
      const approved = request.body?.decision === "approved";
      if (approved) {
        const { error: memberError } = await database.from("board_members").upsert({ board_id: accessRequest.board_id, user_id: accessRequest.requester_id, role: accessRequest.requested_role }, { onConflict: "board_id,user_id" });
        if (memberError) throw memberError;
      }
      const { error: updateError } = await database.from("board_access_requests").update({ status: approved ? "approved" : "denied", resolved_by: actor.uid, resolved_at: new Date().toISOString() }).eq("id", requestId).eq("status", "pending");
      if (updateError) throw updateError;
      return response.status(200).json({ resolved: true, status: approved ? "approved" : "denied" });
    }

    if (action === "create-share-link") {
      const boardId = typeof request.body?.boardId === "string" ? request.body.boardId : "";
      const access = await getBoardAccess(boardId, actor.uid);
      if (!access || !ownerOnly(access.role)) return response.status(403).json({ error: "Only the owner can create share links." });
      const token = randomBytes(24).toString("base64url");
      const expiresAt = typeof request.body?.expiresAt === "string" && !Number.isNaN(Date.parse(request.body.expiresAt)) ? new Date(request.body.expiresAt).toISOString() : null;
      const allowedDomain = typeof request.body?.allowedDomain === "string" ? request.body.allowedDomain.trim().toLowerCase().replace(/^@/, "").slice(0, 120) || null : null;
      const { data, error } = await database.from("board_share_links").insert({ board_id: boardId, token_hash: tokenHash(token), role: request.body?.role === "editor" ? "editor" : "viewer", allowed_domain: allowedDomain, expires_at: expiresAt, created_by: actor.uid }).select("id, role, allowed_domain, expires_at").single();
      if (error) throw error;
      return response.status(201).json({ link: data, token });
    }

    if (action === "revoke-share-link") {
      const linkId = typeof request.body?.linkId === "string" ? request.body.linkId : "";
      const { data: link, error: linkError } = await database.from("board_share_links").select("id, board_id").eq("id", linkId).single();
      if (linkError) throw linkError;
      const access = await getBoardAccess(link.board_id, actor.uid);
      if (!access || !ownerOnly(access.role)) return response.status(403).json({ error: "Only the owner can revoke share links." });
      const { error } = await database.from("board_share_links").update({ revoked_at: new Date().toISOString() }).eq("id", linkId).is("revoked_at", null);
      if (error) throw error;
      return response.status(200).json({ revoked: true });
    }

    if (action === "redeem-share-link") {
      const token = typeof request.body?.token === "string" ? request.body.token : "";
      const { data: link, error } = await database.from("board_share_links").select("id, board_id, role, allowed_domain, expires_at, revoked_at").eq("token_hash", tokenHash(token)).single();
      if (error) throw error;
      if (link.revoked_at || (link.expires_at && Date.parse(link.expires_at) <= Date.now())) return response.status(410).json({ error: "This share link has expired." });
      if (link.allowed_domain && !profile.email.toLowerCase().endsWith(`@${link.allowed_domain}`)) return response.status(403).json({ error: "This link is restricted to another email domain." });
      const { error: memberError } = await database.from("board_members").upsert({ board_id: link.board_id, user_id: actor.uid, role: link.role }, { onConflict: "board_id,user_id" });
      if (memberError) throw memberError;
      await database.from("board_share_links").update({ last_used_at: new Date().toISOString() }).eq("id", link.id);
      return response.status(200).json({ boardId: link.board_id, role: link.role });
    }

    return response.status(400).json({ error: "Unknown product action." });
  } catch (error) {
    const message = errorMessage(error, "The product request failed.");
    const status = message === "Authentication required." ? 401 : 500;
    return response.status(status).json({ error: message });
  }
}
