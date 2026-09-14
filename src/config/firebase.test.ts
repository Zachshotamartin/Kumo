export {};

const mocks = vi.hoisted(() => ({
  initializeApp: vi.fn((config) => ({ config })),
  initializeAuth: vi.fn((app) => ({ app })),
}));

vi.mock("firebase/app", () => ({ initializeApp: mocks.initializeApp }));
vi.mock("firebase/auth", () => ({
  initializeAuth: mocks.initializeAuth,
  indexedDBLocalPersistence: "indexeddb",
  browserLocalPersistence: "local",
  browserSessionPersistence: "session",
  browserPopupRedirectResolver: "redirect",
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

  it("restores persisted identities without opening the Google helper unless a redirect is pending", async () => {
    sessionStorage.clear();
    await import("./firebase");
    expect(mocks.initializeAuth).toHaveBeenLastCalledWith(expect.anything(), {
      persistence: ["indexeddb", "local", "session"], popupRedirectResolver: undefined,
    });
    vi.resetModules();
    sessionStorage.setItem("kumo:google-redirect-pending", "pending");
    await import("./firebase");
    expect(mocks.initializeAuth).toHaveBeenLastCalledWith(expect.anything(), expect.objectContaining({ popupRedirectResolver: "redirect" }));
    sessionStorage.clear();
  });
});
