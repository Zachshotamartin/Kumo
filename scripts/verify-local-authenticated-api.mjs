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
        : `HTTP ${response.status}`;
    throw new Error(`${url}: ${message}`);
  }
  return body;
};

let idToken;
let firebaseUid;
let boardId;
let roomId;

try {
  const account = await jsonRequest(identityUrl("signUp"), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      email: `kumo-local-e2e-${randomUUID()}@example.com`,
      password: `Kumo-${randomUUID()}-A1!`,
      returnSecureToken: true,
    }),
  });
  idToken = account.idToken;
  firebaseUid = account.localId;

  const authorization = { authorization: `Bearer ${idToken}` };
  const session = await jsonRequest(new URL("/api/session", baseUrl), {
    method: "POST",
    headers: authorization,
  });
  if (session.profile?.uid !== firebaseUid) {
    throw new Error("The session API returned the wrong authenticated profile.");
  }

  const boards = await jsonRequest(new URL("/api/boards", baseUrl), {
    headers: authorization,
  });
  if (!Array.isArray(boards.boards)) {
    throw new Error("The boards API did not return a board list.");
  }

  const created = await jsonRequest(new URL("/api/boards", baseUrl), {
    method: "POST",
    headers: {
      ...authorization,
      "content-type": "application/json",
    },
    body: JSON.stringify({ title: "Local board creation verification" }),
  });
  boardId = created.board?.id;
  roomId = created.board?.roomId;
  if (!boardId || !roomId || created.board?.role !== "owner") {
    throw new Error("The boards API did not return the newly created owned board.");
  }

  const deleteResponse = await fetch(new URL("/api/boards", baseUrl), {
    method: "DELETE",
    headers: {
      ...authorization,
      "content-type": "application/json",
    },
    body: JSON.stringify({ boardId }),
  });
  if (deleteResponse.status !== 204) {
    const body = await deleteResponse.json().catch(() => ({}));
    throw new Error(`${new URL("/api/boards", baseUrl)}: ${body?.error || `HTTP ${deleteResponse.status}`}`);
  }

  console.log(
    `Authenticated local API verified: session 200, list boards 200 (${boards.boards.length}), create board 201, delete board 204.`
  );
} finally {
  const supabaseHeaders = {
    apikey: supabaseServiceRoleKey,
    authorization: `Bearer ${supabaseServiceRoleKey}`,
  };
  if (roomId) {
    await liveblocks.deleteRoom(roomId).catch(() => undefined);
  }
  if (firebaseUid) {
    const auditUrl = new URL("/rest/v1/audit_events", supabaseUrl);
    auditUrl.searchParams.set("actor_id", `eq.${firebaseUid}`);
    await fetch(auditUrl, { method: "DELETE", headers: supabaseHeaders }).catch(() => undefined);
  }
  if (boardId) {
    const boardUrl = new URL("/rest/v1/boards", supabaseUrl);
    boardUrl.searchParams.set("id", `eq.${boardId}`);
    await fetch(boardUrl, { method: "DELETE", headers: supabaseHeaders }).catch(() => undefined);
  }
  if (firebaseUid) {
    const cleanupUrl = new URL("/rest/v1/profiles", supabaseUrl);
    cleanupUrl.searchParams.set("firebase_uid", `eq.${firebaseUid}`);
    await fetch(cleanupUrl, {
      method: "DELETE",
      headers: supabaseHeaders,
    }).catch(() => undefined);
  }
  if (idToken) {
    await fetch(identityUrl("delete"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ idToken }),
    }).catch(() => undefined);
  }
}
