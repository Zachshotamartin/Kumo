import type { VercelRequest, VercelResponse } from "@vercel/node";
import liveblocksAuthHandler from "../../server/api/handlers/liveblocks-auth";
import sessionHandler from "../../server/api/handlers/session";
import shareBoardHandler from "../../server/api/handlers/share-board";

const mocks = vi.hoisted(() => ({
  actor: { uid: "owner", email: "owner@example.com" } as { uid: string; email?: string },
  requireActor: vi.fn(),
  ensureProfile: vi.fn(),
  getAccess: vi.fn(),
  invitedProfile: { firebase_uid: "member", email: "member@example.com" } as null | {
    firebase_uid: string;
    email: string;
  },
  allow: vi.fn(),
  authorize: vi.fn(),
  from: vi.fn(),
  rpc: vi.fn(),
  sharePlan: vi.fn(),
  membershipBoardIds: vi.fn(),
  friendshipBetween: vi.fn(),
  sendInvitationEmail: vi.fn(),
  boardInvitation: null as null | Record<string, unknown>,
  boardInvitations: [] as Array<Record<string, unknown>> | null,
  prepareSession: vi.fn(),
  openSession: null as null | Record<string, unknown>,
  openSessionError: null as Error | null,
  branchResult: { data: { board_id: "board", status: "open" }, error: null } as { data: Record<string, unknown> | null; error: Error | null },
}));

vi.mock("../../server/api/_auth", () => ({ requireActor: mocks.requireActor }));
vi.mock("../../server/api/_supabase", () => ({
  ensureActorProfile: mocks.ensureProfile,
  supabaseAdmin: () => ({ from: mocks.from, rpc: mocks.rpc }),
}));
vi.mock("../../server/api/_boards", () => ({ getBoardAccess: mocks.getAccess }));
vi.mock("../../server/api/_boardSharing", () => ({
  linkedBoardSharePlan: mocks.sharePlan,
  membershipBoardIds: mocks.membershipBoardIds,
}));
vi.mock("../../server/api/_profiles", () => ({ friendshipBetween: mocks.friendshipBetween }));
vi.mock("../../server/api/_email", () => ({ sendInvitationEmail: mocks.sendInvitationEmail }));
vi.mock("../../server/api/_liveblocks", () => ({
  liveblocksAdmin: () => ({
    prepareSession: mocks.prepareSession,
  }),
}));

const response = () => {
  const result = {
    statusCode: 0,
    body: undefined as unknown,
    headers: {} as Record<string, string>,
    status(code: number) { this.statusCode = code; return this; },
    json(body: unknown) { this.body = body; return this; },
    send(body: unknown) { this.body = body; return this; },
    setHeader(name: string, value: string) { this.headers[name] = value; return this; },
  };
  return result as unknown as VercelResponse & typeof result;
};

const request = (body: Record<string, unknown>, method = "POST") => ({
  method, body, query: {}, headers: { authorization: "Bearer token" },
} as unknown as VercelRequest);

const fluentQuery = (result: { data?: unknown; error?: unknown } = { error: null }) => {
  const query: Record<string, unknown> = {};
  for (const method of ["select", "eq", "ilike", "is", "neq", "update", "delete"] as const) {
    query[method] = vi.fn(() => query);
  }
  query.order = vi.fn(async () => result);
  query.maybeSingle = vi.fn(async () => result);
  query.single = vi.fn(async () => result);
  query.insert = vi.fn(async () => result);
  query.then = (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) => Promise.resolve(result).then(resolve, reject);
  return query;
};

const board = {
  id: "board", liveblocks_room_id: "board:board", owner_id: "owner",
  title: "Board", visibility: "private", updated_at: new Date().toISOString(),
};

