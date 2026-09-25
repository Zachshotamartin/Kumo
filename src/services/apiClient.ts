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

/** Shown when a response isn't Kumo's JSON — a proxy error page, a platform 5xx, or an HTML fallback route. */
export const SERVER_UNREACHABLE_MESSAGE = "Kumo couldn't reach the server. Try again in a moment.";
export const REQUEST_FAILED_MESSAGE = "Kumo couldn't complete that request. Try again.";

const failureMessage = (status: number, body: ApiErrorBody | null) =>
  body?.error ?? (status >= 500 || !body ? SERVER_UNREACHABLE_MESSAGE : REQUEST_FAILED_MESSAGE);

export const errorFromResponse = async (response: Response) => {
  const body = await response.json().catch(() => null) as ApiErrorBody | null;
  return new ApiError(failureMessage(response.status, body), response.status, body);
};

/** Parses a successful response, turning a non-JSON body into a readable error instead of a SyntaxError. */
export const readJson = async <T>(response: Response): Promise<T> => {
  try {
    return await response.json() as T;
  } catch {
    throw new ApiError(SERVER_UNREACHABLE_MESSAGE, response.status, null);
  }
};

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
    : Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) => byte.toString(16).padStart(2, "0")).join("");
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

export const authenticatedIdToken = async () => {
  const e2eToken = import.meta.env.VITE_E2E && /\/(social|share|builder)-e2e\.html$/.test(window.location.pathname)
    ? "kumo-e2e-token"
    : null;
  return e2eToken ?? await auth.currentUser?.getIdToken();
};

export const authenticatedRequest = async (
  input: string,
  init: RequestInit = {}
): Promise<Response> => {
  const token = await authenticatedIdToken();
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
  if (!response.ok) throw await errorFromResponse(response);
  return response;
};

export const authenticatedFetch = async <T>(
  input: string,
  init: RequestInit = {}
): Promise<T> => {
  const response = await authenticatedRequest(input, init);
  if (response.status === 204) return undefined as T;
  return readJson<T>(response);
};

export const publicFetch = async <T>(input: string, init: RequestInit = {}): Promise<T> => {
  const response = await requestWithDeadline(input, {
    ...init,
    headers: { ...(init.body ? { "Content-Type": "application/json" } : {}), ...init.headers },
  });
  if (!response.ok) throw await errorFromResponse(response);
  if (response.status === 204) return undefined as T;
  return readJson<T>(response);
};
