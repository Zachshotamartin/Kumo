import { authenticatedFetch } from "./apiClient";

export interface ProductGraphNode {
  id: string;
  title: string;
  visibility: "private" | "public";
  accessible: boolean;
  manageable: boolean;
}

export interface ProductGraphEdge {
  sourceId: string;
  targetId: string;
  shapeId: string;
}

export interface ProductGraph {
  sourceId: string;
  nodes: ProductGraphNode[];
  edges: ProductGraphEdge[];
  incoming: ProductGraphEdge[];
}

export interface WorkspaceFolder {
  id: string;
  workspace_id: string;
  parent_id: string | null;
  name: string;
}

export interface BoardOrganization {
  board_id: string;
  workspace_id: string | null;
  folder_id: string | null;
  favorite: boolean;
  archived_at: string | null;
  trashed_at: string | null;
}

export interface WorkspaceOverview {
  workspace: { workspace_id: string; role: "owner" | "admin" | "member" | "guest"; workspaces: { id: string; name: string; owner_id: string } };
  folders: WorkspaceFolder[];
  organization: BoardOrganization[];
  savedViews: SavedBoardView[];
}
export interface SavedBoardView { id: string; name: string; filter: "active" | "favorites" | "archived" | "trash"; sort: "updated" | "title"; density: "comfortable" | "compact"; position: number }

export interface AccountNotification {
  id: string;
  actor_id: string | null;
  board_id: string | null;
  kind: "comment" | "mention" | "reaction" | "share" | "friend" | "library" | "branch" | "access-request" | "access-change" | "system";
  title: string;
  body: string;
  action_url: string | null;
  read_at: string | null;
  archived_at: string | null;
  created_at: string;
}

export interface DesignLibrarySummary {
  id: string;
  source_board_id: string;
  owner_id: string;
  name: string;
  description: string;
  visibility: "private" | "workspace" | "public";
  latest_version: number;
  updated_at: string;
}

export interface LibrarySubscription { library_id: string; accepted_version: number }
export interface DesignLibraryVersion { library_id: string; version: number; semantic_version: string | null; description: string; release_status: "draft" | "review" | "published" | "deprecated"; approved_by: string | null; approved_at: string | null; changelog: string[]; created_by: string; created_at: string }

export interface BoardTemplateSummary {
  id: string;
  owner_id: string;
  source_board_id: string | null;
  name: string;
  description: string;
  visibility: "private" | "public";
  created_at: string;
  updated_at: string;
}

export interface BoardAccessRequest {
  id: string;
  board_id: string;
  requester_id: string;
  requested_role: "viewer" | "editor";
  message: string;
  status: "pending" | "approved" | "denied" | "cancelled";
  created_at: string;
  profiles?: { display_name: string; email: string; avatar_url: string | null };
}

export interface GovernedShareLink {
  id: string;
  board_id: string;
  role: "viewer" | "editor";
  allowed_domain: string | null;
  expires_at: string | null;
  revoked_at: string | null;
  created_at: string;
  last_used_at: string | null;
}

const productPost = <T>(body: Record<string, unknown>) => authenticatedFetch<T>("/api/product", {
  method: "POST", body: JSON.stringify(body),
});

