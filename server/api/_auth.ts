import type { DecodedIdToken } from "firebase-admin/auth";
import type { VercelRequest } from "@vercel/node";
import { adminAuth } from "./_firebaseAdmin.js";
import { bearerToken } from "./_http.js";
import { supabaseAdmin } from "./_supabase.js";

export const requireActor = async (request: VercelRequest): Promise<DecodedIdToken> => {
  const token = bearerToken(request);
  if (!token) throw new Error("Authentication required.");
  const actor = await adminAuth().verifyIdToken(token);
  // Email-bearing identities are trusted only when Firebase positively asserts
  // verification. Treat a missing claim as unverified instead of failing open.
  if (actor.email && actor.email_verified !== true && !process.env.FIREBASE_AUTH_EMULATOR_HOST) throw new Error("Authentication required.");
  const rawSessionId = request.headers["x-kumo-session-id"];
  const sessionId = (Array.isArray(rawSessionId) ? rawSessionId[0] : rawSessionId)?.trim() ?? "";
  if (!/^[a-zA-Z0-9-]{16,100}$/.test(sessionId)) throw new Error("Authentication required.");
  const database = supabaseAdmin();
  const { data: session, error } = await database.from("account_sessions").select("id, last_seen_at, revoked_at").eq("user_id", actor.uid).eq("id", sessionId).maybeSingle();
  if (error) throw error;
  if (session?.revoked_at) throw new Error("Authentication required.");
  const userAgent = String(request.headers["user-agent"] ?? "").slice(0, 500);
  if (!session) {
    const { error: insertError } = await database.from("account_sessions").insert({ id: sessionId, user_id: actor.uid, user_agent: userAgent });
    // The first /session request creates the profile after authentication. Its
    // session row can therefore encounter the profile FK once; the next
    // request registers it normally. Do not hide any other persistence error.
    if (insertError && (insertError as { code?: string }).code !== "23503") throw insertError;
  } else if (Date.now() - new Date(session.last_seen_at as string).getTime() > 5 * 60_000) {
    const { error: updateError } = await database.from("account_sessions").update({ last_seen_at: new Date().toISOString(), user_agent: userAgent }).eq("user_id", actor.uid).eq("id", sessionId);
    if (updateError) throw updateError;
  }
  return actor;
};
