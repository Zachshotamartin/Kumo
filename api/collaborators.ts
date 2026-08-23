import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireActor } from "./_auth.js";
import { getBoardAccess } from "./_boards.js";
import { allowMethods, errorMessage, stringQuery } from "./_http.js";
import { supabaseAdmin } from "./_supabase.js";

export default async function handler(request: VercelRequest, response: VercelResponse) {
  if (!allowMethods(request, response, ["GET"])) return;
  try {
    const actor = await requireActor(request);
    const boardId = stringQuery(request.query.boardId).trim();
    if (!boardId) return response.status(400).json({ error: "A board is required." });
    const access = await getBoardAccess(boardId, actor.uid);
    if (!access) return response.status(404).json({ error: "Board not found." });

    const database = supabaseAdmin();
    const { data: members, error: memberError } = await database
      .from("board_members")
      .select("user_id, role")
      .eq("board_id", boardId);
    if (memberError) throw memberError;
    const roles = new Map(
      (members ?? []).map((member) => [member.user_id as string, member.role as string])
    );
    if (!roles.size) return response.status(200).json({ collaborators: [] });

    const { data: profiles, error: profileError } = await database
      .from("profiles")
      .select("firebase_uid, email, display_name, avatar_url")
      .in("firebase_uid", [...roles.keys()]);
    if (profileError) throw profileError;
    const collaborators = (profiles ?? [])
      .map((profile) => ({
        id: profile.firebase_uid as string,
        email: profile.email as string,
        name: profile.display_name as string,
        avatar: (profile.avatar_url as string | null) ?? "",
        role: roles.get(profile.firebase_uid as string) ?? "viewer",
      }))
      .sort((left, right) => left.name.localeCompare(right.name));
    return response.status(200).json({ collaborators });
  } catch (error) {
    const message = errorMessage(error, "We couldn't load board collaborators.");
    return response.status(message === "Authentication required." ? 401 : 500).json({ error: message });
  }
}
