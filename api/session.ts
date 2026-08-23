import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireActor } from "./_auth";
import { allowMethods, errorMessage } from "./_http";
import { ensureActorProfile } from "./_supabase";

export default async function handler(request: VercelRequest, response: VercelResponse) {
  if (!allowMethods(request, response, ["POST"])) return;
  try {
    const actor = await requireActor(request);
    const profile = await ensureActorProfile(actor);
    return response.status(200).json({ profile });
  } catch (error) {
    const message = errorMessage(error, "We couldn't initialize your Kumo account.");
    return response.status(message === "Authentication required." ? 401 : 500).json({ error: message });
  }
}

