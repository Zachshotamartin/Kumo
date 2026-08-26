export const FULL_STACK_CANARY_EMAIL_PATTERN = /^kumo-full-stack-(?:owner|collaborator|community)-[a-z0-9-]+@example\.com$/i;

export const isFullStackCanaryEmail = (email: unknown): email is string =>
  typeof email === "string" && FULL_STACK_CANARY_EMAIL_PATTERN.test(email);

export const isFullStackCanaryPublisher = (profile: unknown) => {
  const joined = Array.isArray(profile) ? profile[0] : profile;
  return Boolean(
    joined
    && typeof joined === "object"
    && isFullStackCanaryEmail((joined as { email?: unknown }).email),
  );
};

export const withoutJoinedPublisher = <T extends { profiles?: unknown }>(record: T): Omit<T, "profiles"> => {
  const { profiles, ...publication } = record;
  void profiles;
  return publication;
};

export interface FullStackCanaryCleanupTargets {
  accountIds: string[];
  boardIds: string[];
  extensionIds: string[];
  fontStorageKeys: string[];
  roomIds: string[];
}

export interface FullStackCanaryCleanupOperations {
  closeBrowser(): Promise<void>;
  deleteAuditEvents(accountId: string): Promise<void>;
  deleteBoard(boardId: string): Promise<void>;
  deleteExtension(extensionId: string): Promise<void>;
  deleteFirebaseUser(accountId: string): Promise<void>;
  deleteFontStorage(keys: string[]): Promise<void>;
  deleteLiveblocksRoom(roomId: string): Promise<void>;
  deleteProfile(accountId: string): Promise<void>;
}

const cleanupStep = async (
  failures: Error[],
  label: string,
  operation: () => Promise<void>,
) => {
  try {
    await operation();
  } catch (cause) {
    failures.push(new Error(`Full-stack canary cleanup failed for ${label}.`, { cause }));
  }
};

export const cleanupFullStackCanaryArtifacts = async (
  targets: FullStackCanaryCleanupTargets,
  operations: FullStackCanaryCleanupOperations,
) => {
  const failures: Error[] = [];
  await cleanupStep(failures, "browser", operations.closeBrowser);

  for (const roomId of [...targets.roomIds].reverse()) {
    await cleanupStep(failures, `Liveblocks room ${roomId}`, () => operations.deleteLiveblocksRoom(roomId));
  }
  for (const accountId of targets.accountIds) {
    await cleanupStep(failures, `audit events for ${accountId}`, () => operations.deleteAuditEvents(accountId));
  }
  for (const extensionId of targets.extensionIds) {
    await cleanupStep(failures, `extension ${extensionId}`, () => operations.deleteExtension(extensionId));
  }
  if (targets.fontStorageKeys.length) {
    await cleanupStep(failures, "font storage", () => operations.deleteFontStorage(targets.fontStorageKeys));
  }

  // Board ownership intentionally uses ON DELETE RESTRICT. Removing every tracked
  // board first lets the subsequent profile deletion cascade through workspaces,
  // templates, libraries, memberships, publications, and the remaining user data.
  for (const boardId of [...targets.boardIds].reverse()) {
    await cleanupStep(failures, `board ${boardId}`, () => operations.deleteBoard(boardId));
  }
  for (const accountId of targets.accountIds) {
    await cleanupStep(failures, `profile ${accountId}`, () => operations.deleteProfile(accountId));
  }
  for (const accountId of targets.accountIds) {
    await cleanupStep(failures, `Firebase user ${accountId}`, () => operations.deleteFirebaseUser(accountId));
  }

  if (failures.length) {
    throw new AggregateError(
      failures,
      `Full-stack canary cleanup failed in ${failures.length} operation${failures.length === 1 ? "" : "s"}.`,
    );
  }
};

export const assertFullStackCanaryOutcome = (
  verificationError: unknown,
  cleanupError: unknown,
) => {
  if (verificationError && cleanupError) {
    throw new AggregateError(
      [verificationError, cleanupError],
      "Full-stack verification and cleanup both failed.",
    );
  }
  if (verificationError) throw verificationError;
  if (cleanupError) throw cleanupError;
};
