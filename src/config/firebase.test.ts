export {};

const mocks = vi.hoisted(() => ({
  initializeApp: vi.fn((config) => ({ config })),
  getAuth: vi.fn((app) => ({ app })),
}));

vi.mock("firebase/app", () => ({ initializeApp: mocks.initializeApp }));
vi.mock("firebase/auth", () => ({
  getAuth: mocks.getAuth,
  GoogleAuthProvider: class GoogleAuthProvider {},
}));

describe("Firebase browser client", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("initializes safely when imported during server rendering", async () => {
    vi.stubGlobal("window", undefined);
    const { app, auth, provider } = await import("./firebase");
    expect(app).toEqual({ config: expect.objectContaining({ authDomain: "kumo-7d8e1.firebaseapp.com" }) });
    expect(auth).toEqual({ app });
    expect(provider).toBeInstanceOf(Object);
    vi.unstubAllGlobals();
  });

  it("uses the configured browser API key and never falls back to a committed one", async () => {
    const { resolveFirebaseApiKey } = await import("./firebase");
    expect(resolveFirebaseApiKey("AIzaConfiguredForThisEnvironment")).toBe("AIzaConfiguredForThisEnvironment");
    expect(resolveFirebaseApiKey(undefined)).toBe("");
  });
});
