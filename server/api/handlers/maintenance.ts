import { timingSafeEqual } from "node:crypto";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { allowMethods } from "../_http.js";
import { runLifecycleMaintenance } from "../_lifecycle.js";

export const validCronAuthorization = (authorization: string | string[] | undefined, secret = process.env.CRON_SECRET) => {
  if (!secret?.trim() || typeof authorization !== "string") return false;
  const expected = Buffer.from(`Bearer ${secret.trim()}`);
  const received = Buffer.from(authorization);
  return expected.length === received.length && timingSafeEqual(expected, received);
};

export default async function handler(request: VercelRequest, response: VercelResponse) {
  if (!allowMethods(request, response, ["GET", "POST"])) return;
  if (!validCronAuthorization(request.headers.authorization)) {
    return response.status(401).json({ error: "Maintenance authorization is required." });
  }
  try {
    return response.status(200).json(await runLifecycleMaintenance());
  } catch (error) {
    console.error("Lifecycle maintenance failed", error);
    return response.status(500).json({ error: "Lifecycle maintenance could not complete." });
  }
}
