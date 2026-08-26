import { auth } from "../config/firebase";

interface ApiErrorBody {
  error?: string;
  [key: string]: unknown;
}

export class ApiError extends Error {
  constructor(message: string, public readonly status: number, public readonly details: ApiErrorBody | null) {
    super(message);
    this.name = "ApiError";
  }
}

export const CLIENT_API_TIMEOUT_MS = 15_000;

let volatileSessionId = "";

export const clientSessionId = () => {
  const key = "kumo:account-session-id";
  try {
    const existing = localStorage.getItem(key);
    if (existing && /^[a-zA-Z0-9-]{16,100}$/.test(existing)) return existing;
  } catch {
    if (volatileSessionId) return volatileSessionId;
  }
  const created = typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2).padEnd(24, "0")}`;
  volatileSessionId = created;
  try {
    localStorage.setItem(key, created);
  } catch {
    // Privacy modes may block localStorage. The in-memory ID still keeps this
    // tab individually revocable for its lifetime.
  }
  return created;
};

const requestWithDeadline = async (input: string, init: RequestInit): Promise<Response> => {
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (init.signal?.aborted) abort();
  else init.signal?.addEventListener("abort", abort, { once: true });
  const timeout = globalThis.setTimeout(abort, CLIENT_API_TIMEOUT_MS);
  try {
    return await globalThis.fetch(input, { ...init, signal: controller.signal });
  } finally {
    globalThis.clearTimeout(timeout);
    init.signal?.removeEventListener("abort", abort);
  }
};

export const authenticatedRequest = async (
  input: string,
  init: RequestInit = {}
): Promise<Response> => {
  const e2eToken = import.meta.env.VITE_E2E && /\/(social|share)-e2e\.html$/.test(window.location.pathname)
    ? "kumo-e2e-token"
    : null;
  const token = e2eToken ?? await auth.currentUser?.getIdToken();
  if (!token) throw new Error("Authentication required.");
  const response = await requestWithDeadline(input, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "X-Kumo-Session-Id": clientSessionId(),
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...init.headers,
    },
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null) as ApiErrorBody | null;
    throw new ApiError(body?.error ?? `Request failed with status ${response.status}.`, response.status, body);
  }
  return response;
};

export const authenticatedFetch = async <T>(
  input: string,
  init: RequestInit = {}
): Promise<T> => {
  const response = await authenticatedRequest(input, init);
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
};

export const publicFetch = async <T>(input: string, init: RequestInit = {}): Promise<T> => {
  const response = await requestWithDeadline(input, {
    ...init,
    headers: { ...(init.body ? { "Content-Type": "application/json" } : {}), ...init.headers },
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null) as ApiErrorBody | null;
    throw new ApiError(body?.error ?? `Request failed with status ${response.status}.`, response.status, body);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
};
