import {
  assertFullStackCanaryOutcome,
  cleanupFullStackCanaryArtifacts,
  isFullStackCanaryEmail,
  isFullStackCanaryPublisher,
  type FullStackCanaryCleanupOperations,
  withoutJoinedPublisher,
} from "./fullStackCanaryArtifacts";

const targets = () => ({
  accountIds: ["account-1", "account-2"],
  boardIds: ["board-1", "board-2"],
  extensionIds: ["extension-1"],
  fontStorageKeys: ["workspace/font-1.woff2", "workspace/font-2.woff2"],
  roomIds: ["room-1", "room-2"],
});

const operations = (calls: string[]): FullStackCanaryCleanupOperations => ({
  closeBrowser: async () => { calls.push("browser"); },
  deleteAuditEvents: async (id) => { calls.push(`audit:${id}`); },
  deleteBoard: async (id) => { calls.push(`board:${id}`); },
  deleteExtension: async (id) => { calls.push(`extension:${id}`); },
  deleteFirebaseUser: async (id) => { calls.push(`firebase:${id}`); },
  deleteFontStorage: async (keys) => { calls.push(`fonts:${keys.join(",")}`); },
  deleteLiveblocksRoom: async (id) => { calls.push(`room:${id}`); },
  deleteProfile: async (id) => { calls.push(`profile:${id}`); },
});

describe("full-stack canary artifact hygiene", () => {
  it.each([
    ["kumo-full-stack-owner-123@example.com", true],
    ["KUMO-FULL-STACK-COLLABORATOR-a-b@example.com", true],
    ["kumo-full-stack-community-abc@example.com", true],
    ["kumo-full-stack-member-abc@example.com", false],
    ["kumo-full-stack-owner-abc@customer.example", false],
    ["owner@example.com", false],
    [undefined, false],
  ])("identifies only the reserved canary email namespace: %s", (email, expected) => {
    expect(isFullStackCanaryEmail(email)).toBe(expected);
  });

  it("recognizes object and array publisher joins and strips private join metadata", () => {
    expect(isFullStackCanaryPublisher({ email: "kumo-full-stack-owner-run@example.com" })).toBe(true);
    expect(isFullStackCanaryPublisher([{ email: "kumo-full-stack-community-run@example.com" }])).toBe(true);
    expect(isFullStackCanaryPublisher({ email: "creator@example.com" })).toBe(false);
    expect(isFullStackCanaryPublisher([])).toBe(false);
    expect(isFullStackCanaryPublisher(null)).toBe(false);
    expect(isFullStackCanaryPublisher("profile")).toBe(false);
    expect(withoutJoinedPublisher({ board_id: "board", profiles: { email: "creator@example.com" } }))
      .toEqual({ board_id: "board" });
  });

  it("removes external rooms before database boards, then profiles before Firebase identities", async () => {
    const calls: string[] = [];
    await cleanupFullStackCanaryArtifacts(targets(), operations(calls));
    expect(calls).toEqual([
      "browser",
      "room:room-2", "room:room-1",
      "audit:account-1", "audit:account-2",
      "extension:extension-1",
      "fonts:workspace/font-1.woff2,workspace/font-2.woff2",
      "board:board-2", "board:board-1",
      "profile:account-1", "profile:account-2",
      "firebase:account-1", "firebase:account-2",
    ]);
  });

  it("skips optional storage cleanup when no fonts were uploaded", async () => {
    const calls: string[] = [];
    await cleanupFullStackCanaryArtifacts({ ...targets(), fontStorageKeys: [] }, operations(calls));
    expect(calls.some((call) => call.startsWith("fonts:"))).toBe(false);
  });

  it("attempts every cleanup step and reports every failure", async () => {
    const calls: string[] = [];
    const cleanup = operations(calls);
    cleanup.closeBrowser = async () => { throw new Error("browser failed"); };
    cleanup.deleteLiveblocksRoom = async (id) => {
      calls.push(`room:${id}`);
      if (id === "room-2") throw new Error("room failed");
    };
    cleanup.deleteProfile = async (id) => {
      calls.push(`profile:${id}`);
      if (id === "account-1") throw new Error("profile failed");
    };

    const error = await cleanupFullStackCanaryArtifacts(targets(), cleanup).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(AggregateError);
    expect(error).toMatchObject({ message: "Full-stack canary cleanup failed in 3 operations." });
    expect((error as AggregateError).errors.map((failure) => (failure as Error).message)).toEqual([
      "Full-stack canary cleanup failed for browser.",
      "Full-stack canary cleanup failed for Liveblocks room room-2.",
      "Full-stack canary cleanup failed for profile account-1.",
    ]);
    expect(calls).toContain("firebase:account-2");
  });

  it("uses a singular cleanup failure message", async () => {
    const cleanup = operations([]);
    cleanup.closeBrowser = async () => { throw new Error("browser failed"); };
    await expect(cleanupFullStackCanaryArtifacts({
      accountIds: [], boardIds: [], extensionIds: [], fontStorageKeys: [], roomIds: [],
    }, cleanup)).rejects.toMatchObject({
      message: "Full-stack canary cleanup failed in 1 operation.",
    });
  });

  it("preserves verification and cleanup failures without masking either", () => {
    const verification = new Error("verification failed");
    const cleanup = new Error("cleanup failed");
    expect(() => assertFullStackCanaryOutcome(undefined, undefined)).not.toThrow();
    expect(() => assertFullStackCanaryOutcome(verification, undefined)).toThrow(verification);
    expect(() => assertFullStackCanaryOutcome(undefined, cleanup)).toThrow(cleanup);
    expect(() => assertFullStackCanaryOutcome(verification, cleanup)).toThrow(new AggregateError(
      [verification, cleanup],
      "Full-stack verification and cleanup both failed.",
    ));
  });
});
