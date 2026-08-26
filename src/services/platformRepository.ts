import { authenticatedFetch, publicFetch } from "./apiClient";

export type WorkspaceRole = "owner" | "admin" | "member" | "guest";
export interface WorkspaceMember {
  user_id: string;
  role: WorkspaceRole;
  created_at: string;
  profile: { firebase_uid: string; display_name: string; email: string; avatar_url: string | null; username: string } | null;
}
export interface WorkspaceInvitation { id: string; email: string; role: Exclude<WorkspaceRole, "owner">; status: string; expires_at: string; created_at: string }
export interface WorkspaceFolderAdmin { id: string; workspace_id: string; parent_id: string | null; name: string; created_by: string; created_at: string; updated_at: string }
export interface WorkspaceAdminOverview {
  workspace: { workspace_id: string; role: WorkspaceRole; workspaces: { id: string; name: string; owner_id: string } };
  members: WorkspaceMember[];
  folders: WorkspaceFolderAdmin[];
  invitations: WorkspaceInvitation[];
}

export interface NotificationPreferences {
  user_id: string;
  browser_enabled: boolean;
  digest: "instant" | "daily" | "weekly" | "off";
  board_comments: "all" | "mentions" | "off";
  branch_reviews: boolean;
  library_updates: boolean;
  access_changes: boolean;
}

export interface GlobalSearchResult { kind: "board" | "profile" | "template" | "community"; id: string; label: string; detail: string; actionUrl: string }
export interface OperationsOverview {
  events: Array<{ id: number; board_id: string | null; actor_id: string | null; event_type: string; payload: Record<string, unknown>; created_at: string }>;
  telemetry: { counts: Record<"ready" | "lost" | "failed" | "restored", number>; eventCount: number; retryCount: number; recoveryRate: number; averageRecoveryMs: number; healthy: boolean };
}
export interface PrototypeLink { id: string; board_id: string; start_shape_id: string | null; device_frame: "none" | "phone" | "tablet" | "desktop"; expires_at: string | null; revoked_at: string | null; created_at: string }
export interface OpenBoardSession { id: string; board_id: string; role: "viewer" | "editor"; expires_at: string; revoked_at: string | null; last_used_at?: string | null; use_count?: number; created_at: string }
export interface RedeemedOpenSession { id: string; boardId: string; title: string; roomId: string; ownerId: string; visibility: "private" | "public"; role: "viewer" | "editor"; expiresAt: string; guestId: string; updatedAt: number | null }
export interface CatalogExtension { id: string; name: string; description: string; manifest: { id: string; name: string; permissions: string[]; commands: Array<{ id: string; name: string; operation: string }> }; publisher_id: string | null; verified: boolean; updated_at: string; installed_extensions?: Array<{ user_id: string; granted_permissions: string[]; enabled: boolean }> }
export interface CommunityPublication { board_id: string; published_by: string; slug: string; description: string; tags: string[]; remix_allowed: boolean; remix_count: number; published_at: string; boards?: { title: string } }
export interface CommunityReport {
  id: string;
  board_id: string;
  reporter_id: string;
  category: string;
  reason: string;
  status: string;
  reviewed_by?: string | null;
  reviewed_at?: string | null;
  review_note?: string | null;
  created_at: string;
  boards?: { title?: string };
  community_publications?: { slug?: string };
}
export interface AccountSession { id: string; user_agent: string; created_at: string; last_seen_at: string; revoked_at: string | null; current: boolean }

const post = <T>(body: Record<string, unknown>) => authenticatedFetch<T>("/api/platform", { method: "POST", body: JSON.stringify(body) });
const scope = <T>(name: string, query: Record<string, string> = {}) => {
  const params = new URLSearchParams({ scope: name, ...query });
  return authenticatedFetch<T>(`/api/platform?${params.toString()}`);
};

export const loadWorkspaceAdmin = () => scope<WorkspaceAdminOverview>("workspace-admin");
export const renameWorkspace = (workspaceId: string, name: string) => post<{ workspace: { id: string; name: string; owner_id: string } }>({ action: "rename-workspace", workspaceId, name });
export const inviteWorkspaceMember = (workspaceId: string, email: string, role: "admin" | "member" | "guest") => post<{ invitation?: WorkspaceInvitation; added?: boolean; userId?: string; role: string; url?: string }>({ action: "invite-workspace-member", workspaceId, email, role });
export const acceptWorkspaceInvitation = (token: string) => post<{ accepted: true; workspaceId: string }>({ action: "accept-workspace-invitation", token });
export const cancelWorkspaceInvitation = (workspaceId: string, invitationId: string) => post<{ cancelled: true }>({ action: "cancel-workspace-invitation", workspaceId, invitationId });
export const updateWorkspaceMember = (workspaceId: string, userId: string, role: "admin" | "member" | "guest") => post<{ updated: true; role: string }>({ action: "update-workspace-member", workspaceId, userId, role });
export const removeWorkspaceMember = (workspaceId: string, userId: string) => post<{ removed: true }>({ action: "remove-workspace-member", workspaceId, userId });
export const transferWorkspaceOwnership = (workspaceId: string, userId: string) => post<{ transferred: true; ownerId: string }>({ action: "transfer-workspace-ownership", workspaceId, userId });
export const leaveWorkspace = (workspaceId: string) => post<{ left: true }>({ action: "leave-workspace", workspaceId });
export const mutateWorkspaceFolder = (action: "rename-folder" | "move-folder" | "delete-folder", workspaceId: string, folderId: string, payload: Record<string, unknown> = {}) => post<{ folder?: WorkspaceFolderAdmin; deleted?: true }>({ action, workspaceId, folderId, ...payload });