describe("sharing, session, and Liveblocks API handlers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.actor.uid = "owner";
    mocks.actor.email = "owner@example.com";
    mocks.requireActor.mockResolvedValue(mocks.actor);
    mocks.ensureProfile.mockImplementation(async (actor: { uid: string; email?: string }) => ({
      uid: actor.uid, email: actor.email ?? "local@example.com", displayName: "Kumo user", avatarUrl: null,
    }));
    mocks.getAccess.mockResolvedValue({ board, role: "owner" });
    mocks.invitedProfile = { firebase_uid: "member", email: "member@example.com" };
    mocks.authorize.mockResolvedValue({ status: 200, body: "authorized" });
    mocks.prepareSession.mockReturnValue({ allow: mocks.allow, authorize: mocks.authorize });
    mocks.openSession = null;
    mocks.openSessionError = null;
    mocks.branchResult = { data: { board_id: "board", status: "open" }, error: null };
    mocks.boardInvitation = null;
    mocks.boardInvitations = [];
    mocks.sendInvitationEmail.mockResolvedValue("link-only");
    mocks.rpc.mockResolvedValue({ error: null });
    mocks.sharePlan.mockResolvedValue({
      truncated: false,
      boards: [
        { id: "board", title: "Board", visibility: "private", depth: 0, ownerId: "owner", manageable: true },
        { id: "linked", title: "Linked", visibility: "private", depth: 1, ownerId: "owner", manageable: true },
      ],
    });
    mocks.membershipBoardIds.mockResolvedValue(new Set(["board", "linked"]));
    mocks.friendshipBetween.mockResolvedValue({ status: "accepted" });
    mocks.from.mockImplementation((table: string) => {
      if (table === "profiles") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: vi.fn().mockImplementation(async () => ({
                data: mocks.invitedProfile,
                error: null,
              })),
            }),
            ilike: () => ({
              maybeSingle: vi.fn().mockImplementation(async () => ({
                data: mocks.invitedProfile,
                error: null,
              })),
            }),
          }),
        };
      }
      if (table === "board_members") {
        return fluentQuery({ error: null });
      }
      if (table === "document_branches") {
        return {
          select: () => ({ eq: () => ({ maybeSingle: vi.fn().mockImplementation(async () => mocks.branchResult) }) }),
        };
      }
      if (table === "board_open_sessions") {
        return {
          select: () => ({ eq: () => ({ maybeSingle: vi.fn().mockImplementation(async () => ({ data: mocks.openSession, error: mocks.openSessionError })) }) }),
        };
      }
      if (table === "board_invitations") {
        const query = fluentQuery({ data: mocks.boardInvitation, error: null });
        query.order = vi.fn(async () => ({ data: mocks.boardInvitations, error: null }));
        return query;
      }
      return fluentQuery({ error: null });
    });
  });

  it("shares directly with accepted friends and rejects unaccepted profile IDs", async () => {
    const invited = response();
    await shareBoardHandler(request({
      boardId: "board", action: "invite", friendUid: "member", role: "editor",
    }), invited);
    expect(mocks.friendshipBetween).toHaveBeenCalledWith("owner", "member");
    expect(invited.statusCode).toBe(200);
    expect(invited.body).toEqual(expect.objectContaining({ uid: "member", role: "editor" }));

    mocks.friendshipBetween.mockResolvedValueOnce(null);
    const denied = response();
    await shareBoardHandler(request({
      boardId: "board", action: "invite", friendUid: "stranger", role: "viewer",
    }), denied);
    expect(denied.statusCode).toBe(403);
    expect(denied.body).toEqual({ error: expect.stringContaining("accepted friends") });
  });

  it("does not let email invitations bypass either person's block", async () => {
    mocks.friendshipBetween.mockResolvedValueOnce({ status: "blocked" });
    const denied = response();
    await shareBoardHandler(request({
      boardId: "board", action: "invite", email: "member@example.com", role: "viewer",
    }), denied);
    expect(denied.statusCode).toBe(403);
    expect(denied.body).toEqual({ error: "This profile cannot be invited." });
    expect(mocks.rpc).not.toHaveBeenCalledWith("share_kumo_board_set", expect.anything());
  });

  it("invites and removes board collaborators", async () => {
    const invited = response();
    await shareBoardHandler(request({
      boardId: "board", action: "invite", email: " MEMBER@example.com ", role: "viewer",
    }), invited);
    expect(invited.body).toEqual(expect.objectContaining({
      uid: "member", email: "member@example.com", role: "viewer",
      sharedBoards: expect.arrayContaining([expect.objectContaining({ id: "board" }), expect.objectContaining({ id: "linked" })]),
      unavailableBoards: [],
    }));
    expect(mocks.rpc).toHaveBeenCalledWith("share_kumo_board_set", expect.objectContaining({
      p_board_ids: ["board", "linked"], p_user_id: "member", p_role: "viewer",
    }));

    const removed = response();
    await shareBoardHandler(request({ boardId: "board", action: "remove", memberUid: "member" }), removed);
    expect(removed.body).toEqual(expect.objectContaining({ uid: "member", removedBoards: expect.any(Array) }));
    expect(mocks.rpc).toHaveBeenCalledWith("remove_kumo_board_member_set", expect.objectContaining({
      p_board_ids: ["board", "linked"], p_user_id: "member",
    }));
  });

  it("previews the linked-board graph and reports destinations another owner must share", async () => {
    const external = { id: "external", title: "External", visibility: "private", depth: 1, ownerId: "other", manageable: false };
    mocks.sharePlan.mockResolvedValueOnce({
      truncated: false,
      boards: [
        { id: "board", title: "Board", visibility: "private", depth: 0, ownerId: "owner", manageable: true },
        external,
      ],
    });
    const preview = response();
    await shareBoardHandler({
      method: "GET", body: {}, query: { boardId: "board" }, headers: { authorization: "Bearer token" },
    } as unknown as VercelRequest, preview);
    expect(preview.body).toEqual(expect.objectContaining({ plan: expect.objectContaining({ boards: expect.arrayContaining([external]) }), invitations: [] }));

    mocks.sharePlan.mockResolvedValueOnce({
      truncated: false,
      boards: [
        { id: "board", title: "Board", visibility: "private", depth: 0, ownerId: "owner", manageable: true },
        external,
      ],
    });
    mocks.membershipBoardIds.mockResolvedValueOnce(new Set(["board"]));
    const invited = response();
    await shareBoardHandler(request({
      boardId: "board", action: "invite", email: "member@example.com", includeLinkedBoards: true,
    }), invited);
    expect(invited.body).toEqual(expect.objectContaining({ unavailableBoards: [external] }));
  });

  it("validates sharing input and ownership", async () => {
    const incomplete = response();
    await shareBoardHandler(request({}), incomplete);
    expect(incomplete.statusCode).toBe(400);
    mocks.getAccess.mockResolvedValueOnce({ board, role: "editor" });
    const forbidden = response();
    await shareBoardHandler(request({ boardId: "board", action: "invite", email: "a@b.com" }), forbidden);
    expect(forbidden.statusCode).toBe(403);
    const invalid = response();
    await shareBoardHandler(request({ boardId: "board", action: "invite", email: "invalid" }), invalid);
    expect(invalid.statusCode).toBe(400);
    mocks.invitedProfile = null;
    const missing = response();
    await shareBoardHandler(request({ boardId: "board", action: "invite", email: "none@example.com" }), missing);
    expect(missing.statusCode).toBe(202);
    expect(missing.body).toEqual(expect.objectContaining({ pending: true, url: expect.stringContaining("invite=") }));
  });

  it("refuses a partial connected-board share when the bounded graph is truncated", async () => {
    mocks.sharePlan.mockResolvedValue({
      truncated: true,
      boards: [
        { id: "board", title: "Board", visibility: "private", depth: 0, ownerId: "owner", manageable: true },
      ],
    });
    const linked = response();
    await shareBoardHandler(request({
      boardId: "board", action: "invite", email: "member@example.com", includeLinkedBoards: true,
    }), linked);
    expect(linked.statusCode).toBe(409);
    expect(linked.body).toEqual({ error: expect.stringContaining("safe sharing limit") });
    expect(mocks.rpc).not.toHaveBeenCalledWith("share_kumo_board_set", expect.anything());

    const direct = response();
    await shareBoardHandler(request({
      boardId: "board", action: "invite", email: "member@example.com", includeLinkedBoards: false,
    }), direct);
    expect(direct.statusCode).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith("share_kumo_board_set", expect.objectContaining({
      p_board_ids: ["board"],
    }));
  });

  it("accepts invitations and extends access only to manageable linked boards", async () => {
    mocks.boardInvitation = { id: "invitation", board_id: "board", invited_by: "owner", include_linked_boards: true };
    mocks.rpc.mockReset().mockImplementation(async (name: string) => ({ data: name === "accept_kumo_board_invitation" ? "board" : null, error: null }));
    const accepted = response();
    await shareBoardHandler(request({ action: "accept-invitation", token: " invite-token " }), accepted);
    expect(accepted.statusCode).toBe(200);
    expect(accepted.body).toEqual({ accepted: true, boardId: "board" });
    expect(mocks.rpc).toHaveBeenCalledWith("accept_kumo_board_invitation", expect.objectContaining({ p_actor_id: "owner", p_actor_email: "owner@example.com" }));
    expect(mocks.rpc).toHaveBeenCalledWith("share_kumo_board_set", expect.objectContaining({ p_board_ids: ["board", "linked"], p_user_id: "owner", p_role: "owner" }));

    const missingToken = response();
    await shareBoardHandler(request({ action: "accept-invitation", token: "  " }), missingToken);
    expect(missingToken.statusCode).toBe(400);
    mocks.boardInvitation = null;
    const unavailable = response();
    await shareBoardHandler(request({ action: "accept-invitation", token: "gone" }), unavailable);
    expect(unavailable.statusCode).toBe(404);
  });

  it("does not expand an accepted invitation when linked sharing is disabled or unnecessary", async () => {
    mocks.boardInvitation = { id: "invitation", board_id: "board", invited_by: "owner", include_linked_boards: false };
    mocks.rpc.mockReset().mockImplementation(async (name: string) => ({ data: name === "accept_kumo_board_invitation" ? "board" : null, error: null }));
    const direct = response();
    await shareBoardHandler(request({ action: "accept-invitation", token: "direct" }), direct);
    expect(direct.statusCode).toBe(200);
    expect(mocks.sharePlan).not.toHaveBeenCalled();

    vi.clearAllMocks();
    mocks.requireActor.mockResolvedValue(mocks.actor);
    mocks.ensureProfile.mockResolvedValue({ email: "owner@example.com", displayName: "Owner" });
    mocks.boardInvitation = { id: "invitation", board_id: "board", invited_by: "owner", include_linked_boards: true };
    mocks.rpc.mockReset().mockImplementation(async (name: string) => ({ data: name === "accept_kumo_board_invitation" ? "board" : null, error: null }));
    mocks.sharePlan.mockResolvedValue({ truncated: false, boards: [{ id: "board", manageable: true }] });
    mocks.getAccess.mockResolvedValue(null);
    const noExpansion = response();
    await shareBoardHandler(request({ action: "accept-invitation", token: "single" }), noExpansion);
    expect(noExpansion.statusCode).toBe(200);
    expect(mocks.rpc).not.toHaveBeenCalledWith("share_kumo_board_set", expect.anything());
  });

  it("lets non-owners leave but requires owners to transfer first", async () => {
    mocks.getAccess.mockResolvedValueOnce({ board, role: "editor" });
    const left = response();
    await shareBoardHandler(request({ boardId: "board", action: "leave" }), left);
    expect(left.body).toEqual({ left: true });
    expect(mocks.from).toHaveBeenCalledWith("audit_events");

    const owner = response();
    await shareBoardHandler(request({ boardId: "board", action: "leave" }), owner);
    expect(owner.statusCode).toBe(409);
  });

  it("cancels, resends, and transfers pending access safely", async () => {
    const cancelled = response();
    await shareBoardHandler(request({ boardId: "board", action: "cancel-invitation", invitationId: "invitation" }), cancelled);
    expect(cancelled.body).toEqual({ cancelled: true });

    mocks.boardInvitation = { id: "invitation", email: "new@example.com" };
    const resent = response();
    await shareBoardHandler(request({ boardId: "board", action: "resend-invitation", invitationId: "invitation" }), resent);
    expect(resent.body).toEqual(expect.objectContaining({ resent: true, url: expect.stringContaining("invite="), delivery: "link-only" }));
    expect(mocks.sendInvitationEmail).toHaveBeenCalledWith(expect.objectContaining({ to: "new@example.com", resourceName: "Board", kind: "board" }));

    mocks.boardInvitation = null;
    const missing = response();
    await shareBoardHandler(request({ boardId: "board", action: "resend-invitation", invitationId: "missing" }), missing);
    expect(missing.statusCode).toBe(404);

    const self = response();
    await shareBoardHandler(request({ boardId: "board", action: "transfer-owner", memberUid: "owner" }), self);
    expect(self.statusCode).toBe(400);
    const transferred = response();
    await shareBoardHandler(request({ boardId: "board", action: "transfer-owner", memberUid: "member" }), transferred);
    expect(transferred.body).toEqual({ transferred: true, newOwnerId: "member" });
    expect(mocks.rpc).toHaveBeenCalledWith("transfer_kumo_board_ownership", expect.objectContaining({ p_new_owner_id: "member" }));
  });

  it("updates direct roles and rejects invalid collaborator actions", async () => {
    const updated = response();
    await shareBoardHandler(request({ boardId: "board", action: "update-role", memberUid: "member", role: "viewer", includeLinkedBoards: false }), updated);
    expect(updated.body).toEqual(expect.objectContaining({ uid: "member", role: "viewer", updatedBoards: [expect.objectContaining({ id: "board" })] }));
    const self = response();
    await shareBoardHandler(request({ boardId: "board", action: "remove", memberUid: "owner" }), self);
    expect(self.statusCode).toBe(400);
    const unknown = response();
    await shareBoardHandler(request({ boardId: "board", action: "cancel-invitation", memberUid: "member" }), unknown);
    expect(unknown.statusCode).toBe(200);
    const unsupported = response();
    await shareBoardHandler(request({ boardId: "board", action: "resend-invitation", memberUid: "member" }), unsupported);
    expect(unsupported.statusCode).toBe(404);
  });

  it("rejects missing boards, self-invites, and missing friend profiles", async () => {
    mocks.getAccess.mockResolvedValueOnce(null);
    const missingBoard = response();
    await shareBoardHandler(request({ boardId: "missing", action: "invite", email: "a@b.com" }), missingBoard);
    expect(missingBoard.statusCode).toBe(404);

    mocks.invitedProfile = { firebase_uid: "owner", email: "owner@example.com" };
    const self = response();
    await shareBoardHandler(request({ boardId: "board", action: "invite", email: "owner@example.com" }), self);
    expect(self.statusCode).toBe(400);

    mocks.invitedProfile = null;
    const missingFriend = response();
    await shareBoardHandler(request({ boardId: "board", action: "invite", friendUid: "member" }), missingFriend);
    expect(missingFriend.statusCode).toBe(400);
  });

  it("rejects unsupported methods, missing actions, unknown actions, and rate-limit abuse", async () => {
    const method = response();
    await shareBoardHandler(request({}, "PUT"), method);
    expect(method.statusCode).toBe(405);

    const action = response();
    await shareBoardHandler(request({ boardId: "board" }), action);
    expect(action.statusCode).toBe(400);

    const unknown = response();
    await shareBoardHandler(request({ boardId: "board", action: "unknown", memberUid: "member" }), unknown);
    expect(unknown.body).toEqual({ error: "Unknown sharing action." });

    mocks.rpc.mockImplementation(async (name: string) => name === "consume_kumo_rate_limit"
      ? { data: { allowed: false, remaining: 0, retry_after_seconds: 5 }, error: null }
      : { data: null, error: null });
    const limited = response();
    await shareBoardHandler(request({ boardId: "board", action: "cancel-invitation", invitationId: "limited" }), limited);
    expect(limited.statusCode).toBe(429);
  });

  it("maps authentication, unavailable resources, and unexpected failures to safe errors", async () => {
    mocks.requireActor.mockRejectedValueOnce(new Error("Authentication required."));
    const auth = response();
    await shareBoardHandler(request({ boardId: "board", action: "remove", memberUid: "member" }), auth);
    expect(auth.statusCode).toBe(401);

    mocks.ensureProfile.mockRejectedValueOnce(new Error("Invitation unavailable."));
    const unavailable = response();
    await shareBoardHandler(request({ boardId: "board", action: "remove", memberUid: "member" }), unavailable);
    expect(unavailable.statusCode).toBe(404);

    mocks.ensureProfile.mockRejectedValueOnce("private failure");
    const fallback = response();
    await shareBoardHandler(request({ boardId: "board", action: "remove", memberUid: "member" }), fallback);
    expect(fallback.statusCode).toBe(400);
    expect(fallback.body).toEqual({ error: "We couldn't update board access." });
  });

  it("does not hide invitation and membership storage failures", async () => {
    const originalFrom = mocks.from.getMockImplementation()!;
    const failTable = (tableName: string, error: Error) => {
      mocks.from.mockImplementation((table: string) => table === tableName ? fluentQuery({ data: null, error }) : originalFrom(table));
    };

    mocks.boardInvitation = { id: "invitation", board_id: "board", invited_by: "owner", include_linked_boards: false };
    failTable("board_invitations", new Error("invitation lookup failed"));
    const acceptLookup = response();
    await shareBoardHandler(request({ action: "accept-invitation", token: "token" }), acceptLookup);
    expect(acceptLookup.statusCode).toBe(400);

    mocks.from.mockImplementation(originalFrom);
    mocks.getAccess.mockResolvedValueOnce({ board, role: "editor" });
    failTable("board_members", new Error("member delete failed"));
    const leave = response();
    await shareBoardHandler(request({ boardId: "board", action: "leave" }), leave);
    expect(leave.statusCode).toBe(400);

    mocks.from.mockImplementation(originalFrom);
    failTable("board_invitations", new Error("invitations unavailable"));
    const list = response();
    await shareBoardHandler({ ...request({}, "GET"), query: { boardId: "board" } } as unknown as VercelRequest, list);
    expect(list.statusCode).toBe(404);

    for (const actionName of ["cancel-invitation", "resend-invitation"] as const) {
      mocks.from.mockImplementation(originalFrom);
      failTable("board_invitations", new Error(`${actionName} failed`));
      const reply = response();
      await shareBoardHandler(request({ boardId: "board", action: actionName, invitationId: "invitation" }), reply);
      expect(reply.statusCode).toBe(400);
    }
  });

  it("propagates every transactional sharing failure without partial success", async () => {
    const rpcFailure = async (action: string, body: Record<string, unknown>, rpcName: string, setup?: () => void) => {
      setup?.();
      mocks.rpc.mockImplementation(async (name: string) => name === rpcName ? { data: null, error: new Error(`${rpcName} failed`) } : { data: "board", error: null });
      const reply = response();
      await shareBoardHandler(request({ boardId: "board", action, ...body }), reply);
      expect(reply.statusCode).toBe(400);
    };

    mocks.boardInvitation = { id: "invitation", board_id: "board", invited_by: "owner", include_linked_boards: false };
    await rpcFailure("accept-invitation", { token: "token" }, "accept_kumo_board_invitation");
    await rpcFailure("transfer-owner", { memberUid: "member" }, "transfer_kumo_board_ownership");
    mocks.invitedProfile = null;
    await rpcFailure("invite", { email: "new@example.com" }, "create_or_refresh_kumo_board_invitation");
    mocks.invitedProfile = { firebase_uid: "member", email: "member@example.com" };
    await rpcFailure("invite", { email: "member@example.com" }, "share_kumo_board_set");
    await rpcFailure("update-role", { memberUid: "member" }, "share_kumo_board_set");
    await rpcFailure("remove", { memberUid: "member" }, "remove_kumo_board_member_set");
  });

  it("uses the persisted profile email and handles linked-share failure on acceptance", async () => {
    mocks.actor.email = undefined;
    mocks.ensureProfile.mockResolvedValue({ email: "profile@example.com", displayName: "Profile" });
    mocks.boardInvitation = { id: "invitation", board_id: "board", invited_by: "owner", include_linked_boards: false };
    mocks.rpc.mockImplementation(async (name: string, input: Record<string, unknown>) => ({
      data: name === "accept_kumo_board_invitation" ? (input.p_actor_email === "profile@example.com" ? "board" : null) : null,
      error: null,
    }));
    const fallback = response();
    await shareBoardHandler(request({ action: "accept-invitation", token: "fallback" }), fallback);
    expect(fallback.body).toEqual({ accepted: true, boardId: "board" });

    mocks.actor.email = "owner@example.com";
    mocks.boardInvitation = { ...mocks.boardInvitation, include_linked_boards: true };
    mocks.rpc.mockImplementation(async (name: string) => name === "accept_kumo_board_invitation"
      ? { data: "board", error: null }
      : name === "share_kumo_board_set"
        ? { data: null, error: new Error("linked share failed") }
        : { data: null, error: null });
    const linkedFailure = response();
    await shareBoardHandler(request({ action: "accept-invitation", token: "linked" }), linkedFailure);
    expect(linkedFailure.statusCode).toBe(400);
  });

  it("normalizes nullable invitation lists and reports resend-update and profile lookup errors", async () => {
    mocks.boardInvitations = null;
    const empty = response();
    await shareBoardHandler({ ...request({}, "GET"), query: { boardId: "board" } } as unknown as VercelRequest, empty);
    expect(empty.body).toEqual(expect.objectContaining({ invitations: [] }));

    const originalFrom = mocks.from.getMockImplementation()!;
    let invitationCalls = 0;
    mocks.from.mockImplementation((table: string) => {
      if (table !== "board_invitations") return originalFrom(table);
      invitationCalls += 1;
      return invitationCalls === 1
        ? fluentQuery({ data: { id: "invitation", email: "new@example.com" }, error: null })
        : fluentQuery({ data: null, error: new Error("update failed") });
    });
    const resend = response();
    await shareBoardHandler(request({ boardId: "board", action: "resend-invitation", invitationId: "invitation" }), resend);
    expect(resend.statusCode).toBe(400);

    mocks.from.mockImplementation((table: string) => table === "profiles"
      ? fluentQuery({ data: null, error: new Error("profile lookup failed") })
      : originalFrom(table));
    const profile = response();
    await shareBoardHandler(request({ boardId: "board", action: "invite", email: "member@example.com" }), profile);
    expect(profile.statusCode).toBe(400);
  });

  it("handles absent request bodies and rate-limits invitation acceptance before token lookup", async () => {
    const absentBody = response();
    await shareBoardHandler({ ...request({}), body: undefined } as VercelRequest, absentBody);
    expect(absentBody.statusCode).toBe(400);

    const absentToken = response();
    await shareBoardHandler(request({ action: "accept-invitation" }), absentToken);
    expect(absentToken.statusCode).toBe(400);

    mocks.rpc.mockImplementation(async (name: string) => name === "consume_kumo_rate_limit"
      ? { data: { allowed: false, remaining: 0, retry_after_seconds: 5 }, error: null }
      : { data: null, error: null });
    const limited = response();
    await shareBoardHandler(request({ action: "accept-invitation", token: "token" }), limited);
    expect(limited.statusCode).toBe(429);
    expect(mocks.from).not.toHaveBeenCalledWith("board_invitations");
  });

  it("initializes the authenticated Supabase profile", async () => {
    const reply = response();
    await sessionHandler(request({}), reply);
    expect(reply.statusCode).toBe(200);
    expect(reply.body).toMatchObject({ profile: { uid: "owner" } });
    mocks.requireActor.mockRejectedValueOnce(new Error("Authentication required."));
    const denied = response();
    await sessionHandler(request({}), denied);
    expect(denied.statusCode).toBe(401);

    mocks.ensureProfile.mockRejectedValueOnce(new Error("database unavailable"));
    const failed = response();
    await sessionHandler(request({}), failed);
    expect(failed.statusCode).toBe(500);
    expect(failed.body).toEqual({ error: "database unavailable" });

    const unsupported = response();
    await sessionHandler(request({}, "GET"), unsupported);
    expect(unsupported.statusCode).toBe(405);
  });

  it("authorizes editor and viewer Liveblocks sessions", async () => {
    const editor = response();
    await liveblocksAuthHandler(request({ room: "board:board" }), editor);
    expect(mocks.allow).toHaveBeenCalledWith("board:board", ["*:write"]);
    expect(editor.body).toBe("authorized");

    mocks.getAccess.mockResolvedValueOnce({ board, role: "viewer" });
    const viewer = response();
    await liveblocksAuthHandler(request({ room: "board:board" }), viewer);
    expect(mocks.allow).toHaveBeenLastCalledWith("board:board", ["*:read", "room:presence:write", "comments:write"]);
    const invalid = response();
    await liveblocksAuthHandler(request({ room: "invalid" }), invalid);
    expect(invalid.statusCode).toBe(400);
  });

  it("authorizes an open isolated design branch through its parent board", async () => {
    const reply = response();
    await liveblocksAuthHandler(request({ room: "branch:branch-id" }), reply);
    expect(mocks.getAccess).toHaveBeenCalledWith("board", "owner");
    expect(mocks.allow).toHaveBeenCalledWith("branch:branch-id", ["*:write"]);
    expect(reply.statusCode).toBe(200);
  });

  it("authorizes anonymous viewer and editor sessions without Firebase", async () => {
    const future = new Date(Date.now() + 60_000).toISOString();
    mocks.openSession = { id: "session", board_id: "board", password_hash: null, role: "viewer", expires_at: future, revoked_at: null, boards: { liveblocks_room_id: "board:board" } };
    mocks.requireActor.mockClear();
    const viewer = response();
    await liveblocksAuthHandler(request({ room: "board:board", openSessionToken: "guest-token", openSessionPassword: "", openSessionGuestNonce: "0123456789abcdef" }), viewer);
    expect(mocks.requireActor).not.toHaveBeenCalled();
    expect(mocks.prepareSession).toHaveBeenCalledWith(expect.stringMatching(/^guest:/), expect.objectContaining({ userInfo: expect.objectContaining({ name: "Kumo guest" }) }));
    expect(mocks.allow).toHaveBeenCalledWith("board:board", ["*:read", "room:presence:write"]);

    mocks.openSession = { ...mocks.openSession, role: "editor" };
    const editor = response();
    await liveblocksAuthHandler(request({ room: "board:board", openSessionToken: "guest-token", openSessionPassword: "", openSessionGuestNonce: "fedcba9876543210" }), editor);
    expect(mocks.allow).toHaveBeenLastCalledWith("board:board", ["*:write"]);
    expect(mocks.prepareSession.mock.calls[0]?.[0]).not.toBe(mocks.prepareSession.mock.calls[1]?.[0]);
  });

  it("isolates anonymous sessions from branches, other rooms, and expired grants", async () => {
    mocks.openSession = { id: "session", board_id: "board", password_hash: null, role: "viewer", expires_at: new Date(Date.now() + 60_000).toISOString(), revoked_at: null, boards: { liveblocks_room_id: "board:board" } };
    const branch = response(); await liveblocksAuthHandler(request({ room: "branch:branch-id", openSessionToken: "guest-token", openSessionGuestNonce: "0123456789abcdef" }), branch);
    expect(branch.statusCode).toBe(403);
    const other = response(); await liveblocksAuthHandler(request({ room: "board:other", openSessionToken: "guest-token", openSessionGuestNonce: "0123456789abcdef" }), other);
    expect(other.statusCode).toBe(403);
    mocks.openSession = { ...mocks.openSession, expires_at: new Date(Date.now() - 60_000).toISOString() };
    const expired = response(); await liveblocksAuthHandler(request({ room: "board:board", openSessionToken: "guest-token", openSessionGuestNonce: "0123456789abcdef" }), expired);
    expect(expired.statusCode).toBe(403);
  });

  it("validates Liveblocks methods, bodies, branch state, and board-room identity", async () => {
    const method = response(); await liveblocksAuthHandler(request({}, "GET"), method); expect(method.statusCode).toBe(405);
    const body = response(); await liveblocksAuthHandler({ ...request({}), body: undefined } as VercelRequest, body); expect(body.statusCode).toBe(400);
    const nonString = response(); await liveblocksAuthHandler(request({ room: 3 }), nonString); expect(nonString.statusCode).toBe(400);

    mocks.branchResult = { data: null, error: null };
    const missingBranch = response(); await liveblocksAuthHandler(request({ room: "branch:missing" }), missingBranch); expect(missingBranch.statusCode).toBe(403);
    mocks.branchResult = { data: { board_id: "board", status: "merged" }, error: null };
    const closedBranch = response(); await liveblocksAuthHandler(request({ room: "branch:closed" }), closedBranch); expect(closedBranch.statusCode).toBe(403);
    mocks.branchResult = { data: null, error: new Error("branch offline") };
    const failedBranch = response(); await liveblocksAuthHandler(request({ room: "branch:failed" }), failedBranch); expect(failedBranch.statusCode).toBe(500);

    mocks.getAccess.mockResolvedValueOnce(null);
    const denied = response(); await liveblocksAuthHandler(request({ room: "board:board" }), denied); expect(denied.statusCode).toBe(403);
    mocks.getAccess.mockResolvedValueOnce({ board: { ...board, liveblocks_room_id: "board:other" }, role: "owner" });
    const mismatch = response(); await liveblocksAuthHandler(request({ room: "board:board" }), mismatch); expect(mismatch.statusCode).toBe(403);
  });

  it("validates open-session lookup, password, nonce, and related-board encodings", async () => {
    const future = new Date(Date.now() + 60_000).toISOString();
    const baseSession = { id: "session", board_id: "board", password_hash: null, role: "viewer", expires_at: future, revoked_at: null, boards: { liveblocks_room_id: "board:board" } };
    const missing = response(); await liveblocksAuthHandler(request({ room: "board:board", openSessionToken: "guest" }), missing); expect(missing.statusCode).toBe(403);
    mocks.openSession = { ...baseSession, revoked_at: "now" };
    const revoked = response(); await liveblocksAuthHandler(request({ room: "board:board", openSessionToken: "guest" }), revoked); expect(revoked.statusCode).toBe(403);
    mocks.openSessionError = new Error("sessions offline");
    const lookup = response(); await liveblocksAuthHandler(request({ room: "board:board", openSessionToken: "guest" }), lookup); expect(lookup.statusCode).toBe(500);
    mocks.openSessionError = null;
    mocks.openSession = { ...baseSession, password_hash: "broken", boards: [{ liveblocks_room_id: "board:board" }] };
    const password = response(); await liveblocksAuthHandler(request({ room: "board:board", openSessionToken: "guest", openSessionPassword: 3 }), password); expect(password.statusCode).toBe(403);
    mocks.openSession = { ...baseSession, boards: [{ liveblocks_room_id: "board:board" }] };
    const nonceType = response(); await liveblocksAuthHandler(request({ room: "board:board", openSessionToken: "guest", openSessionGuestNonce: 3 }), nonceType); expect(nonceType.statusCode).toBe(400);
    const nonceValue = response(); await liveblocksAuthHandler(request({ room: "board:board", openSessionToken: "guest", openSessionGuestNonce: "short" }), nonceValue); expect(nonceValue.statusCode).toBe(400);
    const arrayBoard = response(); await liveblocksAuthHandler(request({ room: "board:board", openSessionToken: " guest ", openSessionGuestNonce: "0123456789abcdef" }), arrayBoard); expect(arrayBoard.statusCode).toBe(200);
  });

  it("uses profile avatars and maps authentication and generic authorization failures", async () => {
    mocks.ensureProfile.mockResolvedValueOnce({ uid: "owner", email: "owner@example.com", displayName: "Owner", avatarUrl: "https://avatar" });
    const avatar = response(); await liveblocksAuthHandler(request({ room: "board:board", openSessionToken: 4 }), avatar); expect(avatar.statusCode).toBe(200);
    expect(mocks.prepareSession).toHaveBeenLastCalledWith("owner", expect.objectContaining({ userInfo: expect.objectContaining({ avatar: "https://avatar" }) }));
    mocks.requireActor.mockRejectedValueOnce(new Error("Authentication required."));
    const auth = response(); await liveblocksAuthHandler(request({ room: "board:board" }), auth); expect(auth.statusCode).toBe(401);
    mocks.ensureProfile.mockRejectedValueOnce("offline");
    const generic = response(); await liveblocksAuthHandler(request({ room: "board:board" }), generic); expect(generic.statusCode).toBe(500);
  });
});
