import type { VercelRequest, VercelResponse } from "@vercel/node";
import { adminAuth, adminDatabase } from "./_firebaseAdmin";

const values = (value: unknown): string[] => {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string");
  if (value && typeof value === "object") {
    return Object.values(value).filter((item): item is string => typeof item === "string");
  }
  return [];
};

const bearerToken = (request: VercelRequest): string | null => {
  const authorization = request.headers.authorization;
  return authorization?.startsWith("Bearer ") ? authorization.slice(7) : null;
};

export default async function handler(request: VercelRequest, response: VercelResponse) {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    return response.status(405).json({ error: "Method not allowed." });
  }

  const token = bearerToken(request);
  if (!token) return response.status(401).json({ error: "Authentication required." });

  try {
    const actor = await adminAuth.verifyIdToken(token);
    const boardId = typeof request.body?.boardId === "string" ? request.body.boardId : "";
    if (!boardId) return response.status(400).json({ error: "Board is required." });

    const snapshot = await adminDatabase.ref(`boards/${boardId}`).get();
    if (!snapshot.exists()) return response.status(404).json({ error: "Board not found." });
    const board = snapshot.val() as Record<string, unknown>;
    const ownerId = typeof board.ownerId === "string"
      ? board.ownerId
      : typeof board.uid === "string"
      ? board.uid
      : null;
    if (!ownerId) return response.status(409).json({ error: "This board has no valid owner." });

    const existingMembers = board.members && typeof board.members === "object"
      ? { ...(board.members as Record<string, string>) }
      : {};
    const legacyMembers = values(board.sharedWith);
    const isPublic = board.visibility === "public" || board.type === "public";
    const canRead = actor.uid === ownerId || isPublic || actor.uid in existingMembers || legacyMembers.includes(actor.uid);
    if (!canRead) return response.status(403).json({ error: "You do not have access to this board." });

    const members: Record<string, "owner" | "editor" | "viewer"> = { [ownerId]: "owner" };
    Object.entries(existingMembers).forEach(([uid, role]) => {
      if (uid !== ownerId && (role === "editor" || role === "viewer")) members[uid] = role;
    });
    legacyMembers.forEach((uid) => {
      if (uid !== ownerId && !members[uid]) members[uid] = "editor";
    });

    const visibility = isPublic ? "public" : "private";
    const title = (typeof board.title === "string" ? board.title : "Untitled board").slice(0, 120);
    const summary = { id: boardId, title, ownerId, visibility, updatedAt: Date.now() };
    const updates: Record<string, unknown> = {
      [`boards/${boardId}/schemaVersion`]: 2,
      [`boards/${boardId}/id`]: boardId,
      [`boards/${boardId}/ownerId`]: ownerId,
      [`boards/${boardId}/title`]: title,
      [`boards/${boardId}/visibility`]: visibility,
      [`boards/${boardId}/backgroundColor`]:
        typeof board.backgroundColor === "string"
          ? board.backgroundColor
          : typeof board.backGroundColor === "string"
          ? board.backGroundColor
          : "#252629",
      [`boards/${boardId}/members`]: members,
    };
    Object.keys(members).forEach((uid) => {
      updates[`userBoards/${uid}/${boardId}`] = summary;
    });
    updates[`publicBoards/${boardId}`] = isPublic ? summary : null;
    await adminDatabase.ref().update(updates);
    return response.status(200).json({ migrated: true });
  } catch {
    return response.status(400).json({ error: "This legacy board could not be migrated." });
  }
}
