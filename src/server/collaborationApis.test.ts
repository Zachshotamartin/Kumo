import type { VercelRequest, VercelResponse } from "@vercel/node";
import collaboratorsHandler from "../../server/api/handlers/collaborators";
import versionsHandler from "../../server/api/handlers/versions";

const mocks = vi.hoisted(() => ({
  actor: { uid: "owner", email: "owner@example.com" },
  requireActor: vi.fn(),
  getAccess: vi.fn(),
  from: vi.fn(),
  getDocument: vi.fn(),
  deleteDocument: vi.fn(),
  initializeDocument: vi.fn(),
  broadcast: vi.fn(),
  syncLinks: vi.fn(),
  rpc: vi.fn(),
  provisionBoard: vi.fn(),
}));

vi.mock("../../server/api/_auth", () => ({ requireActor: mocks.requireActor }));
vi.mock("../../server/api/_boards", () => ({ getBoardAccess: mocks.getAccess, provisionBoard: mocks.provisionBoard }));
vi.mock("../../server/api/_supabase", () => ({ supabaseAdmin: () => ({ from: mocks.from, rpc: mocks.rpc }) }));
vi.mock("../../server/api/_boardLinks", () => ({ syncBoardLinks: mocks.syncLinks }));
vi.mock("../../server/api/_liveblocks", () => ({
  boardDocumentFromJson: (document: unknown) => ({ normalized: document }),
  liveblocksAdmin: () => ({
    getStorageDocument: mocks.getDocument,
    deleteStorageDocument: mocks.deleteDocument,
    initializeStorageDocument: mocks.initializeDocument,
    broadcastEvent: mocks.broadcast,
  }),
}));

const board = {
  id: "board",
  owner_id: "owner",
  title: "Board",
  visibility: "private",
  liveblocks_room_id: "board:board",
  legacy_rtdb_id: null,
  created_at: new Date(0).toISOString(),
  updated_at: new Date(1).toISOString(),
  deleted_at: null,
};

const response = () => {
  const result = {
    statusCode: 0,
    body: undefined as unknown,
    status(code: number) { this.statusCode = code; return this; },
    json(body: unknown) { this.body = body; return this; },
    setHeader: vi.fn(),
  };
  return result as unknown as VercelResponse & typeof result;
};

const request = (
  method: string,
  body: Record<string, unknown> = {},
  query: Record<string, string> = {}
) => ({ method, body, query, headers: { authorization: "Bearer token" } }) as unknown as VercelRequest;

const queryChain = <T,>(result: T) => {
  const chain = {
    eq: vi.fn(() => chain),
    is: vi.fn(() => chain),
    order: vi.fn(() => chain),
    limit: vi.fn(() => Promise.resolve(result)),
    maybeSingle: vi.fn(() => Promise.resolve(result)),
    single: vi.fn(() => Promise.resolve(result)),
  };
  return chain;
};

const fluentQuery = <T,>(result: T) => {
  const chain: Record<string, unknown> = {};
  for (const method of ["select", "eq", "is", "order", "limit", "in", "insert", "update"] as const) {
    chain[method] = vi.fn(() => chain);
  }
  chain.maybeSingle = vi.fn(async () => result);
  chain.single = vi.fn(async () => result);
  chain.then = (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) => Promise.resolve(result).then(resolve, reject);
  return chain;
};

