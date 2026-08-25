import { authenticatedFetch } from "../services/apiClient";

export type CollaborationTelemetryEvent = "ready" | "lost" | "failed" | "restored";

export interface CollaborationTelemetryInput {
  event: CollaborationTelemetryEvent;
  boardId: string;
  roomId: string;
  attempts?: number;
  durationMs?: number;
  connectionStatus?: string;
}

interface AuthAttemptState {
  attempts: number;
  startedAt: number;
}

const authAttempts = new Map<string, AuthAttemptState>();
const TELEMETRY_QUEUE_KEY = "kumo:collaboration-telemetry";

type TelemetryPayload = CollaborationTelemetryInput & { online: boolean | null };
const TELEMETRY_RETRY_DELAYS_MS = [0, 250, 1_000] as const;

const readQueue = (): TelemetryPayload[] => {
  if (typeof window === "undefined") return [];
  try {
    const value = JSON.parse(window.localStorage.getItem(TELEMETRY_QUEUE_KEY) ?? "[]");
    return Array.isArray(value) ? value as TelemetryPayload[] : [];
  } catch {
    return [];
  }
};

const writeQueue = (queue: TelemetryPayload[]): void => {
  if (typeof window === "undefined") return;
  if (queue.length) window.localStorage.setItem(TELEMETRY_QUEUE_KEY, JSON.stringify(queue));
  else window.localStorage.removeItem(TELEMETRY_QUEUE_KEY);
};

export const recordCollaborationAuthAttempt = (roomId: string, now = Date.now()): void => {
  const current = authAttempts.get(roomId);
  authAttempts.set(roomId, current
    ? { ...current, attempts: current.attempts + 1 }
    : { attempts: 1, startedAt: now });
};

export const consumeCollaborationAuthAttempts = (
  roomId: string,
  now = Date.now()
): { attempts: number; durationMs: number } => {
  const current = authAttempts.get(roomId) ?? { attempts: 0, startedAt: now };
  authAttempts.delete(roomId);
  return {
    attempts: current.attempts,
    durationMs: Math.max(0, now - current.startedAt),
  };
};

export const reportCollaborationTelemetry = async (input: CollaborationTelemetryInput): Promise<void> => {
  const queue = [...readQueue(), {
    ...input,
    online: typeof navigator === "undefined" ? null : navigator.onLine,
  }];
  for (let index = 0; index < queue.length; index += 1) {
    let delivered = false;
    let lastError: unknown;
    const attempts = typeof navigator === "undefined" || navigator.onLine
      ? TELEMETRY_RETRY_DELAYS_MS
      : TELEMETRY_RETRY_DELAYS_MS.slice(0, 1);
    for (const delay of attempts) {
      if (delay) await new Promise((resolve) => globalThis.setTimeout(resolve, delay));
      try {
        await authenticatedFetch<{ accepted: true }>("/api/telemetry", {
          method: "POST",
          body: JSON.stringify(queue[index]),
        });
        delivered = true;
        break;
      } catch (error) {
        lastError = error;
      }
    }
    if (!delivered) {
      writeQueue(queue.slice(index));
      throw lastError;
    }
  }
  writeQueue([]);
};
