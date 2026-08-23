const mocks = vi.hoisted(() => ({
  cert: vi.fn((value) => value),
  getApps: vi.fn(),
  initializeApp: vi.fn(),
  getAuth: vi.fn((app) => ({ app })),
  getDatabase: vi.fn((app) => ({ app })),
}));

vi.mock("firebase-admin/app", () => ({
  cert: mocks.cert,
  getApps: mocks.getApps,
  initializeApp: mocks.initializeApp,
}));
vi.mock("firebase-admin/auth", () => ({ getAuth: mocks.getAuth }));
vi.mock("firebase-admin/database", () => ({ getDatabase: mocks.getDatabase }));

describe("Firebase Admin client", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    delete process.env.FIREBASE_ADMIN_PROJECT_ID;
    delete process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
    delete process.env.FIREBASE_ADMIN_PRIVATE_KEY;
    delete process.env.FIREBASE_ADMIN_DATABASE_URL;
    mocks.getApps.mockReturnValue([]);
    mocks.initializeApp.mockReturnValue({ name: "admin" });
  });

  it("uses Kumo's public project ID fallback for normal token verification", async () => {
    const { adminAuth } = await import("../../api/_firebaseAdmin");
    expect(adminAuth()).toEqual({ app: { name: "admin" } });
    expect(mocks.initializeApp).toHaveBeenCalledWith(
      { projectId: "kumo-7d8e1" },
      "kumo-token-verifier"
    );
    expect(mocks.cert).not.toHaveBeenCalled();
  });

  it("keeps privileged auth and legacy database access behind service credentials", async () => {
    process.env.FIREBASE_ADMIN_PROJECT_ID = "project";
    const incomplete = await import("../../api/_firebaseAdmin");
    expect(() => incomplete.privilegedAdminAuth()).toThrow("Firebase Admin environment variables are incomplete");

    process.env.FIREBASE_ADMIN_CLIENT_EMAIL = "server@example.com";
    process.env.FIREBASE_ADMIN_PRIVATE_KEY = "line-one\\nline-two";
    process.env.FIREBASE_ADMIN_DATABASE_URL = "https://example.firebaseio.com";
    vi.resetModules();
    const { privilegedAdminAuth, adminDatabase } = await import("../../api/_firebaseAdmin");
    expect(privilegedAdminAuth()).toEqual({ app: { name: "admin" } });
    expect(adminDatabase()).toEqual({ app: { name: "admin" } });
    expect(mocks.cert).toHaveBeenCalledWith(expect.objectContaining({ privateKey: "line-one\nline-two" }));
    expect(mocks.initializeApp).toHaveBeenCalledWith(expect.any(Object), "kumo-privileged-admin");

    mocks.getApps.mockReturnValue([{ name: "kumo-privileged-admin" }]);
    expect(privilegedAdminAuth()).toEqual({ app: { name: "kumo-privileged-admin" } });
  });
});