export const loadNotificationPreferences = () => scope<{ preferences: NotificationPreferences }>("notification-preferences").then((result) => result.preferences);
export const updateNotificationPreferences = (preferences: Partial<NotificationPreferences>) => post<{ preferences: NotificationPreferences }>({ action: "update-notification-preferences", preferences }).then((result) => result.preferences);
export const loadPushConfig = () => scope<{ configured: boolean; publicKey: string }>("push-config");
export const subscribePush = (subscription: { endpoint: string; p256dh: string; auth: string }) => post<{ subscription: { id: string; endpoint: string; updated_at: string } }>({ action: "subscribe-push", ...subscription });
export const unsubscribePush = (endpoint: string) => post<{ unsubscribed: true }>({ action: "unsubscribe-push", endpoint });
export const testPush = () => post<{ delivered: number; subscriptions: number }>({ action: "test-push" });
export const globalSearch = (q: string) => scope<{ results: GlobalSearchResult[] }>("global-search", { q }).then((result) => result.results);
export const loadOperations = (boardId?: string) => scope<OperationsOverview>("operations", boardId ? { boardId } : {});

export const loadPrototypeLinks = (boardId: string) => scope<{ links: PrototypeLink[] }>("prototype-links", { boardId }).then((result) => result.links);
export const createPrototypeLink = (boardId: string, input: { startShapeId?: string; password?: string; deviceFrame: PrototypeLink["device_frame"]; expiresAt?: string }) => post<{ link: PrototypeLink; token: string; url: string }>({ action: "create-prototype-link", boardId, ...input });
export const revokePrototypeLink = (boardId: string, linkId: string) => post<{ revoked: true }>({ action: "revoke-prototype-link", boardId, linkId });
export const redeemPrototype = (token: string, password = "") => publicFetch<{ prototype: { boardId: string; title: string; startShapeId: string | null; deviceFrame: string; document: Record<string, unknown> } }>("/api/platform", { method: "POST", body: JSON.stringify({ action: "redeem-prototype", token, password }) }).then((result) => result.prototype);

export const loadOpenSessions = (boardId: string) => scope<{ sessions: OpenBoardSession[] }>("open-sessions", { boardId }).then((result) => result.sessions);
export const createOpenSession = (boardId: string, input: { role: "viewer" | "editor"; password?: string; expiresAt?: string }) => post<{ session: OpenBoardSession; token: string; url: string }>({ action: "create-open-session", boardId, ...input });
export const revokeOpenSession = (boardId: string, sessionId: string) => post<{ revoked: true }>({ action: "revoke-open-session", boardId, sessionId });
export const redeemOpenSession = (token: string, password = "", guestNonce = "") => publicFetch<{ session: RedeemedOpenSession }>("/api/platform", { method: "POST", body: JSON.stringify({ action: "redeem-open-session", token, password, guestNonce }) }).then((result) => result.session);

export const loadExtensions = () => scope<{ extensions: CatalogExtension[] }>("extensions").then((result) => result.extensions);
export const publishExtension = (manifest: CatalogExtension["manifest"], description: string) => post<{ extension: CatalogExtension }>({ action: "publish-extension", manifest, description });
export const installExtension = (extensionId: string, permissions: string[]) => post<{ installed: true; permissions: string[] }>({ action: "install-extension", extensionId, permissions });
export const toggleExtension = (extensionId: string, enabled: boolean) => post<{ enabled: boolean }>({ action: "toggle-extension", extensionId, enabled });
export const uninstallExtension = (extensionId: string) => post<{ uninstalled: true }>({ action: "uninstall-extension", extensionId });

export const loadCommunity = () => scope<{ publications: CommunityPublication[] }>("community").then((result) => result.publications);
export const publishCommunity = (boardId: string, input: { slug?: string; description: string; tags: string[]; remixAllowed: boolean }) => post<{ publication: CommunityPublication }>({ action: "publish-community", boardId, ...input });
export const unpublishCommunity = (boardId: string) => post<{ unpublished: true }>({ action: "unpublish-community", boardId });
export const remixCommunity = (boardId: string) => post<{ boardId: string }>({ action: "remix-community", boardId });
export const reportCommunity = (boardId: string, reason: string) => post<{ reported: true }>({ action: "report-community", boardId, reason });
export const reportCommunityCategory = (boardId: string, category: string, reason: string) => post<{ reported: true }>({ action: "report-community", boardId, category, reason });
export const loadCommunityModeration = () => scope<{ reports: CommunityReport[] }>("community-moderation").then((result) => result.reports);
export const moderateCommunity = (reportId: string, decision: "reviewed" | "dismissed" | "removed", note = "") => post<{ moderated: true; decision: string }>({ action: "moderate-community", reportId, decision, note });

export const exportAccountData = () => scope<Record<string, unknown>>("account-export");
export interface AccountDeletionStatus { requested_at: string; scheduled_for: string; cancelled_at: string | null; processing_started_at: string | null; attempt_count: number; last_error: string | null }
export const loadAccountDeletion = () => scope<{ deletion: AccountDeletionStatus | null }>("account-deletion").then((result) => result.deletion);
export const loadAccountSessions = () => scope<{ sessions: AccountSession[] }>("account-sessions").then((result) => result.sessions);
export const revokeAccountSession = (sessionId: string) => post<{ revoked: true }>({ action: "revoke-account-session", sessionId });
export const revokeAccountSessions = () => post<{ revoked: true }>({ action: "revoke-sessions" });
export const requestAccountDeletion = () => post<{ deletion: { requested_at: string; scheduled_for: string } }>({ action: "request-account-deletion" });
export const cancelAccountDeletion = () => post<{ cancelled: true }>({ action: "cancel-account-deletion" });
