import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireActor } from "./_auth.js";
import { getBoardAccess, provisionBoard } from "./_boards.js";
import { adminDatabase, privilegedAdminAuth } from "./_firebaseAdmin.js";
import { allowMethods } from "./_http.js";
import { liveblocksAdmin } from "./_liveblocks.js";
import { ensureActorProfile, supabaseAdmin } from "./_supabase.js";

type BoardRole = "owner" | "editor" | "viewer";

const stringValues = (value: unknown): string[] => {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string");
  if (value && typeof value === "object") {
    return Object.values(value).filter((item): item is string => typeof item === "string");
  }
  return [];
};

const shapeNodes = (board: Record<string, unknown>): Record<string, unknown> => {
  const source = board.shapesById && typeof board.shapesById === "object"
    ? board.shapesById as Record<string, unknown>
    : board.shapes;
  const shapes = Array.isArray(source)
    ? source.map((shape, index) => [`legacy-${index}`, shape] as const)
    : source && typeof source === "object"
    ? Object.entries(source)
    : [];
  return Object.fromEntries(
    shapes.flatMap(([sourceId, shape]) => {
      if (!shape || typeof shape !== "object") return [];
      const clean = JSON.parse(JSON.stringify(shape)) as Record<string, unknown>;
      const id = typeof clean.id === "string" && clean.id ? clean.id : sourceId;
      clean.id = id;
      return [[id, clean] as const];
    })
  );
};

const ensureFirebaseProfile = async (uid: string) => {
  try {
    const user = await privilegedAdminAuth().getUser(uid);
    await ensureActorProfile({
      uid,
      email: user.email,
      name: user.displayName,
      picture: user.photoURL,
    });
  } catch {
    await ensureActorProfile({ uid });
  }
};

export default async function handler(request: VercelRequest, response: VercelResponse) {
  if (!allowMethods(request, response, ["POST"])) return;
  try {
    const actor = await requireActor(request);
    await ensureActorProfile(actor);
    const boardId = typeof request.body?.boardId === "string" ? request.body.boardId : "";
    if (!boardId) return response.status(400).json({ error: "Board is required." });

    const existing = await getBoardAccess(boardId, actor.uid);
    if (existing) return response.status(200).json({ migrated: false, boardId });

    const snapshot = await adminDatabase().ref(`boards/${boardId}`).get();
    if (!snapshot.exists()) return response.status(404).json({ error: "Board not found." });
    const board = snapshot.val() as Record<string, unknown>;
    const ownerId = typeof board.ownerId === "string"
      ? board.ownerId
      : typeof board.uid === "string"
      ? board.uid
      : null;
    if (!ownerId) return response.status(409).json({ error: "This board has no valid owner." });

    const existingMembers = board.members && typeof board.members === "object"
      ? board.members as Record<string, string>
      : {};
    const legacyMembers = stringValues(board.sharedWith);
    const isPublic = board.visibility === "public" || board.type === "public";
    const canRead = actor.uid === ownerId || isPublic || actor.uid in existingMembers || legacyMembers.includes(actor.uid);
    if (!canRead) return response.status(403).json({ error: "You do not have access to this board." });

    const members = new Map<string, BoardRole>([[ownerId, "owner"]]);
    Object.entries(existingMembers).forEach(([uid, role]) => {
      if (uid !== ownerId && (role === "editor" || role === "viewer")) members.set(uid, role);
    });
    legacyMembers.forEach((uid) => {
      if (uid !== ownerId && !members.has(uid)) members.set(uid, "editor");
    });

    await Promise.all([...members.keys()].map(ensureFirebaseProfile));
    const created = await provisionBoard({
      id: boardId,
      ownerId,
      title: typeof board.title === "string" ? board.title : "Untitled board",
      visibility: isPublic ? "public" : "private",
      legacyRtdbId: boardId,
      document: {
        schemaVersion: 4,
        backgroundColor: typeof board.backgroundColor === "string"
          ? board.backgroundColor
          : typeof board.backGroundColor === "string"
          ? board.backGroundColor
          : "#252629",
        nodes: shapeNodes(board),
      },
    });

    try {
      const collaborators = [...members.entries()]
        .filter(([uid]) => uid !== ownerId)
        .map(([uid, role]) => ({ board_id: boardId, user_id: uid, role }));
      if (collaborators.length) {
        const { error } = await supabaseAdmin().from("board_members").upsert(collaborators, {
          onConflict: "board_id,user_id",
        });
        if (error) throw error;
      }
    } catch (error) {
      await Promise.allSettled([
        supabaseAdmin().from("boards").delete().eq("id", boardId),
        liveblocksAdmin().deleteRoom(created.liveblocks_room_id),
      ]);
      throw error;
    }
    return response.status(201).json({ migrated: true, boardId: created.id });
  } catch (error) {
    const message = error instanceof Error ? error.message : "This legacy board could not be migrated.";
    return response.status(message === "Authentication required." ? 401 : 400).json({ error: message });
  }
}
