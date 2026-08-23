import { randomUUID } from "node:crypto";
import type { PlainLsonObject } from "@liveblocks/node";

interface StorageDocumentClient {
  deleteStorageDocument(roomId: string): Promise<unknown>;
  initializeStorageDocument(roomId: string, document: PlainLsonObject): Promise<unknown>;
}

interface ReplaceStorageDocumentOptions {
  client: StorageDocumentClient;
  roomId: string;
  current: PlainLsonObject;
  next: PlainLsonObject;
  commit: () => Promise<void>;
  rollback?: () => Promise<void>;
}

interface DocumentLeaseDatabase {
  rpc(name: string, parameters: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }>;
}

const rollbackFailure = (cause: unknown, rollback: unknown) => {
  const error = new Error("The document update failed and automatic recovery also failed.", { cause });
  error.name = "DocumentRecoveryFailed";
  Object.assign(error, { rollback });
  return error;
};

/**
 * Replaces Liveblocks storage and treats the caller's database work as one
 * recoverable operation. The database callback should itself be transactional.
 */
export const replaceStorageDocument = async ({
  client,
  roomId,
  current,
  next,
  commit,
  rollback,
}: ReplaceStorageDocumentOptions): Promise<void> => {
  try {
    await client.deleteStorageDocument(roomId);
    await client.initializeStorageDocument(roomId, next);
    await commit();
  } catch (cause) {
    try {
      // Initialization can fail before a new document exists. Deleting in that
      // case is best-effort; restoring the known-good document is mandatory.
      await client.deleteStorageDocument(roomId).catch(() => undefined);
      await client.initializeStorageDocument(roomId, current);
      await rollback?.();
    } catch (rollback) {
      throw rollbackFailure(cause, rollback);
    }
    throw cause;
  }
};

export const withDocumentLease = async <T>(
  database: DocumentLeaseDatabase,
  roomId: string,
  operation: () => Promise<T>
): Promise<T> => {
  const token = randomUUID();
  const { data, error } = await database.rpc("acquire_kumo_document_lease", {
    p_room_id: roomId,
    p_lease_token: token,
    p_ttl_seconds: 120,
  });
  if (error) throw error;
  if (data !== true) {
    const conflict = new Error("Another version or branch operation is already updating this document.");
    conflict.name = "DocumentConflict";
    throw conflict;
  }
  try {
    return await operation();
  } finally {
    try {
      await database.rpc("release_kumo_document_lease", {
        p_room_id: roomId,
        p_lease_token: token,
      });
    } catch { /* The short lease expires even if release cannot reach the database. */ }
  }
};
