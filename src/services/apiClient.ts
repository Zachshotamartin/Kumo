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

export const authenticatedRequest = async (
  input: string,
  init: RequestInit = {}
): Promise<Response> => {
  const e2eToken = import.meta.env.VITE_E2E && /\/(social|share)-e2e\.html$/.test(window.location.pathname)
    ? "kumo-e2e-token"
    : null;
  const token = e2eToken ?? await auth.currentUser?.getIdToken();
  if (!token) throw new Error("Authentication required.");
  const response = await fetch(input, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
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
  const response = await fetch(input, {
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
