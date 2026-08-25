import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Liveblocks } from "@liveblocks/node";
import { chromium, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

const baseUrl = new URL(process.argv[2] ?? "http://localhost:5175");
const envPath = resolve(process.argv[3] ?? ".env.local");

const parseEnv = (source) => Object.fromEntries(
  source.split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#") && line.includes("="))
    .map((line) => {
      const separator = line.indexOf("=");
      const key = line.slice(0, separator).trim();
      const raw = line.slice(separator + 1).trim();
      const quoted = (raw.startsWith('"') && raw.endsWith('"'))
        || (raw.startsWith("'") && raw.endsWith("'"));
      return [key, quoted ? raw.slice(1, -1).replace(/\\n/g, "\n") : raw];
    })
);

const env = { ...parseEnv(await readFile(envPath, "utf8")), ...process.env };
const required = (name) => {
  const value = env[name];
  if (!value || /placeholder|sensitive|encrypted|^\[.*\]$/i.test(value)) {
    throw new Error(`${name} must contain a concrete value in ${envPath}.`);
  }
  return value;
};

const firebaseApiKey = env.VITE_FIREBASE_API_KEY || "AIzaSyBA9pnDobxLfEjNYrxS9H2r8CMwFg_C7Zs";
const supabaseUrl = required("SUPABASE_URL");
const supabaseServiceRoleKey = required("SUPABASE_SERVICE_ROLE_KEY");
const liveblocksSecretKey = required("LIVEBLOCKS_SECRET_KEY");
if (!liveblocksSecretKey.startsWith("sk_")) throw new Error("LIVEBLOCKS_SECRET_KEY must begin with sk_.");

const liveblocks = new Liveblocks({ secret: liveblocksSecretKey });
const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
const supabaseHeaders = {
  apikey: supabaseServiceRoleKey,
  authorization: `Bearer ${supabaseServiceRoleKey}`,
  "content-type": "application/json",
};
const identityUrl = (operation) =>
  `https://identitytoolkit.googleapis.com/v1/accounts:${operation}?key=${encodeURIComponent(firebaseApiKey)}`;

const accounts = [];
const boards = [];
const roomIds = new Set();
const extensionIds = new Set();
const fontStorageKeys = new Set();
let browser;

const messageFromBody = (body, status) => typeof body?.error?.message === "string"
  ? body.error.message
  : typeof body?.error === "string"
    ? body.error
    : typeof body?.message === "string"
      ? body.message
      : `HTTP ${status}`;

const jsonRequest = async (input, init = {}) => {
  const response = await fetch(input, init);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${input}: ${messageFromBody(body, response.status)}`);
  return body;
};

const createAccount = async (label) => {
  const password = `Kumo-${randomUUID()}-A1!`;
  const email = `kumo-full-stack-${label}-${randomUUID()}@example.com`;
  const account = await jsonRequest(identityUrl("signUp"), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password, returnSecureToken: true }),
  });
  const result = {
    email,
    password,
    idToken: account.idToken,
    uid: account.localId,
  };
  accounts.push(result);
  return result;
};

const authHeaders = (account) => ({ authorization: `Bearer ${account.idToken}` });
const api = (account, path, init = {}) => jsonRequest(new URL(path, baseUrl), {
  ...init,
  headers: {
    ...authHeaders(account),
    ...(init.body ? { "content-type": "application/json" } : {}),
    ...init.headers,
  },
});
const post = (account, path, body) => api(account, path, {
  method: "POST",
  body: JSON.stringify(body),
});

const createBoard = async (account, title) => {
  const result = await post(account, "/api/boards", { action: "create", title });
  if (!result.board?.id || !result.board?.roomId) throw new Error("The boards API returned an incomplete board.");
  boards.push(result.board);
  roomIds.add(result.board.roomId);
  return result.board;
};

const boardDocument = (nodes, backgroundColor = "#252629") => ({
  liveblocksType: "LiveObject",
  data: {
    schemaVersion: 4,
    backgroundColor,
    nodes: {
      liveblocksType: "LiveMap",
      data: Object.fromEntries(Object.entries(nodes).map(([id, shape]) => [id, {
        liveblocksType: "LiveObject",
        data: JSON.parse(JSON.stringify(shape)),
      }])),
    },
  },
});

const replaceDocument = async (roomId, nodes, backgroundColor) => {
  await liveblocks.deleteStorageDocument(roomId);
  await liveblocks.initializeStorageDocument(roomId, boardDocument(nodes, backgroundColor));
};

const supabaseRows = async (table, query) => {
  const url = new URL(`/rest/v1/${table}`, supabaseUrl);
  Object.entries(query).forEach(([key, value]) => url.searchParams.set(key, value));
  return jsonRequest(url, { headers: supabaseHeaders });
};

const waitForAuditEvent = async (boardId, actorId, eventType, timeoutMs = 20_000) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const rows = await supabaseRows("audit_events", {
      select: "event_type,payload,created_at",
      board_id: `eq.${boardId}`,
      actor_id: `eq.${actorId}`,
      event_type: `eq.${eventType}`,
      order: "created_at.desc",
      limit: "1",
    });
    if (rows.length) return rows[0];
    await new Promise((resolveWait) => setTimeout(resolveWait, 750));
  }
  throw new Error(`Timed out waiting for ${eventType} telemetry.`);
};

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const seedShape = {
  id: "collaboration-shape",
  type: "rectangle",
  name: "Shared ochre card",
  x1: 470,
  y1: 110,
  x2: 630,
  y2: 220,
  width: 160,
  height: 110,
  level: 0,
  zIndex: 2,
  backgroundColor: "#b87a2e",
  borderColor: "#17181a",
  borderWidth: 1,
};
const libraryComponent = {
  id: "library-component",
  type: "frame",
  name: "Library button",
  x1: 80,
  y1: 70,
  x2: 300,
  y2: 150,
  width: 220,
  height: 80,
  level: 0,
  zIndex: 1,
  componentDefinition: true,
  backgroundColor: "#f7f7f5",
};
const libraryLabel = {
  id: "library-label",
  type: "text",
  name: "Button label",
  parentId: "library-component",
  x1: 105,
  y1: 92,
  x2: 275,
  y2: 132,
  width: 170,
  height: 40,
  level: 0,
  zIndex: 2,
  text: "Continue",
  color: "#17181a",
  fontSize: 18,
};

const loginAndOpenBoard = async (context, account, boardTitle) => {
  const page = await context.newPage();
  const diagnostics = [];
  const pendingRequests = new Map();
  page.on("request", (request) => pendingRequests.set(request, `${request.method()} ${request.url()}`));
  page.on("requestfinished", (request) => pendingRequests.delete(request));
  page.on("pageerror", (error) => diagnostics.push(`pageerror: ${error.message}`));
  page.on("requestfailed", (request) => {
    pendingRequests.delete(request);
    diagnostics.push(`requestfailed: ${request.method()} ${request.url()} (${request.failure()?.errorText ?? "unknown"})`);
  });
  page.on("response", (response) => {
    if (response.status() >= 400) diagnostics.push(`response: ${response.status()} ${response.url()}`);
  });
  page.on("console", (message) => {
    if (message.type() === "error") diagnostics.push(`console: ${message.text()}`);
  });
  await page.goto(baseUrl.toString(), { waitUntil: "domcontentloaded" });
  await page.getByLabel("Email").fill(account.email);
  await page.getByLabel("Password").fill(account.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("button", { name: "Kumo boards" })).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: `Open ${boardTitle}`, exact: true }).click({ timeout: 60_000 });
  try {
    await expect(page.getByRole("application", { name: "Kumo design canvas" })).toBeVisible({ timeout: 60_000 });
  } catch (error) {
    const pageText = (await page.locator("body").innerText().catch(() => "")).slice(0, 1_000);
    const pending = [...pendingRequests.values()].slice(-12).join(" | ") || "none";
    const resources = await page.evaluate(() => performance.getEntriesByType("resource").slice(-12).map((entry) => `${entry.name} (${Math.round(entry.duration)}ms)`).join(" | ")).catch(() => "unavailable");
    throw new Error(`The editor did not become ready for ${boardTitle}. URL: ${page.url()}. Page: ${pageText}. Pending: ${pending}. Recent resources: ${resources}. Diagnostics: ${diagnostics.slice(-12).join(" | ") || "none"}`, { cause: error });
  }
  await expect(page.locator('[data-shape-id="collaboration-shape"]')).toBeVisible({ timeout: 30_000 });
  return page;
};

const center = async (locator) => {
  const box = await locator.boundingBox();
  if (!box) throw new Error("The shared object did not have browser geometry.");
  return { x: box.x + box.width / 2, y: box.y + box.height / 2, box };
};

try {
  const owner = await createAccount("owner");
  const collaborator = await createAccount("collaborator");
  const communityMember = await createAccount("community");
  await post(owner, "/api/session", {});
  await post(collaborator, "/api/session", {});
  await post(communityMember, "/api/session", {});

  const source = await createBoard(owner, "Full-stack product source");
  const target = await createBoard(owner, "Full-stack library target");
  const accessBoard = await createBoard(owner, "Full-stack access review");
  await replaceDocument(source.roomId, {
    [libraryComponent.id]: libraryComponent,
    [libraryLabel.id]: libraryLabel,
    [seedShape.id]: seedShape,
  });

  const workspace = await api(owner, "/api/product?scope=workspace");
  assert(workspace.workspace?.workspace_id, "Workspace creation did not persist in Supabase.");
  const workspaceId = workspace.workspace.workspace_id;
  const workspaceAdmin = await api(owner, "/api/platform?scope=workspace-admin");
  assert(workspaceAdmin.workspace?.workspace_id === workspaceId, "Workspace administration did not resolve the primary workspace.");
  const preparedFont = await post(owner, "/api/platform", {
    action: "prepare-font-upload", fileName: "full-stack.woff2", mimeType: "font/woff2", byteSize: 8,
  });
  assert(preparedFont.upload?.path && preparedFont.upload?.token, "Workspace font upload preparation did not return a signed target.");
  const fontBytes = new Uint8Array([0x77, 0x4f, 0x46, 0x32, 0, 0, 0, 0]);
  const { error: fontUploadError } = await supabase.storage.from("workspace-fonts").uploadToSignedUrl(
    preparedFont.upload.path,
    preparedFont.upload.token,
    fontBytes,
    { contentType: "font/woff2" },
  );
  if (fontUploadError) throw fontUploadError;
  fontStorageKeys.add(preparedFont.upload.path);
  const completedFont = await post(owner, "/api/platform", {
    action: "complete-font-upload", storageKey: preparedFont.upload.path, family: "Full Stack Sans", style: "normal", weightMin: 400, weightMax: 700,
  });
  assert(completedFont.font?.family === "Full Stack Sans" && completedFont.font?.url, "Workspace font completion did not persist or sign the font.");
  const workspaceFonts = await api(owner, "/api/platform?scope=workspace-fonts");
  assert(workspaceFonts.fonts?.some((font) => font.id === completedFont.font.id && font.url), "The workspace font registry did not return its signed asset.");
  const invitedWorkspaceMember = await post(owner, "/api/platform", {
    action: "invite-workspace-member", workspaceId, email: collaborator.email, role: "admin",
  });
  assert(invitedWorkspaceMember.added && invitedWorkspaceMember.userId === collaborator.uid, "An existing profile could not be added to the workspace.");
  const transferredWorkspace = await post(owner, "/api/platform", {
    action: "transfer-workspace-ownership", workspaceId, userId: collaborator.uid,
  });
  assert(transferredWorkspace.transferred && transferredWorkspace.ownerId === collaborator.uid, "Workspace ownership did not transfer transactionally.");
  const returnedWorkspace = await post(collaborator, "/api/platform", {
    action: "transfer-workspace-ownership", workspaceId, userId: owner.uid,
  });
  assert(returnedWorkspace.transferred && returnedWorkspace.ownerId === owner.uid, "The new workspace owner could not transfer ownership back.");
  const folder = await post(owner, "/api/product", { action: "create-folder", name: "Full-stack research" });
  assert(folder.folder?.id, "Folder creation did not persist in Supabase.");
  const renamedFolder = await post(owner, "/api/platform", {
    action: "rename-folder", workspaceId, folderId: folder.folder.id, name: "Full-stack product research",
  });
  assert(renamedFolder.folder?.name === "Full-stack product research", "Workspace folder rename did not persist.");
  await post(owner, "/api/product", { action: "move-board", boardId: source.id, folderId: folder.folder.id });
  await post(owner, "/api/product", { action: "favorite-board", boardId: source.id, favorite: true });
  await post(owner, "/api/product", { action: "archive-board", boardId: source.id });
  await post(owner, "/api/product", { action: "trash-board", boardId: source.id });
  await post(owner, "/api/product", { action: "restore-board", boardId: source.id });
  const organized = await api(owner, "/api/product?scope=workspace");
  const organization = organized.organization?.find((entry) => entry.board_id === source.id);
  assert(organization?.favorite === true && organization?.folder_id === folder.folder.id, "Folder/favorite mutations did not survive subsequent organization updates.");
  assert(!organization.archived_at && !organization.trashed_at, "Restore did not clear archive and trash state.");

  const preferences = await post(owner, "/api/platform", {
    action: "update-notification-preferences",
    preferences: { email_enabled: false, browser_enabled: true, digest: "daily", board_comments: "mentions", branch_reviews: true, library_updates: false, access_changes: true },
  });
  assert(preferences.preferences?.browser_enabled === true && preferences.preferences?.digest === "daily", "Notification preferences did not persist through the platform API.");
  const loadedPreferences = await api(owner, "/api/platform?scope=notification-preferences");
  assert(loadedPreferences.preferences?.board_comments === "mentions", "Persisted notification preferences could not be reloaded.");

  const extensionId = `full-stack.${randomUUID().replaceAll("-", "")}`;
  extensionIds.add(extensionId);
  const extension = await post(owner, "/api/platform", {
    action: "publish-extension",
    description: "Disposable full-stack extension",
    manifest: { id: extensionId, name: "Full-stack helper", permissions: ["read-document"], commands: [{ id: "inspect", name: "Inspect", operation: "inspect-selection" }] },
  });
  assert(extension.extension?.id === extensionId, "Extension publishing did not persist its sanitized manifest.");
  const installed = await post(owner, "/api/platform", { action: "install-extension", extensionId, permissions: ["read-document"] });
  assert(installed.installed && installed.permissions?.[0] === "read-document", "Extension installation did not retain its granted permissions.");
  const extensions = await api(owner, "/api/platform?scope=extensions");
  assert(extensions.extensions?.some((item) => item.id === extensionId), "Installed extension was not returned by the catalog.");
  const disabledExtension = await post(owner, "/api/platform", { action: "toggle-extension", extensionId, enabled: false });
  assert(disabledExtension.enabled === false, "Extension disable did not persist.");
  await post(owner, "/api/platform", { action: "uninstall-extension", extensionId });

  const prototypeLink = await post(owner, "/api/platform", {
    action: "create-prototype-link", boardId: source.id, startShapeId: libraryComponent.id, password: "Full-stack prototype", deviceFrame: "desktop",
  });
  assert(prototypeLink.token && prototypeLink.link?.id, "Prototype delivery link was not created.");
  const redeemedPrototype = await jsonRequest(new URL("/api/platform", baseUrl), {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ action: "redeem-prototype", token: prototypeLink.token, password: "Full-stack prototype" }),
  });
  assert(redeemedPrototype.prototype?.document?.nodes?.[libraryComponent.id], "Public prototype delivery did not return the exact Liveblocks document.");
  await post(owner, "/api/platform", { action: "revoke-prototype-link", boardId: source.id, linkId: prototypeLink.link.id });

  const checkpoint = await post(owner, "/api/versions", { action: "checkpoint", boardId: source.id, name: "Full-stack exact version" });
  assert(checkpoint.version?.id, "Version checkpoint did not persist.");
  const sharedVersion = await post(owner, "/api/versions", { action: "share", boardId: source.id, versionId: checkpoint.version.id });
  const redeemedVersion = await jsonRequest(new URL(`/api/versions?versionId=${encodeURIComponent(checkpoint.version.id)}&token=${encodeURIComponent(sharedVersion.token)}`, baseUrl));
  assert(redeemedVersion.version?.document?.nodes?.[seedShape.id], "Exact-version sharing did not return the immutable checkpoint document.");

  const communitySlug = `full-stack-${randomUUID().replaceAll("-", "").slice(0, 16)}`;
  const community = await post(owner, "/api/platform", {
    action: "publish-community", boardId: source.id, slug: communitySlug, description: "Disposable integration publication", tags: ["Integration", "Design"], remixAllowed: true,
  });
  assert(community.publication?.slug === communitySlug, "Community publishing did not normalize and persist the publication.");
  const communityFeed = await api(owner, "/api/platform?scope=community");
  assert(communityFeed.publications?.some((item) => item.slug === communitySlug), "Community publication did not appear in discovery.");
  const remixedCommunity = await post(communityMember, "/api/platform", { action: "remix-community", boardId: source.id });
  const remixBoard = (await api(communityMember, `/api/boards?id=${encodeURIComponent(remixedCommunity.boardId)}`)).board;
  boards.push(remixBoard);
  roomIds.add(remixBoard.roomId);
  const remixDocument = await liveblocks.getStorageDocument(remixBoard.roomId, "json");
  assert(remixDocument.nodes?.[libraryComponent.id], "Community remix did not copy the source Liveblocks document.");

  const template = await post(owner, "/api/product", {
    action: "create-template", boardId: source.id, name: "Full-stack starter",
    description: "Disposable integration template", visibility: "private",
  });
  assert(template.template?.id, "Template creation did not persist.");
  const instantiated = await post(owner, "/api/product", {
    action: "instantiate-template", templateId: template.template.id, name: "Instantiated integration board",
  });
  const instantiatedBoard = (await api(owner, `/api/boards?id=${encodeURIComponent(instantiated.boardId)}`)).board;
  boards.push(instantiatedBoard);
  roomIds.add(instantiatedBoard.roomId);
  const instantiatedDocument = await liveblocks.getStorageDocument(instantiatedBoard.roomId, "json");
  assert(instantiatedDocument.nodes?.[seedShape.id], "Template instantiation did not copy Liveblocks storage.");

  const publication = await post(owner, "/api/product", {
    action: "publish-library", boardId: source.id, name: "Full-stack system",
    description: "Disposable integration library", visibility: "public", versionDescription: "Initial",
  });
  assert(publication.assetCount === 2 && publication.version === 1, "Library publication did not extract the component tree.");
  const libraryDiff = await post(owner, "/api/product", {
    action: "library-diff", boardId: target.id, libraryId: publication.libraryId,
  });
  assert(libraryDiff.diff?.some((entry) => entry.status === "added"), "Library diff did not detect incoming assets.");
  const applied = await post(owner, "/api/product", {
    action: "apply-library", boardId: target.id, libraryId: publication.libraryId,
  });
  assert(applied.applied && applied.version === 1, "Library application did not complete under its document lease.");
  const targetDocument = await liveblocks.getStorageDocument(target.roomId, "json");
  assert(Object.values(targetDocument.nodes ?? {}).some((shape) => shape.libraryId === publication.libraryId), "Applied library assets did not reach Liveblocks storage.");

  const accessRequest = await post(collaborator, "/api/product", {
    action: "request-access", boardId: accessBoard.id, role: "editor", message: "Integration review",
  });
  const pending = await api(owner, `/api/product?scope=access-requests&boardId=${encodeURIComponent(accessBoard.id)}`);
  assert(pending.requests?.some((entry) => entry.id === accessRequest.request.id), "Owner could not load the persisted access request.");
  await post(owner, "/api/product", { action: "resolve-access", requestId: accessRequest.request.id, decision: "approved" });
  const collaboratorAccess = await api(collaborator, `/api/boards?id=${encodeURIComponent(accessBoard.id)}`);
  assert(collaboratorAccess.board?.role === "editor", "Approved access did not create editor membership.");

  const share = await post(owner, "/api/product", {
    action: "create-share-link", boardId: source.id, role: "editor", allowedDomain: "example.com",
  });
  const redeemed = await post(collaborator, "/api/product", { action: "redeem-share-link", token: share.token });
  assert(redeemed.boardId === source.id && redeemed.role === "editor", "Governed share link did not grant its configured role.");
  const links = await api(owner, `/api/product?scope=share-links&boardId=${encodeURIComponent(source.id)}`);
  assert(links.links?.some((entry) => entry.id === share.link.id), "Owner could not list the persisted share link.");
  await post(owner, "/api/product", { action: "revoke-share-link", linkId: share.link.id });

  const openSession = await post(owner, "/api/platform", {
    action: "create-open-session", boardId: source.id, role: "editor", password: "Full-stack guest", expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
  });
  assert(openSession.token && openSession.session?.id, "Temporary guest session creation did not persist.");
  const rejectedGuest = await fetch(new URL("/api/platform", baseUrl), {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ action: "redeem-open-session", token: openSession.token, password: "wrong password" }),
  });
  assert(rejectedGuest.status === 403, "A guest session accepted an incorrect password.");
  const redeemedGuest = await jsonRequest(new URL("/api/platform", baseUrl), {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ action: "redeem-open-session", token: openSession.token, password: "Full-stack guest" }),
  });
  assert(redeemedGuest.session?.boardId === source.id && redeemedGuest.session?.role === "editor", "Guest session redemption did not return its scoped board role.");
  const guestAuthorization = await fetch(new URL("/api/liveblocks-auth", baseUrl), {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ room: source.roomId, openSessionToken: openSession.token, openSessionPassword: "Full-stack guest" }),
  });
  assert(guestAuthorization.ok && (await guestAuthorization.json()).token, "The redeemed guest could not authorize its Liveblocks room.");
  const branchGuestAuthorization = await fetch(new URL("/api/liveblocks-auth", baseUrl), {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ room: "branch:forbidden", openSessionToken: openSession.token, openSessionPassword: "Full-stack guest" }),
  });
  assert(branchGuestAuthorization.status === 403, "A temporary guest session was allowed into a design branch.");
  const activeSessions = await api(owner, `/api/platform?scope=open-sessions&boardId=${encodeURIComponent(source.id)}`);
  assert(activeSessions.sessions?.some((session) => session.id === openSession.session.id && session.use_count === 1), "Guest session usage was not visible to the owner.");
  await post(owner, "/api/platform", { action: "revoke-open-session", boardId: source.id, sessionId: openSession.session.id });
  const revokedGuest = await fetch(new URL("/api/platform", baseUrl), {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ action: "redeem-open-session", token: openSession.token, password: "Full-stack guest" }),
  });
  assert(revokedGuest.status === 404, "A revoked guest session remained redeemable.");

  await post(owner, "/api/telemetry", { kind: "performance", boardId: source.id, metric: "LCP", value: 1250, rating: "needs-improvement", route: "/?board=full-stack", release: "full-stack" });
  const performanceRows = await supabaseRows("performance_events", {
    select: "metric,value,rating,route,release", board_id: `eq.${source.id}`, actor_id: `eq.${owner.uid}`, order: "created_at.desc", limit: "1",
  });
  assert(performanceRows[0]?.metric === "LCP" && performanceRows[0]?.release === "full-stack", "Performance telemetry did not persist in Supabase.");

  const notices = await api(owner, "/api/product?scope=notifications");
  assert(notices.notifications?.some((entry) => entry.kind === "access-request"), "Access request notification was not persisted.");
  await post(owner, "/api/product", { action: "mark-notification" });
  const readNotices = await api(owner, "/api/product?scope=notifications");
  assert(readNotices.notifications?.filter((entry) => entry.kind === "access-request").every((entry) => entry.read_at), "Notification updates did not persist.");

  const accountExport = await api(owner, "/api/platform?scope=account-export");
  assert(accountExport.profile?.uid === owner.uid && accountExport.boards?.some((board) => board.id === source.id), "Account export omitted the authenticated profile or owned boards.");
  const deletion = await post(owner, "/api/platform", { action: "request-account-deletion" });
  assert(deletion.deletion?.scheduled_for, "Account deletion was not scheduled with a recovery window.");
  const cancelledDeletion = await post(owner, "/api/platform", { action: "cancel-account-deletion" });
  assert(cancelledDeletion.cancelled, "Account deletion cancellation did not persist.");

  const createdBranch = await post(owner, "/api/branches", {
    action: "create", boardId: source.id, name: "Full-stack review",
  });
  const branch = createdBranch.branch;
  assert(branch?.id && branch?.room_id, "Branch creation did not return a persisted room.");
  roomIds.add(branch.room_id);
  await replaceDocument(branch.room_id, {
    [libraryComponent.id]: libraryComponent,
    [libraryLabel.id]: libraryLabel,
    [seedShape.id]: { ...seedShape, x1: seedShape.x1 + 20, x2: seedShape.x2 + 20 },
  });
  const diff = await post(owner, "/api/branches", { action: "diff", boardId: source.id, branchId: branch.id });
  assert(diff.diff?.some((entry) => entry.shapeId === seedShape.id && entry.status === "changed"), "Branch diff did not compare real Liveblocks documents.");
  await post(owner, "/api/branches", { action: "review", boardId: source.id, branchId: branch.id, status: "approved", note: "Integration approved" });
  const branchList = await api(owner, `/api/branches?boardId=${encodeURIComponent(source.id)}`);
  assert(branchList.branches?.some((entry) => entry.id === branch.id && entry.branch_reviews?.some((review) => review.status === "approved")), "Branch review did not persist in Supabase.");
  const merged = await post(owner, "/api/branches", { action: "merge", boardId: source.id, branchId: branch.id });
  assert(merged.merged && merged.checkpointId, "Approved branch did not merge with a recovery checkpoint.");

  browser = await chromium.launch({ headless: true });
  const ownerContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const collaboratorContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const ownerPage = await loginAndOpenBoard(ownerContext, owner, source.title);
  const collaboratorPage = await loginAndOpenBoard(collaboratorContext, collaborator, source.title);
  await expect(ownerPage.locator('[aria-label="2 people on this board"]')).toBeVisible({ timeout: 20_000 });
  await expect(collaboratorPage.locator('[aria-label="2 people on this board"]')).toBeVisible({ timeout: 20_000 });
  const [ownerReadyEvent, collaboratorReadyEvent] = await Promise.all([
    waitForAuditEvent(source.id, owner.uid, "collaboration.connection_ready", 45_000),
    waitForAuditEvent(source.id, collaborator.uid, "collaboration.connection_ready", 45_000),
  ]);
  assert(
    [ownerReadyEvent, collaboratorReadyEvent].every((entry) => Number(entry.payload?.attempts) >= 1),
    "Ready telemetry did not include the Liveblocks authentication attempt count.",
  );

  const ownerShape = ownerPage.locator(`[data-shape-id="${seedShape.id}"]`);
  const collaboratorShape = collaboratorPage.locator(`[data-shape-id="${seedShape.id}"]`);
  const ownerStart = await center(ownerShape);
  await ownerPage.mouse.move(ownerStart.x, ownerStart.y);
  await ownerPage.mouse.down();
  await ownerPage.mouse.move(ownerStart.x + 12, ownerStart.y + 8, { steps: 3 });
  await expect(collaboratorShape.locator("span").filter({ hasText: /moving/i })).toBeVisible({ timeout: 10_000 });
  const collaboratorStart = await center(collaboratorShape);
  await collaboratorPage.mouse.move(collaboratorStart.x, collaboratorStart.y);
  await collaboratorPage.mouse.down();
  await collaboratorPage.mouse.move(collaboratorStart.x - 50, collaboratorStart.y + 50, { steps: 4 });
  await expect(collaboratorPage.locator('[role="status"]').filter({ hasText: /is moving this selection/i })).toBeVisible({ timeout: 10_000 });
  await collaboratorPage.mouse.up();
  await ownerPage.mouse.move(ownerStart.x + 80, ownerStart.y + 30, { steps: 8 });
  await ownerPage.mouse.up();

  await expect.poll(async () => {
    const [left, right] = await Promise.all([ownerShape.boundingBox(), collaboratorShape.boundingBox()]);
    return left && right ? Math.max(Math.abs(left.x - right.x), Math.abs(left.y - right.y)) : 999;
  }, { timeout: 20_000 }).toBeLessThan(2);

  const collaboratorShapeCenter = await center(collaboratorShape);
  await collaboratorPage.mouse.click(
    collaboratorShapeCenter.x,
    collaboratorShapeCenter.y,
  );
  const beforeOffline = await collaboratorShape.boundingBox();
  assert(beforeOffline, "The collaborator could not select the shared object before disconnecting.");
  await collaboratorContext.setOffline(true);
  await expect(collaboratorPage.getByText(/^(Reconnecting|Offline)$/).first()).toBeVisible({ timeout: 15_000 });
  await collaboratorPage.keyboard.press("Shift+ArrowRight");
  await expect.poll(async () => (await collaboratorShape.boundingBox())?.x ?? 0).toBeGreaterThan(beforeOffline.x + 8);
  await collaboratorPage.waitForTimeout(6_500);
  await collaboratorContext.setOffline(false);
  await expect(collaboratorPage.getByText("Ready", { exact: true })).toBeVisible({ timeout: 30_000 });
  await expect.poll(async () => {
    const [left, right] = await Promise.all([ownerShape.boundingBox(), collaboratorShape.boundingBox()]);
    return left && right ? Math.abs(left.x - right.x) : 999;
  }, { timeout: 30_000 }).toBeLessThan(2);
  let restoredEvent;
  try {
    restoredEvent = await waitForAuditEvent(source.id, collaborator.uid, "collaboration.connection_restored", 55_000);
  } catch (error) {
    const queuedTelemetry = await collaboratorPage.evaluate(() => localStorage.getItem("kumo:collaboration-telemetry"));
    throw new Error(`Restored collaboration telemetry did not persist. Browser queue: ${queuedTelemetry ?? "empty"}`, { cause: error });
  }
  assert(typeof restoredEvent.payload?.durationMs === "number", "Restored telemetry did not include outage duration.");
  const persisted = await liveblocks.getStorageDocument(source.roomId, "json");
  assert(persisted.nodes?.[seedShape.id]?.x1 > seedShape.x1 + 20, "Offline shape edit did not persist after Liveblocks reconnected.");

  await ownerContext.close();
  await collaboratorContext.close();
  console.log(
    "Full-stack verification passed: real Supabase workspace/folder/font/notification/access/library/template/share/guest-session/branch mutations; "
    + "workspace ownership, extensions, prototype delivery, exact-version sharing, community remix, account portability, performance telemetry; "
    + "real Liveblocks two-user contention, offline edit, reconnect convergence, and persisted resilience telemetry."
  );
} finally {
  await browser?.close().catch(() => undefined);
  for (const roomId of [...roomIds].reverse()) {
    await liveblocks.deleteRoom(roomId).catch(() => undefined);
  }
  for (const account of accounts) {
    const audits = new URL("/rest/v1/audit_events", supabaseUrl);
    audits.searchParams.set("actor_id", `eq.${account.uid}`);
    await fetch(audits, { method: "DELETE", headers: supabaseHeaders }).catch(() => undefined);
  }
  for (const extensionId of extensionIds) {
    const extensions = new URL("/rest/v1/extension_catalog", supabaseUrl);
    extensions.searchParams.set("id", `eq.${extensionId}`);
    await fetch(extensions, { method: "DELETE", headers: supabaseHeaders }).catch(() => undefined);
  }
  if (fontStorageKeys.size) {
    await supabase.storage.from("workspace-fonts").remove([...fontStorageKeys]).catch(() => undefined);
  }
  for (const account of accounts) {
    const profiles = new URL("/rest/v1/profiles", supabaseUrl);
    profiles.searchParams.set("firebase_uid", `eq.${account.uid}`);
    await fetch(profiles, { method: "DELETE", headers: supabaseHeaders }).catch(() => undefined);
  }
  for (const account of accounts) {
    await fetch(identityUrl("delete"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ idToken: account.idToken }),
    }).catch(() => undefined);
  }
}
