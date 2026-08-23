import { auth } from "../config/firebase";

interface ApiErrorBody {
  error?: string;
}

export const authenticatedFetch = async <T>(
  input: string,
  init: RequestInit = {}
): Promise<T> => {
  const token = await auth.currentUser?.getIdToken();
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
    throw new Error(body?.error ?? `Request failed with status ${response.status}.`);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
};
