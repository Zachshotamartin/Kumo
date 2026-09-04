import { boardSummary, type BoardRow } from "./_boards.js";
import { liveblocksAdmin } from "./_liveblocks.js";
import type { ActorProfile } from "./_supabase.js";
import { supabaseAdmin } from "./_supabase.js";

const dataOrThrow = async <T>(query: PromiseLike<{ data: T; error: unknown }>): Promise<T> => {
  const { data, error } = await query;
  if (error) throw error;
  return data;
};

const base64StorageObject = async (bucket: string, storageKey: string) => {
  const { data, error } = await supabaseAdmin().storage.from(bucket).download(storageKey);
  if (error) throw error;
  return Buffer.from(await data.arrayBuffer()).toString("base64");
};

export const buildAccountExport = async (actorUid: string, profile: ActorProfile) => {
  const database = supabaseAdmin();
  // Account portability includes complete content for boards the account owns,
  // including boards still in the retention window. Shared-board documents may
  // contain other people's private work, so export only the membership record
  // for those boards below rather than copying their storage and comments.
  const ownedRows = await dataOrThrow(database.from("boards")
    .select("id, owner_id, title, visibility, liveblocks_room_id, thumbnail_asset_id, legacy_rtdb_id, created_at, updated_at, deleted_at, workspace_id")
    .eq("owner_id", actorUid)
    .order("updated_at", { ascending: false }));
  const boards = ((ownedRows ?? []) as BoardRow[]).map((board) => boardSummary(board, "owner"));
  const boardIds = boards.map((board) => board.id);
  const boardDocuments = await Promise.all(boards.map(async (board) => {
    const [document, threads] = await Promise.all([
      liveblocksAdmin().getStorageDocument(board.roomId, "json"),
      liveblocksAdmin().getThreads({ roomId: board.roomId }).then((result) => result.data),
    ]);
    return { boardId: board.id, roomId: board.roomId, document, comments: threads };
  }));

  const empty = { data: [], error: null };
  const [
    notifications, friendships, auditEvents, assets, snapshots, branches, libraries, subscriptions,
    organization, boardMemberships, memberships, invitations, templates, publications, reports,
    workspaces, preferences, mutes, savedViews, sessions, deletionRequests, pushSubscriptions,
    installedExtensions, performanceEvents, boardInvitations,
  ] = await Promise.all([
    dataOrThrow(database.from("account_notifications").select("*").eq("recipient_id", actorUid).order("created_at", { ascending: false })),
    dataOrThrow(database.from("friendships").select("*").or(`user_low_id.eq.${actorUid},user_high_id.eq.${actorUid}`)),
    dataOrThrow(database.from("audit_events").select("*").eq("actor_id", actorUid).order("created_at", { ascending: false })),
    boardIds.length ? dataOrThrow(database.from("assets").select("*").in("board_id", boardIds)) : Promise.resolve(empty.data),
    boardIds.length ? dataOrThrow(database.from("document_snapshots").select("*").in("board_id", boardIds).order("created_at", { ascending: false })) : Promise.resolve(empty.data),
    boardIds.length ? dataOrThrow(database.from("document_branches").select("*").in("board_id", boardIds).order("created_at", { ascending: false })) : Promise.resolve(empty.data),
    dataOrThrow(database.from("design_libraries").select("*").eq("owner_id", actorUid)),
    dataOrThrow(database.from("design_library_subscriptions").select("*").eq("subscribed_by", actorUid)),
    dataOrThrow(database.from("board_organization").select("*").eq("user_id", actorUid)),
    dataOrThrow(database.from("board_members").select("*, boards(id, liveblocks_room_id)").eq("user_id", actorUid)),
    dataOrThrow(database.from("workspace_members").select("*").eq("user_id", actorUid)),
    dataOrThrow(database.from("workspace_invitations").select("id, workspace_id, email, role, status, expires_at, accepted_at, created_at").or(`invited_by.eq.${actorUid},accepted_by.eq.${actorUid}`)),
    dataOrThrow(database.from("board_templates").select("*").eq("owner_id", actorUid)),
    dataOrThrow(database.from("community_publications").select("*").eq("published_by", actorUid)),
    dataOrThrow(database.from("community_reports").select("*").eq("reporter_id", actorUid)),
    dataOrThrow(database.from("workspaces").select("*").eq("owner_id", actorUid)),
    dataOrThrow(database.from("notification_preferences").select("*").eq("user_id", actorUid)),
    dataOrThrow(database.from("board_notification_mutes").select("*").eq("user_id", actorUid)),
    dataOrThrow(database.from("saved_board_views").select("*").eq("user_id", actorUid).order("position", { ascending: true })),
    dataOrThrow(database.from("account_sessions").select("*").eq("user_id", actorUid).order("created_at", { ascending: false })),
    dataOrThrow(database.from("account_deletion_requests").select("*").eq("user_id", actorUid)),
    dataOrThrow(database.from("push_subscriptions").select("*").eq("user_id", actorUid)),
    dataOrThrow(database.from("installed_extensions").select("*").eq("user_id", actorUid)),
    dataOrThrow(database.from("performance_events").select("*").eq("actor_id", actorUid).order("created_at", { ascending: false })),
    dataOrThrow(database.from("board_invitations").select("id, board_id, email, role, include_linked_boards, invited_by, accepted_by, status, expires_at, accepted_at, last_sent_at, created_at").or(`invited_by.eq.${actorUid},accepted_by.eq.${actorUid},email.ilike.${profile.email}`)),
  ]);

  const libraryIds = (libraries ?? []).map((library) => library.id as string);
  const versions = libraryIds.length
    ? await dataOrThrow(database.from("design_library_versions").select("*").in("library_id", libraryIds).order("created_at", { ascending: false }))
    : [];
  const branchIds = (branches ?? []).map((branch) => branch.id as string);
  const workspaceIds = (workspaces ?? []).map((workspace) => workspace.id as string);
  const [branchReviews, branchConflicts, boardLinks, accessRequestsReceived, shareLinks, prototypeLinks, openSessions, ownedWorkspaceFolders, createdWorkspaceFolders, uploadedFonts] = await Promise.all([
    branchIds.length ? dataOrThrow(database.from("branch_reviews").select("*").in("branch_id", branchIds)) : Promise.resolve([]),
    branchIds.length ? dataOrThrow(database.from("branch_conflicts").select("*").in("branch_id", branchIds)) : Promise.resolve([]),
    boardIds.length ? dataOrThrow(database.from("board_links").select("*").in("source_board_id", boardIds)) : Promise.resolve([]),
    boardIds.length ? dataOrThrow(database.from("board_access_requests").select("*").in("board_id", boardIds)) : Promise.resolve([]),
    boardIds.length ? dataOrThrow(database.from("board_share_links").select("id, board_id, role, allowed_domain, expires_at, created_by, revoked_at, last_used_at, created_at").in("board_id", boardIds)) : Promise.resolve([]),
    boardIds.length ? dataOrThrow(database.from("prototype_share_links").select("id, board_id, start_shape_id, device_frame, expires_at, created_by, revoked_at, created_at").in("board_id", boardIds)) : Promise.resolve([]),
    boardIds.length ? dataOrThrow(database.from("board_open_sessions").select("id, board_id, role, expires_at, created_by, created_at, revoked_at, last_used_at, use_count").in("board_id", boardIds)) : Promise.resolve([]),
    workspaceIds.length ? dataOrThrow(database.from("workspace_folders").select("*").in("workspace_id", workspaceIds)) : Promise.resolve([]),
    dataOrThrow(database.from("workspace_folders").select("*").eq("created_by", actorUid)),
    dataOrThrow(database.from("workspace_fonts").select("*").eq("uploaded_by", actorUid)),
  ]);
  const [productFlows, productFlowNodes, productFlowEdges, coveragePolicies, coverageRuns, coverageSuppressions, coverageMergeGates, coverageGateOverrides, coverageTelemetryEvents] = await Promise.all([
    dataOrThrow(database.from("product_flows").select("*").eq("owner_id", actorUid)),
    boardIds.length ? dataOrThrow(database.from("product_flow_nodes").select("*").in("board_id", boardIds)) : Promise.resolve([]),
    boardIds.length ? dataOrThrow(database.from("product_flow_edges").select("*").in("source_board_id", boardIds)) : Promise.resolve([]),
    workspaceIds.length ? dataOrThrow(database.from("coverage_policies").select("*").in("workspace_id", workspaceIds)) : Promise.resolve([]),
    boardIds.length ? dataOrThrow(database.from("coverage_runs").select("*").in("root_board_id", boardIds)) : Promise.resolve([]),
    dataOrThrow(database.from("coverage_suppressions").select("*").eq("owner_id", actorUid)),
    boardIds.length ? dataOrThrow(database.from("coverage_merge_gates").select("*").in("board_id", boardIds)) : Promise.resolve([]),
    dataOrThrow(database.from("coverage_gate_overrides").select("*").eq("actor_id", actorUid)),
    workspaceIds.length ? dataOrThrow(database.from("coverage_telemetry_events").select("*").in("workspace_id", workspaceIds).order("occurred_at", { ascending: false })) : Promise.resolve([]),
  ]);
  const coverageRunIds = (coverageRuns ?? []).map((run) => run.id as string);
  const [coverageRunInputs, coverageFindings] = await Promise.all([
    coverageRunIds.length ? dataOrThrow(database.from("coverage_run_inputs").select("*").in("run_id", coverageRunIds)) : Promise.resolve([]),
    coverageRunIds.length ? dataOrThrow(database.from("coverage_findings").select("*").in("run_id", coverageRunIds)) : Promise.resolve([]),
  ]);
  const accessRequestsMade = await dataOrThrow(database.from("board_access_requests").select("*").eq("requester_id", actorUid));
  const branchDocuments = await Promise.all((branches ?? []).map(async (branch) => ({
    branchId: branch.id,
    roomId: branch.room_id,
    document: await liveblocksAdmin().getStorageDocument(branch.room_id as string, "json"),
    comments: await liveblocksAdmin().getThreads({ roomId: branch.room_id as string }).then((result) => result.data),
  })));
  const portableAssets = await Promise.all((assets ?? []).map(async (asset) => ({
    ...asset,
    encoding: "base64",
    data: await base64StorageObject("board-assets", asset.storage_key as string),
  })));
  const portableFonts = await Promise.all((uploadedFonts ?? []).map(async (font) => ({
    ...font,
    encoding: "base64",
    data: await base64StorageObject("workspace-fonts", font.storage_key as string),
  })));
  const sharedRooms = (boardMemberships ?? []).flatMap((membership) => {
    const related = Array.isArray(membership.boards) ? membership.boards[0] : membership.boards;
    if (!related || boardIds.includes(related.id as string)) return [];
    return [{ boardId: related.id as string, roomId: related.liveblocks_room_id as string }];
  });
  const sharedAuthoredComments = await Promise.all(sharedRooms.map(async ({ boardId, roomId }) => {
    const { data: threads } = await liveblocksAdmin().getThreads({ roomId });
    return {
      boardId,
      roomId,
      threads: threads.flatMap((thread) => {
        const comments = thread.comments.filter((comment) => comment.userId === actorUid);
        return comments.length ? [{ threadId: thread.id, comments }] : [];
      }),
    };
  }));

  return {
    format: "kumo-account-export",
    version: 3,
    exportedAt: new Date().toISOString(),
    profile,
    boards,
    boardDocuments,
    sharedAuthoredComments,
    assets: portableAssets,
    snapshots: snapshots ?? [],
    branches: branches ?? [],
    branchDocuments,
    branchReviews,
    branchConflicts,
    boardLinks,
    libraries: libraries ?? [],
    libraryVersions: versions,
    librarySubscriptions: subscriptions ?? [],
    notifications: notifications ?? [],
    friendships: friendships ?? [],
    auditEvents: auditEvents ?? [],
    organization: organization ?? [],
    boardMemberships: boardMemberships ?? [],
    boardInvitations: boardInvitations ?? [],
    boardAccessRequestsMade: accessRequestsMade ?? [],
    boardAccessRequestsReceived: accessRequestsReceived,
    boardShareLinks: shareLinks,
    prototypeShareLinks: prototypeLinks,
    boardOpenSessions: openSessions,
    workspaceMemberships: memberships ?? [],
    ownedWorkspaces: workspaces ?? [],
    ownedWorkspaceFolders,
    createdWorkspaceFolders: createdWorkspaceFolders ?? [],
    uploadedWorkspaceFonts: portableFonts,
    workspaceInvitations: invitations ?? [],
    notificationPreferences: preferences ?? [],
    notificationMutes: mutes ?? [],
    savedViews: savedViews ?? [],
    accountSessions: sessions ?? [],
    accountDeletionRequests: deletionRequests ?? [],
    pushSubscriptions: pushSubscriptions ?? [],
    installedExtensions: installedExtensions ?? [],
    performanceEvents: performanceEvents ?? [],
    templates: templates ?? [],
    communityPublications: publications ?? [],
    communityReports: reports ?? [],
    productFlows: productFlows ?? [],
    productFlowNodes: productFlowNodes ?? [],
    productFlowEdges: productFlowEdges ?? [],
    coveragePolicies: coveragePolicies ?? [],
    coverageRuns: coverageRuns ?? [],
    coverageRunInputs,
    coverageFindings,
    coverageSuppressions: coverageSuppressions ?? [],
    coverageMergeGates,
    coverageGateOverrides: coverageGateOverrides ?? [],
    coverageTelemetryEvents,
  };
};
