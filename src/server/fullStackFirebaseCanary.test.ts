import {
  createVerifiedCanaryAccount,
  parseFirebaseCanaryServiceAccount,
  type FirebaseCanaryAdmin,
  type FirebasePasswordSignIn,
} from "./fullStackFirebaseCanary";

const validSignIn = (): FirebasePasswordSignIn => ({
  idToken: "verified-id-token",
  refreshToken: "refresh-token",
  localId: "firebase-user",
  expiresIn: "3600",
});

const setup = () => {
  const admin = {
    createUser: vi.fn().mockResolvedValue({ uid: "firebase-user" }),
    deleteUser: vi.fn().mockResolvedValue(undefined),
  } satisfies FirebaseCanaryAdmin;
  const ids = ["password-id", "email-id", "session-id"];
  const randomId = vi.fn(() => ids.shift() ?? "extra-id");
  return { admin, randomId };
};

describe("verified Firebase full-stack canary identities", () => {
  it("parses the GitHub service-account secret used by the deployment canary", () => {
    expect(parseFirebaseCanaryServiceAccount(JSON.stringify({
      project_id: "kumo-test",
      client_email: "canary@kumo-test.iam.gserviceaccount.com",
      private_key: "line-one\\nline-two",
    }))).toEqual({
      projectId: "kumo-test",
      clientEmail: "canary@kumo-test.iam.gserviceaccount.com",
      privateKey: "line-one\nline-two",
    });
  });

  it.each([
    ["not-json", "not valid JSON"],
    ["null", "must be a JSON object"],
    ["[]", "must be a JSON object"],
    [JSON.stringify({ project_id: 4 }), "missing project_id"],
    [JSON.stringify({ project_id: " " }), "missing project_id"],
    [JSON.stringify({ project_id: "project" }), "missing client_email"],
    [JSON.stringify({ project_id: "project", client_email: "email" }), "missing private_key"],
  ])("rejects an invalid service-account secret: %s", (source, message) => {
    expect(() => parseFirebaseCanaryServiceAccount(source)).toThrow(message);
  });

  it("creates a verified disposable user and returns its client session", async () => {
    const { admin, randomId } = setup();
    const signIn = vi.fn().mockResolvedValue(validSignIn());
    await expect(createVerifiedCanaryAccount("owner", admin, signIn, randomId, () => 1_000)).resolves.toEqual({
      email: "kumo-full-stack-owner-email-id@example.com",
      password: "Kumo-password-id-A1!",
      uid: "firebase-user",
      sessionId: "session-id",
      idToken: "verified-id-token",
      refreshToken: "refresh-token",
      expirationTime: 3_601_000,
    });
    expect(admin.createUser).toHaveBeenCalledWith({
      email: "kumo-full-stack-owner-email-id@example.com",
      password: "Kumo-password-id-A1!",
      emailVerified: true,
      displayName: "Kumo owner canary",
    });
    expect(signIn).toHaveBeenCalledWith("kumo-full-stack-owner-email-id@example.com", "Kumo-password-id-A1!");
    expect(admin.deleteUser).not.toHaveBeenCalled();
  });

  it.each([
    [{ ...validSignIn(), idToken: undefined }, "missing ID token"],
    [{ ...validSignIn(), refreshToken: undefined }, "missing refresh token"],
    [{ ...validSignIn(), localId: "another-user" }, "mismatched user"],
    [{ ...validSignIn(), expiresIn: "invalid" }, "invalid expiry"],
    [{ ...validSignIn(), expiresIn: "0" }, "zero expiry"],
  ])("rolls back an incomplete sign-in response: %s (%s)", async (response, _description) => {
    const { admin, randomId } = setup();
    await expect(createVerifiedCanaryAccount("member", admin, vi.fn().mockResolvedValue(response), randomId))
      .rejects.toThrow("incomplete member canary identity");
    expect(admin.deleteUser).toHaveBeenCalledWith("firebase-user");
  });

  it("rolls back a rejected password sign-in", async () => {
    const { admin, randomId } = setup();
    const error = new Error("password provider unavailable");
    await expect(createVerifiedCanaryAccount("owner", admin, vi.fn().mockRejectedValue(error), randomId))
      .rejects.toBe(error);
    expect(admin.deleteUser).toHaveBeenCalledWith("firebase-user");
  });

  it("reports both setup and rollback failures", async () => {
    const { admin, randomId } = setup();
    const setupError = new Error("sign-in failed");
    const cleanupError = new Error("delete failed");
    admin.deleteUser.mockRejectedValue(cleanupError);
    await expect(createVerifiedCanaryAccount("owner", admin, vi.fn().mockRejectedValue(setupError), randomId))
      .rejects.toEqual(new AggregateError([setupError, cleanupError], "Firebase owner canary setup and rollback failed."));
  });

  it("does not attempt rollback when Admin user creation itself fails", async () => {
    const { admin, randomId } = setup();
    const error = new Error("create failed");
    admin.createUser.mockRejectedValue(error);
    await expect(createVerifiedCanaryAccount("owner", admin, vi.fn(), randomId)).rejects.toBe(error);
    expect(admin.deleteUser).not.toHaveBeenCalled();
  });
});
