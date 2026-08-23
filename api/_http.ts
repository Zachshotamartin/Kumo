import type { VercelRequest, VercelResponse } from "@vercel/node";

export const bearerToken = (request: VercelRequest): string | null => {
  const authorization = request.headers.authorization;
  return authorization?.startsWith("Bearer ") ? authorization.slice(7) : null;
};

export const allowMethods = (
  request: VercelRequest,
  response: VercelResponse,
  methods: string[]
): boolean => {
  if (request.method && methods.includes(request.method)) return true;
  response.setHeader("Allow", methods.join(", "));
  response.status(405).json({ error: "Method not allowed." });
  return false;
};

export const stringQuery = (value: string | string[] | undefined): string =>
  Array.isArray(value) ? value[0] ?? "" : value ?? "";

export const errorMessage = (error: unknown, fallback: string): string =>
  error instanceof Error && error.message ? error.message : fallback;

