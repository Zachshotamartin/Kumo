import type { DecodedIdToken } from "firebase-admin/auth";
import type { VercelRequest } from "@vercel/node";
import { adminAuth } from "./_firebaseAdmin.js";
import { bearerToken } from "./_http.js";

export const requireActor = async (request: VercelRequest): Promise<DecodedIdToken> => {
  const token = bearerToken(request);
  if (!token) throw new Error("Authentication required.");
  return adminAuth().verifyIdToken(token);
};
