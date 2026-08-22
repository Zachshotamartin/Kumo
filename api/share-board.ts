import type { VercelRequest, VercelResponse } from "@vercel/node";
import { adminAuth, adminDatabase } from "./_firebaseAdmin";

type BoardRole = "editor" | "viewer";

interface ShareRequest {
  boardId?: string;
  action?: "invite" | "remove";
  email?: string;
  memberUid?: string;
  role?: BoardRole;
}

const getBearerToken = (request: VercelRequest): string | null => {
  const authorization = request.headers.authorization;
  return authorization?.startsWith("Bearer ") ? authorization.slice(7) : null;
};

export default async function handler(request: VercelRequest, response: VercelResponse) {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    return response.status(405).json({ error: "Method not allowed." });
  }

  const token = getBearerToken(request);
  if (!token) return response.status(401).json({ error: "Authentication required." });

  try {
    const actor = await adminAuth.verifyIdToken(token);
    const body = (request.body ?? {}) as ShareRequest;
    if (!body.boardId || !body.action) {
      return response.status(400).json({ error: "Board and action are required." });
    }

    const boardRef = adminDatabase.ref(`boards/${body.boardId}`);
    const boardSnapshot = await boardRef.get();
    if (!boardSnapshot.exists()) return response.status(404).json({ error: "Board not found." });
    const board = boardSnapshot.val() as Record<string, unknown>;
    const ownerId = (board.ownerId ?? board.uid) as string | undefined;
    if (!ownerId || ownerId !== actor.uid) {
      return response.status(403).json({ error: "Only the board owner can manage access." });
    }

    if (body.action === "invite") {
      const email = body.email?.trim().toLowerCase();
      if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
        return response.status(400).json({ error: "Enter a valid email address." });
      }
      const invited = await adminAuth.getUserByEmail(email);
      if (invited.uid === actor.uid) {
        return response.status(400).json({ error: "You already own this board." });
      }
      const role: BoardRole = body.role === "viewer" ? "viewer" : "editor";
      const visibility = board.visibility === "public" || board.type === "public" ? "public" : "private";
      const summary = {
        id: body.boardId,
        title: typeof board.title === "string" ? board.title : "Untitled board",
        ownerId,
        visibility,
        updatedAt: Date.now(),
      };
      await adminDatabase.ref().update({
        [`boards/${body.boardId}/members/${invited.uid}`]: role,
        [`userBoards/${invited.uid}/${body.boardId}`]: summary,
      });
      return response.status(200).json({ uid: invited.uid, email, role });
    }

    if (!body.memberUid || body.memberUid === actor.uid) {
      return response.status(400).json({ error: "Select a collaborator to remove." });
    }
    await adminDatabase.ref().update({
      [`boards/${body.boardId}/members/${body.memberUid}`]: null,
      [`userBoards/${body.memberUid}/${body.boardId}`]: null,
      [`presence/${body.boardId}/${body.memberUid}`]: null,
    });
    return response.status(200).json({ uid: body.memberUid });
  } catch (error) {
    const message = error instanceof Error && error.message.includes("user-not-found")
      ? "No Kumo account uses that email."
      : "We couldn't update board access.";
    return response.status(400).json({ error: message });
  }
}
