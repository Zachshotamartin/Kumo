import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

export interface ConnectionMetric {
  event: "ready" | "lost" | "failed" | "restored";
  retryCount?: number;
  durationMs?: number;
  at: string;
}

export const summarizeConnectionTelemetry = (events: ConnectionMetric[]) => {
  const counts = { ready: 0, lost: 0, failed: 0, restored: 0 };
  let retryTotal = 0;
  let recoveryTotal = 0;
  let recoverySamples = 0;
  events.forEach((event) => {
    counts[event.event] += 1;
    retryTotal += Math.max(0, Number(event.retryCount ?? 0));
    if (event.event === "restored" && Number.isFinite(event.durationMs)) {
      recoveryTotal += Math.max(0, Number(event.durationMs));
      recoverySamples += 1;
    }
  });
  return {
    counts,
    eventCount: events.length,
    retryCount: retryTotal,
    recoveryRate: counts.lost ? counts.restored / counts.lost : 1,
    averageRecoveryMs: recoverySamples ? Math.round(recoveryTotal / recoverySamples) : 0,
    healthy: counts.failed === 0 && (counts.lost === 0 || counts.restored >= counts.lost),
  };
};

export const hashPassword = (password: string) => {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${scryptSync(password, salt, 32).toString("hex")}`;
};

export const verifyPassword = (password: string, encoded: string | null) => {
  if (!encoded) return true;
  const [salt, expectedHex] = encoded.split(":");
  if (!salt || !expectedHex) return false;
  const actual = scryptSync(password, salt, 32);
  const expected = Buffer.from(expectedHex, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
};

export const sanitizeExtensionManifest = (value: unknown) => {
  const manifest = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const id = typeof manifest.id === "string" ? manifest.id.trim() : "";
  const name = typeof manifest.name === "string" ? manifest.name.trim().slice(0, 120) : "";
  const permissions = Array.isArray(manifest.permissions)
    ? manifest.permissions.filter((permission): permission is string => typeof permission === "string" && ["read-document", "write-document", "network", "clipboard", "storage"].includes(permission))
    : [];
  const commands = Array.isArray(manifest.commands) ? manifest.commands.filter((command) => command && typeof command === "object").slice(0, 100) : [];
  if (!/^[a-z0-9][a-z0-9.-]+$/i.test(id) || !name || !commands.length) throw new Error("Extension manifest is invalid.");
  if (new Set(permissions).size !== permissions.length) throw new Error("Extension permissions must be unique.");
  return { ...manifest, id, name, permissions, commands };
};

export const folderMoveCreatesCycle = (folders: Array<{ id: string; parent_id: string | null }>, folderId: string, parentId: string | null) => {
  if (!parentId) return false;
  if (folderId === parentId) return true;
  const byId = new Map(folders.map((folder) => [folder.id, folder]));
  let cursor: string | null = parentId;
  const seen = new Set<string>();
  while (cursor && !seen.has(cursor)) {
    if (cursor === folderId) return true;
    seen.add(cursor);
    cursor = byId.get(cursor)?.parent_id ?? null;
  }
  return false;
};