describe("collaborator and version APIs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireActor.mockResolvedValue(mocks.actor);
    mocks.getAccess.mockResolvedValue({ board, role: "owner" });
    mocks.getDocument.mockResolvedValue({ backgroundColor: "#252629", nodes: { current: { id: "current" } } });
    mocks.deleteDocument.mockResolvedValue(undefined);
    mocks.initializeDocument.mockResolvedValue(undefined);
    mocks.broadcast.mockResolvedValue(undefined);
    mocks.syncLinks.mockResolvedValue(undefined);
    mocks.provisionBoard.mockResolvedValue({ id: "duplicate" });
    mocks.rpc.mockImplementation(async (name: string) => ({
      data: name === "acquire_kumo_document_lease" ? true : null,
      error: null,
    }));
  });

  it("returns named board collaborators with their roles", async () => {
    mocks.from.mockImplementation((table: string) => {
      if (table === "board_members") return {
        select: () => ({ eq: vi.fn().mockResolvedValue({
          data: [{ user_id: "owner", role: "owner" }, { user_id: "editor", role: "editor" }],
          error: null,
        }) }),
      };
      return {
        select: () => ({ in: vi.fn().mockResolvedValue({
          data: [
            { firebase_uid: "editor", email: "editor@example.com", display_name: "Editor", avatar_url: null },
            { firebase_uid: "owner", email: "owner@example.com", display_name: "Owner", avatar_url: "avatar" },
          ],
          error: null,
        }) }),
      };
    });
    const reply = response();
    await collaboratorsHandler(request("GET", {}, { boardId: "board" }), reply);
    expect(reply.statusCode).toBe(200);
    expect(reply.body).toEqual({ collaborators: [
      expect.objectContaining({ id: "editor", role: "editor", name: "Editor" }),
      expect.objectContaining({ id: "owner", role: "owner", avatar: "avatar" }),
    ] });
  });

  it("does not disclose member emails to authenticated public non-members", async () => {
    mocks.requireActor.mockResolvedValueOnce({ uid: "stranger", email: "stranger@example.com" });
    mocks.getAccess.mockResolvedValueOnce({ board: { ...board, visibility: "public" }, role: "viewer" });
    mocks.from.mockImplementation((table: string) => table === "board_members" ? {
      select: () => ({ eq: vi.fn().mockResolvedValue({ data: [{ user_id: "owner", role: "owner" }], error: null }) }),
    } : {
      select: () => ({ in: vi.fn().mockResolvedValue({ data: [{ firebase_uid: "owner", email: "owner@example.com", display_name: "Owner", avatar_url: null }], error: null }) }),
    });
    const reply = response();
    await collaboratorsHandler(request("GET", {}, { boardId: "board" }), reply);
    expect(reply.body).toEqual({ collaborators: [expect.objectContaining({ id: "owner", email: "" })] });
  });

  it("validates collaborator requests and missing board access", async () => {
    const methodReply = response();
    await collaboratorsHandler(request("POST"), methodReply);
    expect(methodReply.statusCode).toBe(405);
    const missingReply = response();
    await collaboratorsHandler(request("GET", {}, { boardId: "  " }), missingReply);
    expect(missingReply.statusCode).toBe(400);
    mocks.getAccess.mockResolvedValueOnce(null);
    const inaccessibleReply = response();
    await collaboratorsHandler(request("GET", {}, { boardId: "board" }), inaccessibleReply);
    expect(inaccessibleReply.statusCode).toBe(404);
  });

  it("handles empty collaborator records and database failures", async () => {
    mocks.from.mockReturnValueOnce({
      select: () => ({ eq: vi.fn().mockResolvedValue({ data: null, error: null }) }),
    });
    const emptyReply = response();
    await collaboratorsHandler(request("GET", {}, { boardId: "board" }), emptyReply);
    expect(emptyReply.body).toEqual({ collaborators: [] });

    mocks.from.mockReturnValueOnce({
      select: () => ({ eq: vi.fn().mockResolvedValue({ data: null, error: new Error("members offline") }) }),
    });
    const memberErrorReply = response();
    await collaboratorsHandler(request("GET", {}, { boardId: "board" }), memberErrorReply);
    expect(memberErrorReply).toMatchObject({ statusCode: 500, body: { error: "members offline" } });

    mocks.from.mockImplementation((table: string) => table === "board_members" ? {
      select: () => ({ eq: vi.fn().mockResolvedValue({ data: [{ user_id: "owner", role: "owner" }], error: null }) }),
    } : {
      select: () => ({ in: vi.fn().mockResolvedValue({ data: null, error: new Error("profiles offline") }) }),
    });
    const profileErrorReply = response();
    await collaboratorsHandler(request("GET", {}, { boardId: "board" }), profileErrorReply);
    expect(profileErrorReply).toMatchObject({ statusCode: 500, body: { error: "profiles offline" } });
  });

  it("defaults missing profile data and maps authentication failures", async () => {
    mocks.from.mockImplementation((table: string) => table === "board_members" ? {
      select: () => ({ eq: vi.fn().mockResolvedValue({ data: [{ user_id: "owner", role: "owner" }], error: null }) }),
    } : {
      select: () => ({ in: vi.fn().mockResolvedValue({ data: [{ firebase_uid: "other", email: "other@example.com", display_name: "Other", avatar_url: null }], error: null }) }),
    });
    const defaultsReply = response();
    await collaboratorsHandler(request("GET", {}, { boardId: "board" }), defaultsReply);
    expect(defaultsReply.body).toEqual({ collaborators: [expect.objectContaining({ id: "other", avatar: "", role: "viewer" })] });

    mocks.from.mockImplementation((table: string) => table === "board_members" ? {
      select: () => ({ eq: vi.fn().mockResolvedValue({ data: [{ user_id: "owner", role: "owner" }], error: null }) }),
    } : {
      select: () => ({ in: vi.fn().mockResolvedValue({ data: null, error: null }) }),
    });
    const emptyProfilesReply = response();
    await collaboratorsHandler(request("GET", {}, { boardId: "board" }), emptyProfilesReply);
    expect(emptyProfilesReply.body).toEqual({ collaborators: [] });

    mocks.requireActor.mockRejectedValueOnce(new Error("Authentication required."));
    const authReply = response();
    await collaboratorsHandler(request("GET", {}, { boardId: "board" }), authReply);
    expect(authReply.statusCode).toBe(401);
    mocks.requireActor.mockRejectedValueOnce("offline");
    const fallbackReply = response();
    await collaboratorsHandler(request("GET", {}, { boardId: "board" }), fallbackReply);
    expect(fallbackReply).toMatchObject({ statusCode: 500, body: { error: "We couldn't load board collaborators." } });
  });

  it("lists versions and resolves creator names", async () => {
    const version = {
      id: "version",
      board_id: "board",
      name: "Ready",
      description: null,
      created_by: "owner",
      kind: "checkpoint",
      created_at: new Date().toISOString(),
      checksum: "sum",
    };
    mocks.from.mockImplementation((table: string) => {
      if (table === "document_snapshots") return {
        select: () => queryChain({ data: [version], error: null }),
      };
      if (table === "profiles") return {
        select: () => ({ in: vi.fn().mockResolvedValue({
          data: [{ firebase_uid: "owner", display_name: "Owner" }], error: null,
        }) }),
      };
      return {};
    });
    const reply = response();
    await versionsHandler(request("GET", {}, { boardId: "board" }), reply);
    expect(reply.body).toEqual({ versions: [expect.objectContaining({ creatorName: "Owner", name: "Ready" })] });
  });

  it("opens a token-scoped historical version without requiring a Kumo account", async () => {
    const snapshot = { id: "version", board_id: "board", name: "Launch", description: null, created_at: new Date().toISOString(), document: { nodes: {} }, share_expires_at: null };
    mocks.from.mockImplementation((table: string) => table === "document_snapshots"
      ? { select: () => queryChain({ data: snapshot, error: null }) }
      : { select: () => queryChain({ data: { title: "Board" }, error: null }) });
    const reply = response();
    await versionsHandler(request("GET", {}, { versionId: "version", token: "secret" }), reply);
    expect(reply.statusCode).toBe(200);
    expect(reply.body).toEqual({ version: expect.objectContaining({ id: "version", boardTitle: "Board", document: { nodes: {} } }) });
    expect(mocks.requireActor).not.toHaveBeenCalled();
    expect(mocks.rpc).toHaveBeenCalledWith("consume_kumo_rate_limit", expect.objectContaining({ p_limit: 30 }));
  });

  it("creates a named checkpoint with the current collaborative document", async () => {
    const inserted = {
      id: "checkpoint",
      board_id: "board",
      name: "Review",
      description: "Milestone",
      created_by: "owner",
      kind: "checkpoint",
      created_at: new Date().toISOString(),
      checksum: "sum",
    };
    mocks.rpc.mockImplementation(async (name: string) => ({
      data: name === "create_kumo_checkpoint" ? inserted : name === "acquire_kumo_document_lease" ? true : null,
      error: null,
    }));
    const reply = response();
    await versionsHandler(request("POST", {
      action: "checkpoint", boardId: "board", name: "Review", description: "Milestone",
    }), reply);
    expect(reply.statusCode).toBe(201);
    expect(mocks.rpc).toHaveBeenCalledWith("create_kumo_checkpoint", expect.objectContaining({
      p_name: "Review",
      p_description: "Milestone",
      p_document: expect.objectContaining({ nodes: expect.any(Object) }),
      p_actor_id: "owner",
    }));
    expect(reply.body).toEqual({ version: inserted });
  });

  it("does not report a checkpoint when its transactional audit write fails", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: new Error("audit insert failed") });
    const reply = response();
    await versionsHandler(request("POST", { action: "checkpoint", boardId: "board", name: "Review" }), reply);
    expect(reply.statusCode).toBe(500);
    expect(reply.body).toEqual({ error: "audit insert failed" });
    expect(mocks.from).not.toHaveBeenCalledWith("document_snapshots");
  });

  it("saves the current state, restores the target, and broadcasts the change", async () => {
    const target = { id: "target", document: { backgroundColor: "#fff", nodes: { restored: { id: "restored" } } } };
    mocks.from.mockImplementation((table: string) => {
      if (table === "document_snapshots") return {
        select: () => queryChain({ data: target, error: null }),
        insert: () => ({ select: () => ({ single: vi.fn().mockResolvedValue({ data: { id: "before" }, error: null }) }) }),
      };
      return { insert: vi.fn().mockResolvedValue({ error: null }) };
    });
    const reply = response();
    await versionsHandler(request("POST", { action: "restore", boardId: "board", versionId: "target" }), reply);
    expect(mocks.deleteDocument).toHaveBeenCalledWith("board:board");
    expect(mocks.initializeDocument).toHaveBeenCalledWith("board:board", { normalized: target.document });
    expect(mocks.syncLinks).toHaveBeenCalledWith("board", target.document);
    expect(mocks.rpc).toHaveBeenCalledWith("acquire_kumo_document_lease", expect.objectContaining({ p_room_id: "board:board" }));
    expect(mocks.rpc).toHaveBeenCalledWith("complete_kumo_version_restore", expect.objectContaining({ p_room_id: "board:board" }));
    expect(mocks.rpc).toHaveBeenCalledWith("release_kumo_document_lease", expect.objectContaining({ p_room_id: "board:board" }));
    expect(mocks.broadcast).toHaveBeenCalledWith("board:board", expect.objectContaining({ type: "DOCUMENT_RESTORED", actorId: "owner", revision: expect.any(Number) }));
    expect(reply.body).toMatchObject({ restored: true, beforeRestoreId: "before" });
  });

  it("selectively restores, inserts, and deletes requested version layers", async () => {
    const target = { id: "target", document: { backgroundColor: "#fff", nodes: { parent: { value: "parent", parentId: null }, keep: { value: "old", parentId: "parent" }, added: { value: "added" } }, textCharacters: { keep: { value: "old text" }, added: { value: "added text" } } } };
    mocks.getDocument.mockResolvedValue({ backgroundColor: "#000", nodes: { keep: { value: "current" }, remove: {}, child: { parentId: "remove" }, retained: {} }, textCharacters: { keep: { value: "current text" }, remove: { value: "removed" }, retained: { value: "retained" } } });
    mocks.from.mockImplementation((table: string) => table === "document_snapshots" ? {
      select: () => queryChain({ data: target, error: null }),
      insert: () => ({ select: () => ({ single: vi.fn().mockResolvedValue({ data: { id: "before" }, error: null }) }) }),
    } : fluentQuery({ error: null }));
    const reply = response();
    await versionsHandler(request("POST", {
      action: "restore-layers", boardId: "board", versionId: "target",
      shapeIds: ["keep", "added", "remove", "keep", "", 4],
    }), reply);
    expect(reply.statusCode).toBe(200);
    expect(mocks.initializeDocument).toHaveBeenCalledWith("board:board", { normalized: {
      backgroundColor: "#000",
      nodes: { keep: { value: "old", parentId: "parent" }, added: { value: "added" }, child: { parentId: null }, retained: {}, parent: { value: "parent", parentId: null } },
      textCharacters: { keep: { value: "old text" }, added: { value: "added text" }, retained: { value: "retained" } },
    } });
    expect(reply.body).toMatchObject({ restoredShapeIds: ["keep", "added", "remove", "parent"] });

    const invalid = response();
    await versionsHandler(request("POST", { action: "restore-layers", boardId: "board", versionId: "target", shapeIds: "keep" }), invalid);
    expect(invalid.statusCode).toBe(400);
  });

  it("selectively restores against malformed legacy documents using empty node maps", async () => {
    const target = { id: "target", document: null };
    mocks.getDocument.mockResolvedValue(null);
    mocks.from.mockImplementation((table: string) => table === "document_snapshots" ? {
      select: () => queryChain({ data: target, error: null }),
      insert: () => ({ select: () => ({ single: vi.fn().mockResolvedValue({ data: { id: "before" }, error: null }) }) }),
    } : fluentQuery({ error: null }));
    const reply = response();
    await versionsHandler(request("POST", { action: "restore-layers", boardId: "board", versionId: "target", shapeIds: ["gone"] }), reply);
    expect(reply.statusCode).toBe(200);
    expect(mocks.initializeDocument).toHaveBeenCalledWith("board:board", { normalized: { nodes: {}, textCharacters: {} } });
  });

  it("isolates branch checkpoints and restores from main-board history", async () => {
    const target = { id: "target", document: { backgroundColor: "#fff", nodes: {} } };
    mocks.from.mockImplementation((table: string) => {
      if (table === "document_branches") return { select: () => queryChain({ data: { room_id: "branch:one", status: "open" }, error: null }) };
      if (table === "document_snapshots") return {
        select: () => queryChain({ data: target, error: null }),
        insert: () => ({ select: () => ({ single: vi.fn().mockResolvedValue({ data: { id: "before" }, error: null }) }) }),
      };
      return { insert: vi.fn().mockResolvedValue({ error: null }) };
    });
    const reply = response();
    await versionsHandler(request("POST", { action: "restore", boardId: "board", branchId: "one", versionId: "target" }), reply);
    expect(mocks.getDocument).toHaveBeenCalledWith("branch:one", "json");
    expect(mocks.deleteDocument).toHaveBeenCalledWith("branch:one");
    expect(mocks.syncLinks).not.toHaveBeenCalled();
    expect(mocks.rpc).toHaveBeenCalledWith("complete_kumo_version_restore", expect.objectContaining({ p_room_id: "branch:one" }));
  });

  it("rolls storage and derived links back when version finalization fails", async () => {
    const current = { backgroundColor: "#000", nodes: { current: {} } };
    const target = { id: "target", document: { backgroundColor: "#fff", nodes: { restored: {} } } };
    mocks.getDocument.mockResolvedValue(current);
    mocks.rpc.mockImplementation(async (name: string) => ({
      data: name === "acquire_kumo_document_lease" ? true : null,
      error: name === "complete_kumo_version_restore" ? new Error("commit failed") : null,
    }));
    mocks.from.mockImplementation((table: string) => table === "document_snapshots" ? {
      select: () => queryChain({ data: target, error: null }),
      insert: () => ({ select: () => ({ single: vi.fn().mockResolvedValue({ data: { id: "before" }, error: null }) }) }),
    } : { insert: vi.fn().mockResolvedValue({ error: null }) });
    const reply = response();
    await versionsHandler(request("POST", { action: "restore", boardId: "board", versionId: "target" }), reply);
    expect(reply.statusCode).toBe(500);
    expect(mocks.initializeDocument).toHaveBeenNthCalledWith(1, "board:board", { normalized: target.document });
    expect(mocks.initializeDocument).toHaveBeenNthCalledWith(2, "board:board", { normalized: current });
    expect(mocks.syncLinks).toHaveBeenLastCalledWith("board", current);
  });

  it("allows viewers to inspect history but not mutate it", async () => {
    mocks.getAccess.mockResolvedValueOnce({ board, role: "viewer" });
    const reply = response();
    await versionsHandler(request("POST", { action: "checkpoint", boardId: "board", name: "No" }), reply);
    expect(reply.statusCode).toBe(403);
  });

  it("validates public version links, expiry, rate limits, and deleted boards", async () => {
    const snapshot = { id: "version", board_id: "board", document: {}, share_expires_at: new Date(Date.now() - 1_000).toISOString() };
    mocks.from.mockImplementation((table: string) => table === "document_snapshots"
      ? { select: () => queryChain({ data: snapshot, error: null }) }
      : { select: () => queryChain({ data: { title: "Board" }, error: null }) });
    const expired = response();
    await versionsHandler(request("GET", {}, { versionId: "version", token: "secret" }), expired);
    expect(expired.statusCode).toBe(404);

    mocks.from.mockImplementation((table: string) => table === "document_snapshots"
      ? { select: () => queryChain({ data: { ...snapshot, share_expires_at: new Date(Date.now() + 60_000).toISOString() }, error: null }) }
      : { select: () => queryChain({ data: null, error: null }) });
    const deleted = response();
    await versionsHandler(request("GET", {}, { versionId: "version", token: "secret" }), deleted);
    expect(deleted.statusCode).toBe(404);

    mocks.rpc.mockImplementation(async (name: string) => name === "consume_kumo_rate_limit"
      ? { data: { allowed: false, remaining: 0, retry_after_seconds: 2 }, error: null }
      : { data: null, error: null });
    const limited = response();
    await versionsHandler(request("GET", {}, { versionId: "version", token: "limited" }), limited);
    expect(limited.statusCode).toBe(429);
  });

  it("returns one version, empty history, and an unavailable branch safely", async () => {
    const version = { id: "version", board_id: "board", document: { nodes: {} } };
    mocks.from.mockImplementation((table: string) => table === "document_snapshots"
      ? { select: () => queryChain({ data: version, error: null }) }
      : {});
    const detail = response();
    await versionsHandler(request("GET", {}, { boardId: "board", versionId: "version" }), detail);
    expect(detail.body).toEqual({ version });

    mocks.from.mockImplementation((table: string) => table === "document_snapshots"
      ? { select: () => queryChain({ data: null, error: null }) }
      : {});
    const missing = response();
    await versionsHandler(request("GET", {}, { boardId: "board", versionId: "missing" }), missing);
    expect(missing.statusCode).toBe(404);

    mocks.from.mockImplementation((table: string) => table === "document_branches"
      ? { select: () => queryChain({ data: { room_id: "branch:closed", status: "merged" }, error: null }) }
      : {});
    const branch = response();
    await versionsHandler(request("GET", {}, { boardId: "board", branchId: "closed" }), branch);
    expect(branch.statusCode).toBe(404);
  });

  it("lists empty history without a profile lookup and preserves unknown creators", async () => {
    mocks.from.mockImplementation((table: string) => table === "document_snapshots"
      ? { select: () => queryChain({ data: [], error: null }) }
      : {});
    const empty = response();
    await versionsHandler(request("GET", {}, { boardId: "board" }), empty);
    expect(empty.body).toEqual({ versions: [] });
    expect(mocks.from).not.toHaveBeenCalledWith("profiles");

    mocks.from.mockImplementation((table: string) => table === "document_snapshots"
      ? { select: () => queryChain({ data: [{ id: "anonymous", created_by: null }], error: null }) }
      : {});
    const anonymous = response();
    await versionsHandler(request("GET", {}, { boardId: "board" }), anonymous);
    expect(anonymous.body).toEqual({ versions: [{ id: "anonymous", created_by: null, creatorName: null }] });
  });

  it("skips recent autosaves and creates a recovery snapshot after the window", async () => {
    mocks.from.mockImplementation((table: string) => table === "document_snapshots"
      ? { select: () => fluentQuery({ data: { id: "recent", checksum: "different", created_at: new Date().toISOString() }, error: null }) }
      : {});
    const skipped = response();
    await versionsHandler(request("POST", { action: "autosave", boardId: "board" }), skipped);
    expect(skipped.body).toEqual({ version: expect.objectContaining({ id: "recent" }), skipped: true });

    let snapshotCalls = 0;
    const created = { id: "autosave", kind: "autosave" };
    mocks.from.mockImplementation((table: string) => {
      if (table !== "document_snapshots") return {};
      snapshotCalls += 1;
      return snapshotCalls === 1
        ? { select: () => fluentQuery({ data: { id: "old", checksum: "different", created_at: new Date(0).toISOString() }, error: null }) }
        : fluentQuery({ data: created, error: null });
    });
    const inserted = response();
    await versionsHandler(request("POST", { action: "autosave", boardId: "board" }), inserted);
    expect(inserted.statusCode).toBe(201);
    expect(inserted.body).toEqual({ version: created, skipped: false });
  });

  it("renames, shares, compares, duplicates, and rejects unknown version actions", async () => {
    const renamed = { id: "version", name: "Named version", description: null };
    mocks.from.mockImplementation((table: string) => table === "document_snapshots"
      ? fluentQuery({ data: renamed, error: null })
      : fluentQuery({ error: null }));
    const rename = response();
    await versionsHandler(request("POST", { action: "rename", boardId: "board", versionId: "version", name: "  ", description: 42 }), rename);
    expect(rename.body).toEqual({ version: renamed });

    const invalidExpiry = response();
    await versionsHandler(request("POST", { action: "share", boardId: "board", versionId: "version", expiresAt: "not-a-date" }), invalidExpiry);
    expect(invalidExpiry.statusCode).toBe(400);
    const shared = response();
    await versionsHandler(request("POST", { action: "share", boardId: "board", versionId: "version", expiresAt: new Date(Date.now() + 60_000).toISOString() }), shared);
    expect(shared.statusCode).toBe(201);
    expect(shared.body).toEqual(expect.objectContaining({ token: expect.any(String), url: expect.stringContaining("versionToken=") }));

    const target = { id: "version", name: null, document: { backgroundColor: "#fff", nodes: { target: {} } } };
    mocks.from.mockImplementation((table: string) => table === "document_snapshots"
      ? { select: () => queryChain({ data: target, error: null }) }
      : { insert: vi.fn().mockResolvedValue({ error: null }) });
    const compared = response();
    await versionsHandler(request("POST", { action: "compare", boardId: "board", versionId: "version" }), compared);
    expect(compared.statusCode).toBe(200);
    expect(compared.body).toHaveProperty("diff");
    const duplicate = response();
    await versionsHandler(request("POST", { action: "duplicate", boardId: "board", versionId: "version" }), duplicate);
    expect(duplicate.body).toEqual({ boardId: "duplicate" });
    expect(mocks.provisionBoard).toHaveBeenCalledWith(expect.objectContaining({ ownerId: "owner", title: "Board copy", document: target.document }));
    const unknown = response();
    await versionsHandler(request("POST", { action: "unknown", boardId: "board", versionId: "version" }), unknown);
    expect(unknown.statusCode).toBe(400);
  });

  it("validates board input, access, editor role, and target version", async () => {
    const missingBoard = response();
    await versionsHandler(request("POST", { action: "checkpoint" }), missingBoard);
    expect(missingBoard.statusCode).toBe(400);
    mocks.getAccess.mockResolvedValueOnce(null);
    const notFound = response();
    await versionsHandler(request("POST", { action: "checkpoint", boardId: "missing" }), notFound);
    expect(notFound.statusCode).toBe(404);
    mocks.getAccess.mockResolvedValueOnce({ board, role: "editor" });
    mocks.rpc.mockImplementation(async (name: string) => ({ data: name === "create_kumo_checkpoint" ? { id: "editor-version" } : null, error: null }));
    const editor = response();
    await versionsHandler(request("POST", { action: "checkpoint", boardId: "board" }), editor);
    expect(editor.statusCode).toBe(201);
    mocks.from.mockImplementation((table: string) => table === "document_snapshots"
      ? { select: () => queryChain({ data: null, error: null }) }
      : {});
    const target = response();
    await versionsHandler(request("POST", { action: "compare", boardId: "board", versionId: "missing" }), target);
    expect(target.statusCode).toBe(404);
  });

  it("preserves successful restore when best-effort broadcast fails and rejects a failed backup", async () => {
    const target = { id: "target", document: { nodes: { restored: {} } } };
    mocks.broadcast.mockRejectedValueOnce(new Error("broadcast unavailable"));
    mocks.from.mockImplementation((table: string) => table === "document_snapshots" ? {
      select: () => queryChain({ data: target, error: null }),
      insert: () => ({ select: () => ({ single: vi.fn().mockResolvedValue({ data: { id: "before" }, error: null }) }) }),
    } : fluentQuery({ error: null }));
    const restored = response();
    await versionsHandler(request("POST", { action: "restore", boardId: "board", versionId: "target" }), restored);
    expect(restored.statusCode).toBe(200);

    mocks.from.mockImplementation((table: string) => table === "document_snapshots" ? {
      select: () => queryChain({ data: target, error: null }),
      insert: () => ({ select: () => ({ single: vi.fn().mockResolvedValue({ data: null, error: new Error("backup failed") }) }) }),
    } : fluentQuery({ error: null }));
    const backup = response();
    await versionsHandler(request("POST", { action: "restore", boardId: "board", versionId: "target" }), backup);
    expect(backup.statusCode).toBe(500);
  });

  it("reports public-link and version-query database failures", async () => {
    const invalidMethod = response();
    await versionsHandler(request("DELETE"), invalidMethod);
    expect(invalidMethod.statusCode).toBe(405);

    mocks.from.mockReturnValueOnce({ select: () => queryChain({ data: null, error: new Error("snapshot failed") }) });
    const snapshotError = response();
    await versionsHandler(request("GET", {}, { versionId: "version", token: "secret" }), snapshotError);
    expect(snapshotError.statusCode).toBe(500);

    mocks.from.mockReturnValueOnce({ select: () => queryChain({ data: null, error: null }) });
    const missingSnapshot = response();
    await versionsHandler(request("GET", {}, { versionId: "version", token: "secret" }), missingSnapshot);
    expect(missingSnapshot.statusCode).toBe(404);

    const publicSnapshot = { id: "version", board_id: "board", document: {}, share_expires_at: null };
    mocks.from.mockImplementationOnce(() => ({ select: () => queryChain({ data: publicSnapshot, error: null }) }))
      .mockImplementationOnce(() => ({ select: () => queryChain({ data: null, error: new Error("board failed") }) }));
    const boardError = response();
    await versionsHandler(request("GET", {}, { versionId: "version", token: "secret" }), boardError);
    expect(boardError.statusCode).toBe(500);

    mocks.from.mockReturnValueOnce({ select: () => queryChain({ data: null, error: new Error("detail failed") }) });
    const detailError = response();
    await versionsHandler(request("GET", {}, { boardId: "board", versionId: "version" }), detailError);
    expect(detailError.statusCode).toBe(500);

    mocks.from.mockReturnValueOnce({ select: () => queryChain({ data: null, error: new Error("history failed") }) });
    const historyError = response();
    await versionsHandler(request("GET", {}, { boardId: "board" }), historyError);
    expect(historyError.statusCode).toBe(500);
  });

  it("handles branch and history profile edge cases", async () => {
    mocks.from.mockReturnValueOnce({ select: () => queryChain({ data: null, error: new Error("branch failed") }) });
    const branchError = response();
    await versionsHandler(request("GET", {}, { boardId: "board", branchId: "branch" }), branchError);
    expect(branchError.statusCode).toBe(500);

    mocks.from.mockReturnValueOnce({ select: () => queryChain({ data: { room_id: 42, status: "open" }, error: null }) });
    const malformedBranch = response();
    await versionsHandler(request("GET", {}, { boardId: "board", branchId: "branch" }), malformedBranch);
    expect(malformedBranch.statusCode).toBe(404);

    const version = { id: "version", created_by: "owner" };
    mocks.from.mockImplementation((table: string) => table === "document_snapshots"
      ? { select: () => queryChain({ data: [version], error: null }) }
      : { select: () => ({ in: vi.fn().mockResolvedValue({ data: null, error: new Error("profiles failed") }) }) });
    const profileError = response();
    await versionsHandler(request("GET", {}, { boardId: "board" }), profileError);
    expect(profileError.statusCode).toBe(500);

    mocks.from.mockImplementation((table: string) => table === "document_snapshots"
      ? { select: () => queryChain({ data: [version], error: null }) }
      : { select: () => ({ in: vi.fn().mockResolvedValue({ data: null, error: null }) }) });
    const missingProfiles = response();
    await versionsHandler(request("GET", {}, { boardId: "board" }), missingProfiles);
    expect(missingProfiles.body).toEqual({ versions: [{ ...version, creatorName: null }] });

    mocks.from.mockReturnValueOnce({ select: () => queryChain({ data: null, error: null }) });
    const nullHistory = response();
    await versionsHandler(request("GET", {}, { boardId: "board" }), nullHistory);
    expect(nullHistory.body).toEqual({ versions: [] });
  });

  it("reports autosave, checkpoint, rename, share, and target write failures", async () => {
    mocks.from.mockReturnValueOnce({ select: () => fluentQuery({ data: null, error: new Error("latest failed") }) });
    const latestError = response();
    await versionsHandler(request("POST", { action: "autosave", boardId: "board" }), latestError);
    expect(latestError.statusCode).toBe(500);

    mocks.from.mockReturnValueOnce({ select: () => fluentQuery({ data: { id: "same", checksum: "9a2f192dead422a49da931094eb4c68fc5f06618207d0768183a76bc74f92cc8", created_at: null }, error: null }) });
    const sameChecksum = response();
    await versionsHandler(request("POST", { action: "autosave", boardId: "board" }), sameChecksum);
    expect(sameChecksum.body).toMatchObject({ skipped: true, version: { id: "same" } });

    let snapshotCalls = 0;
    mocks.from.mockImplementation(() => {
      snapshotCalls += 1;
      return snapshotCalls === 1
        ? { select: () => fluentQuery({ data: null, error: null }) }
        : fluentQuery({ data: null, error: new Error("autosave insert failed") });
    });
    const autosaveInsertError = response();
    await versionsHandler(request("POST", { action: "autosave", boardId: "board" }), autosaveInsertError);
    expect(autosaveInsertError.statusCode).toBe(500);

    mocks.rpc.mockResolvedValueOnce({ data: null, error: null });
    const emptyCheckpoint = response();
    await versionsHandler(request("POST", { action: 42, boardId: "board", name: 42 }), emptyCheckpoint);
    expect(emptyCheckpoint.body).toEqual({ error: "The checkpoint could not be created." });

    mocks.from.mockReturnValueOnce(fluentQuery({ data: null, error: new Error("rename failed") }));
    const renameError = response();
    await versionsHandler(request("POST", { action: "rename", boardId: "board", versionId: 42 }), renameError);
    expect(renameError.statusCode).toBe(500);

    mocks.from.mockReturnValueOnce(fluentQuery({ data: null, error: new Error("share failed") }));
    const shareError = response();
    await versionsHandler(request("POST", { action: "share", boardId: "board", versionId: "version" }), shareError);
    expect(shareError.statusCode).toBe(500);

    mocks.from.mockReturnValueOnce(fluentQuery({ data: null, error: null }));
    const missingShare = response();
    await versionsHandler(request("POST", { action: "share", boardId: "board", versionId: "version", expiresAt: 42 }), missingShare);
    expect(missingShare.statusCode).toBe(404);

    mocks.from.mockReturnValueOnce({ select: () => queryChain({ data: null, error: new Error("target failed") }) });
    const targetError = response();
    await versionsHandler(request("POST", { action: "compare", boardId: "board", versionId: "version" }), targetError);
    expect(targetError.statusCode).toBe(500);
  });

  it("maps authentication and document-conflict failures to their API statuses", async () => {
    mocks.requireActor.mockRejectedValueOnce(new Error("Authentication required."));
    const unauthenticated = response();
    await versionsHandler(request("GET", {}, { boardId: "board" }), unauthenticated);
    expect(unauthenticated.statusCode).toBe(401);

    const conflict = new Error("Document changed concurrently.");
    conflict.name = "DocumentConflict";
    mocks.getAccess.mockRejectedValueOnce(conflict);
    const conflicted = response();
    await versionsHandler(request("GET", {}, { boardId: "board" }), conflicted);
    expect(conflicted.statusCode).toBe(409);
  });
});
