import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { Liveblocks } from "@liveblocks/node";

const baseUrl = process.argv[2] ?? "http://localhost:5175";

const parseEnv = (source) => Object.fromEntries(
  source
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#") && line.includes("="))
    .map((line) => {
      const separator = line.indexOf("=");
      const key = line.slice(0, separator).trim();
      const rawValue = line.slice(separator + 1).trim();
      const quoted = (rawValue.startsWith('"') && rawValue.endsWith('"'))
        || (rawValue.startsWith("'") && rawValue.endsWith("'"));
      return [key, quoted ? rawValue.slice(1, -1).replace(/\\n/g, "\n") : rawValue];
    })
);

const env = {
  ...parseEnv(await readFile(new URL("../.env.local", import.meta.url), "utf8")),
  ...process.env,
};

const required = (name) => {
  const value = env[name];
  if (!value || /placeholder|sensitive|encrypted|^\[.*\]$/i.test(value)) {
    throw new Error(`${name} must contain a concrete local value.`);
  }
  return value;
};

const firebaseApiKey = env.VITE_FIREBASE_API_KEY || "AIzaSyBA9pnDobxLfEjNYrxS9H2r8CMwFg_C7Zs";
const supabaseUrl = required("SUPABASE_URL");
const supabaseServiceRoleKey = required("SUPABASE_SERVICE_ROLE_KEY");
const liveblocksSecretKey = required("LIVEBLOCKS_SECRET_KEY");
if (!liveblocksSecretKey.startsWith("sk_")) {
  throw new Error("LIVEBLOCKS_SECRET_KEY must be the Liveblocks secret key beginning with sk_.");
}
const liveblocks = new Liveblocks({ secret: liveblocksSecretKey });
const identityUrl = (operation) =>
  `https://identitytoolkit.googleapis.com/v1/accounts:${operation}?key=${encodeURIComponent(firebaseApiKey)}`;

const jsonRequest = async (url, init) => {
  const response = await fetch(url, init);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = typeof body?.error?.message === "string"
      ? body.error.message
      : typeof body?.error === "string"
        ? body.error
        : typeof body?.message === "string"
          ? body.message
        : `HTTP ${response.status}`;
    throw new Error(`${url}: ${message}`);
  }
  return body;
};

const accounts = [];
const createdBoards = [];

const createFirebaseAccount = async (label) => {
  const email = `kumo-local-${label}-${randomUUID()}@example.com`;
  const account = await jsonRequest(identityUrl("signUp"), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      email,
      password: `Kumo-${randomUUID()}-A1!`,
      returnSecureToken: true,
    }),
  });
  const result = { email, idToken: account.idToken, firebaseUid: account.localId, sessionId: randomUUID() };
  accounts.push(result);
  return result;
};

const authorizationFor = (account) => ({
  authorization: `Bearer ${account.idToken}`,
  "x-kumo-session-id": account.sessionId,
});

const createBoard = async (authorization, title) => {
  const created = await jsonRequest(new URL("/api/boards", baseUrl), {
    method: "POST",
    headers: {
      ...authorization,
      "content-type": "application/json",
    },
    body: JSON.stringify({ title }),
  });
  if (!created.board?.id || !created.board?.roomId || created.board?.role !== "owner") {
    throw new Error("The boards API did not return the newly created owned board.");
  }
  createdBoards.push({ id: created.board.id, roomId: created.board.roomId });
  return created.board;
};