export const loadProductGraph = (boardId: string) => authenticatedFetch<{ graph: ProductGraph }>(`/api/product?scope=graph&boardId=${encodeURIComponent(boardId)}`).then((result) => result.graph);
export const loadWorkspaceOverview = () => authenticatedFetch<WorkspaceOverview>("/api/product?scope=workspace").then((result) => ({
  ...result,
  folders: result.folders ?? [],
  organization: result.organization ?? [],
  savedViews: result.savedViews ?? [],
}));
export const loadNotificationInbox = () => authenticatedFetch<{ notifications?: AccountNotification[]; mutedBoardIds?: string[] }>("/api/product?scope=notifications").then((result) => ({ notifications: result.notifications ?? [], mutedBoardIds: result.mutedBoardIds ?? [] }));
export const loadNotifications = () => loadNotificationInbox().then((result) => result.notifications);
export const markNotificationRead = (id?: string) => productPost<{ updated: true }>({ action: "mark-notification", id });
export const updateNotificationState = (id: string, patch: { read?: boolean; archived?: boolean }) => productPost<{ updated: true }>({ action: "update-notification", id, ...patch });
export const setBoardNotificationMuted = (boardId: string, muted: boolean) => productPost<{ muted: boolean }>({ action: muted ? "mute-board-notifications" : "unmute-board-notifications", boardId });
export const loadLibraries = (boardId: string) => authenticatedFetch<{ libraries?: DesignLibrarySummary[]; subscriptions?: LibrarySubscription[] }>(`/api/product?scope=libraries&boardId=${encodeURIComponent(boardId)}`).then((result) => ({ libraries: result.libraries ?? [], subscriptions: result.subscriptions ?? [] }));
export const publishLibrary = (boardId: string, input: { name: string; description: string; visibility: DesignLibrarySummary["visibility"]; versionDescription: string; semanticVersion?: string; releaseStatus?: "draft" | "review" | "published"; changelog?: string[] }) => productPost<{ libraryId: string; version: number; assetCount: number; releaseStatus: string }>({ action: "publish-library", boardId, ...input });
export const loadLibraryVersions = (libraryId: string) => authenticatedFetch<{ library: DesignLibrarySummary; versions: DesignLibraryVersion[] }>(`/api/product?scope=library-versions&libraryId=${encodeURIComponent(libraryId)}`);
export const governLibraryRelease = (action: "approve-library-release" | "deprecate-library-release" | "rollback-library", libraryId: string, version: number) => productPost<{ updated: true }>({ action, libraryId, version });
export const loadLibraryDiff = (boardId: string, libraryId: string) => productPost<{ version: number; diff: Array<{ sourceId: string; status: "added" | "changed" | "removed" | "unchanged" }> }>({ action: "library-diff", boardId, libraryId });
export const applyLibrary = (boardId: string, libraryId: string) => productPost<{ applied: true; version: number; diff: Array<{ sourceId: string; status: string }> }>({ action: "apply-library", boardId, libraryId });
export const loadTemplates = () => authenticatedFetch<{ templates?: BoardTemplateSummary[] }>("/api/product?scope=templates").then((result) => result.templates ?? []);
export const createTemplate = (boardId: string, name: string, description: string, visibility: "private" | "public") => productPost<{ template: BoardTemplateSummary }>({ action: "create-template", boardId, name, description, visibility });
export const instantiateTemplate = (templateId: string, name?: string) => productPost<{ boardId: string }>({ action: "instantiate-template", templateId, name });
export const createFolder = (name: string, parentId?: string | null) => productPost<{ folder: WorkspaceFolder }>({ action: "create-folder", name, parentId });
export const organizeBoard = (action: "move-board" | "favorite-board" | "archive-board" | "trash-board" | "restore-board", boardId: string, payload: Record<string, unknown> = {}) => productPost<{ organization: BoardOrganization }>({ action, boardId, ...payload });
export const saveBoardView = (view: Omit<SavedBoardView, "id" | "position">) => productPost<{ view: SavedBoardView }>({ action: "save-board-view", ...view });
export const renameBoardView = (viewId: string, name: string) => productPost<{ view: SavedBoardView }>({ action: "rename-board-view", viewId, name });
export const deleteBoardView = (viewId: string) => productPost<{ deleted: true }>({ action: "delete-board-view", viewId });
export const reorderBoardViews = (orderedIds: string[]) => productPost<{ reordered: true }>({ action: "reorder-board-views", orderedIds });
export const requestBoardAccess = (boardId: string, role: "viewer" | "editor", message: string) => productPost<{ request: { id: string; status: string } }>({ action: "request-access", boardId, role, message });
export const createShareLink = (boardId: string, options: { role: "viewer" | "editor"; allowedDomain?: string; expiresAt?: string }) => productPost<{ link: { id: string; role: string; allowed_domain: string | null; expires_at: string | null }; token: string }>({ action: "create-share-link", boardId, ...options });
export const redeemShareLink = (token: string) => productPost<{ boardId: string; role: "viewer" | "editor" }>({ action: "redeem-share-link", token });
export const loadShareLinks = (boardId: string) => authenticatedFetch<{ links?: GovernedShareLink[] }>(`/api/product?scope=share-links&boardId=${encodeURIComponent(boardId)}`).then((result) => result.links ?? []);
export const revokeShareLink = (linkId: string) => productPost<{ revoked: true }>({ action: "revoke-share-link", linkId });
export const loadAccessRequests = (boardId: string) => authenticatedFetch<{ requests?: BoardAccessRequest[] }>(`/api/product?scope=access-requests&boardId=${encodeURIComponent(boardId)}`).then((result) => result.requests ?? []);
export const resolveAccessRequest = (requestId: string, decision: "approved" | "denied") => productPost<{ resolved: true; status: string }>({ action: "resolve-access", requestId, decision });
