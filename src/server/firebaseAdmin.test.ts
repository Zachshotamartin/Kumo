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

  it("rejects incomplete server configuration", async () => {
    const { adminAuth } = await import("../../api/_firebaseAdmin");
    expect(() => adminAuth()).toThrow("Firebase Admin environment variables are incomplete");
  });

  it("initializes once and exposes auth and realtime database clients", async () => {
    process.env.FIREBASE_ADMIN_PROJECT_ID = "project";
    process.env.FIREBASE_ADMIN_CLIENT_EMAIL = "server@example.com";
    process.env.FIREBASE_ADMIN_PRIVATE_KEY = "line-one\\nline-two";
    process.env.FIREBASE_ADMIN_DATABASE_URL = "https://example.firebaseio.com";
    const { adminAuth, adminDatabase } = await import("../../api/_firebaseAdmin");
    expect(adminAuth()).toEqual({ app: { name: "admin" } });
    expect(adminDatabase()).toEqual({ app: { name: "admin" } });
    expect(mocks.cert).toHaveBeenCalledWith(expect.objectContaining({ privateKey: "line-one\nline-two" }));

    mocks.getApps.mockReturnValue([{ name: "existing" }]);
    expect(adminAuth()).toEqual({ app: { name: "existing" } });
  });
});