try {
  const owner = await createFirebaseAccount("owner");
  const collaborator = await createFirebaseAccount("collaborator");
  const authorization = authorizationFor(owner);
  const collaboratorAuthorization = authorizationFor(collaborator);
  const session = await jsonRequest(new URL("/api/session", baseUrl), {
    method: "POST",
    headers: authorization,
  });
  if (session.profile?.uid !== owner.firebaseUid) {
    throw new Error("The session API returned the wrong authenticated profile.");
  }
  await jsonRequest(new URL("/api/session", baseUrl), {
    method: "POST",
    headers: collaboratorAuthorization,
  });
  const username = `local-${randomUUID().replaceAll("-", "").slice(0, 16)}`;
  const updatedProfile = await jsonRequest(new URL("/api/profile", baseUrl), {
    method: "PATCH",
    headers: { ...authorization, "content-type": "application/json" },
    body: JSON.stringify({
      displayName: "Local profile verification",
      username,
      bio: "Temporary authenticated API verification profile.",
      discoverable: true,
      friendRequestPolicy: "everyone",
    }),
  });
  if (updatedProfile.profile?.username !== username || updatedProfile.profile?.displayName !== "Local profile verification") {
    throw new Error("The profile API did not persist editable identity fields.");
  }

  await jsonRequest(new URL("/api/friends", baseUrl), {
    method: "POST",
    headers: { ...authorization, "content-type": "application/json" },
    body: JSON.stringify({ action: "request", targetUid: collaborator.firebaseUid }),
  });
  const incoming = await jsonRequest(new URL("/api/friends", baseUrl), {
    headers: collaboratorAuthorization,
  });
  if (!incoming.incoming?.some((profile) => profile.id === owner.firebaseUid)) {
    throw new Error("The friend request did not appear for the receiving profile.");
  }
  await jsonRequest(new URL("/api/friends", baseUrl), {
    method: "POST",
    headers: { ...collaboratorAuthorization, "content-type": "application/json" },
    body: JSON.stringify({ action: "accept", targetUid: owner.firebaseUid }),
  });
  const accepted = await jsonRequest(new URL("/api/friends", baseUrl), { headers: authorization });
  if (!accepted.friends?.some((profile) => profile.id === collaborator.firebaseUid)) {
    throw new Error("The accepted friendship did not appear for both profiles.");
  }

  const boards = await jsonRequest(new URL("/api/boards", baseUrl), {
    headers: authorization,
  });
  if (!Array.isArray(boards.boards)) {
    throw new Error("The boards API did not return a board list.");
  }

  const sourceBoard = await createBoard(authorization, "Local linked-share source");
  const targetBoard = await createBoard(authorization, "Local linked-share target");
  await jsonRequest(new URL("/rest/v1/board_links", supabaseUrl), {
    method: "POST",
    headers: {
      apikey: supabaseServiceRoleKey,
      authorization: `Bearer ${supabaseServiceRoleKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      source_board_id: sourceBoard.id,
      target_board_id: targetBoard.id,
      shape_id: "local-linked-share-test",
    }),
  });

  const sharePlan = await jsonRequest(
    new URL(`/api/share-board?boardId=${encodeURIComponent(sourceBoard.id)}`, baseUrl),
    { headers: authorization }
  );
  if (sharePlan.plan?.boards?.length !== 2) {
    throw new Error("The linked-board share plan did not include both owned boards.");
  }

  const shared = await jsonRequest(new URL("/api/share-board", baseUrl), {
    method: "POST",
    headers: { ...authorization, "content-type": "application/json" },
    body: JSON.stringify({
      boardId: sourceBoard.id,
      action: "invite",
      friendUid: collaborator.firebaseUid,
      role: "editor",
      includeLinkedBoards: true,
    }),
  });
  if (shared.sharedBoards?.length !== 2 || shared.unavailableBoards?.length !== 0) {
    throw new Error("The linked-board invite did not grant the complete owned graph.");
  }
  const collaboratorBoards = await jsonRequest(new URL("/api/boards", baseUrl), {
    headers: collaboratorAuthorization,
  });
  if (collaboratorBoards.boards?.length !== 2) {
    throw new Error("The collaborator could not list both newly shared boards.");
  }

  await jsonRequest(new URL("/api/friends", baseUrl), {
    method: "POST",
    headers: { ...authorization, "content-type": "application/json" },
    body: JSON.stringify({ action: "remove", targetUid: collaborator.firebaseUid }),
  });
  const boardsAfterUnfriend = await jsonRequest(new URL("/api/boards", baseUrl), {
    headers: collaboratorAuthorization,
  });
  if (boardsAfterUnfriend.boards?.length !== 2) {
    throw new Error("Removing a friendship incorrectly revoked explicit board access.");
  }

  await jsonRequest(new URL("/api/share-board", baseUrl), {
    method: "POST",
    headers: { ...authorization, "content-type": "application/json" },
    body: JSON.stringify({
      boardId: sourceBoard.id,
      action: "remove",
      memberUid: collaborator.firebaseUid,
      includeLinkedBoards: true,
    }),
  });
  const boardsAfterRevoke = await jsonRequest(new URL("/api/boards", baseUrl), {
    headers: collaboratorAuthorization,
  });
  if (boardsAfterRevoke.boards?.length !== 0) {
    throw new Error("Linked-board revoke left stale collaborator access.");
  }

  for (const board of [...createdBoards].reverse()) {
    const deleteResponse = await fetch(new URL("/api/boards", baseUrl), {
      method: "DELETE",
      headers: { ...authorization, "content-type": "application/json" },
      body: JSON.stringify({ boardId: board.id }),
    });
    if (deleteResponse.status !== 204) {
      const body = await deleteResponse.json().catch(() => ({}));
      throw new Error(`${new URL("/api/boards", baseUrl)}: ${body?.error || `HTTP ${deleteResponse.status}`}`);
    }
  }

  console.log(
    `Authenticated local API verified: session 200, list boards 200 (${boards.boards.length}), `
      + "profile update 200, friend request/accept 200, friend-based two-board share 200, "
      + "friendship-independent access verified, two-board revoke 200, delete boards 204."
  );
} finally {
  const supabaseHeaders = {
    apikey: supabaseServiceRoleKey,
    authorization: `Bearer ${supabaseServiceRoleKey}`,
  };
  for (const { roomId } of createdBoards) {
    await liveblocks.deleteRoom(roomId).catch(() => undefined);
  }
  for (const { firebaseUid } of accounts) {
    const auditUrl = new URL("/rest/v1/audit_events", supabaseUrl);
    auditUrl.searchParams.set("actor_id", `eq.${firebaseUid}`);
    await fetch(auditUrl, { method: "DELETE", headers: supabaseHeaders }).catch(() => undefined);
  }
  for (const { id } of createdBoards) {
    const boardUrl = new URL("/rest/v1/boards", supabaseUrl);
    boardUrl.searchParams.set("id", `eq.${id}`);
    await fetch(boardUrl, { method: "DELETE", headers: supabaseHeaders }).catch(() => undefined);
  }
  for (const { firebaseUid } of accounts) {
    const cleanupUrl = new URL("/rest/v1/profiles", supabaseUrl);
    cleanupUrl.searchParams.set("firebase_uid", `eq.${firebaseUid}`);
    await fetch(cleanupUrl, {
      method: "DELETE",
      headers: supabaseHeaders,
    }).catch(() => undefined);
  }
  for (const { idToken } of accounts) {
    await fetch(identityUrl("delete"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ idToken }),
    }).catch(() => undefined);
  }
}
