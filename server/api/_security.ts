import { createHash, timingSafeEqual } from "node:crypto";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { supabaseAdmin } from "./_supabase.js";

const digest = (value: string) => createHash("sha256").update(value).digest("hex");

export const requestOrigin = (request: VercelRequest) => {
  const configured = process.env.PUBLIC_APP_URL?.trim();
  if (configured) return configured.replace(/\/$/, "");
  const protocol = String(request.headers["x-forwarded-proto"] ?? "https").split(",")[0]!.trim();
  const host = String(request.headers["x-forwarded-host"] ?? request.headers.host ?? "localhost:5175").split(",")[0]!.trim();
  return `${protocol}://${host}`;
};

export const hashSecret = digest;

export const validOpenSessionGuestNonce = (value: string) => /^[a-z0-9_-]{16,80}$/i.test(value);

/**
 * Address-shape check for request-supplied email addresses. Every quantified character class is
 * followed by a delimiter the class itself cannot match, so no input makes the engine backtrack:
 * the test is linear in the length of `value` and safe to run on untrusted request bodies.
 */
const emailAddressPattern = /^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+$/;

/** Longest address the SMTP specification allows, used as a hard bound before any matching. */
export const maximumEmailLength = 254;

export const validEmailAddress = (value: string) =>
  value.length > 0 && value.length <= maximumEmailLength && emailAddressPattern.test(value);

export const openSessionGuestId = (token: string, nonce: string) =>
  `guest:${digest(token).slice(0, 12)}:${digest(nonce).slice(0, 12)}`;

export const verifySecret = (value: string, expectedHash: string) => {
  const actual = Buffer.from(digest(value));
  const expected = Buffer.from(expectedHash);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
};

export const applyApiSecurityHeaders = (response: VercelResponse) => {
  if (typeof response.setHeader !== "function") return;
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("X-Frame-Options", "DENY");
  response.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
};

export const enforceRateLimit = async (
  request: VercelRequest,
  response: VercelResponse,
  scope: string,
  actorId: string,
  limit = 30,
  windowSeconds = 60
) => {
  const forwarded = String(request.headers["x-forwarded-for"] ?? "unknown").split(",")[0]!.trim();
  const keyHash = digest(`${scope}:${actorId}:${forwarded}`);
  const { data, error } = await supabaseAdmin().rpc("consume_kumo_rate_limit", {
    p_key_hash: keyHash,
    p_limit: limit,
    p_window_seconds: windowSeconds,
  });
  if (error) throw error;
  const bucket = Array.isArray(data) ? data[0] : data;
  const remaining = Number(bucket?.remaining ?? 0);
  response.setHeader("X-RateLimit-Limit", String(limit));
  response.setHeader("X-RateLimit-Remaining", String(Math.max(0, remaining)));
  if (bucket?.allowed !== false) return true;
  response.setHeader("Retry-After", String(Math.max(1, Number(bucket?.retry_after_seconds ?? windowSeconds))));
  response.status(429).json({ error: "Too many requests. Please wait and try again." });
  return false;
};
