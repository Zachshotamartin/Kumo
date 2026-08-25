import { authenticatedFetch, publicFetch } from "./apiClient";
import {
  createOpenSession,
  loadOpenSessions,
  loadPushConfig,
  redeemOpenSession,
  revokeOpenSession,
  subscribePush,
  testPush,
  unsubscribePush,
} from "./platformRepository";
import { loadWorkspaceFonts, uploadWorkspaceFont } from "./fontRepository";

const storageMocks = vi.hoisted(() => ({ upload: vi.fn(), from: vi.fn() }));
vi.mock("./apiClient", () => ({ authenticatedFetch: vi.fn(), publicFetch: vi.fn() }));
vi.mock("@supabase/supabase-js", () => ({ createClient: () => ({ storage: { from: storageMocks.from } }) }));

describe("advanced platform repositories", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("VITE_SUPABASE_URL", "https://supabase.example");
    vi.stubEnv("VITE_SUPABASE_PUBLISHABLE_KEY", "publishable-key");
    storageMocks.from.mockReturnValue({ uploadToSignedUrl: storageMocks.upload });
    storageMocks.upload.mockResolvedValue({ error: null });
  });
  afterEach(() => vi.unstubAllEnvs());

  it("covers push configuration, subscription lifecycle, and delivery tests", async () => {
    vi.mocked(authenticatedFetch)
      .mockResolvedValueOnce({ configured: true, publicKey: "public" })
      .mockResolvedValueOnce({ subscription: { id: "push", endpoint: "https://push", updated_at: "now" } })
      .mockResolvedValueOnce({ unsubscribed: true })
      .mockResolvedValueOnce({ delivered: 1, subscriptions: 1 });
    await expect(loadPushConfig()).resolves.toEqual({ configured: true, publicKey: "public" });
    await subscribePush({ endpoint: "https://push", p256dh: "p", auth: "a" });
    await unsubscribePush("https://push");
    await expect(testPush()).resolves.toEqual({ delivered: 1, subscriptions: 1 });
    expect(authenticatedFetch).toHaveBeenNthCalledWith(1, "/api/platform?scope=push-config");
    expect(authenticatedFetch).toHaveBeenNthCalledWith(2, "/api/platform", expect.objectContaining({ body: JSON.stringify({ action: "subscribe-push", endpoint: "https://push", p256dh: "p", auth: "a" }) }));
    expect(authenticatedFetch).toHaveBeenNthCalledWith(3, "/api/platform", expect.objectContaining({ body: JSON.stringify({ action: "unsubscribe-push", endpoint: "https://push" }) }));
  });

  it("covers owner-managed and anonymous open-session flows", async () => {
    const session = { id: "session", board_id: "board", role: "editor" as const, expires_at: "later", revoked_at: null, created_at: "now" };
    vi.mocked(authenticatedFetch)
      .mockResolvedValueOnce({ sessions: [session] })
      .mockResolvedValueOnce({ session, token: "secret", url: "https://kumo.test/?openSession=secret" })
      .mockResolvedValueOnce({ revoked: true });
    vi.mocked(publicFetch).mockResolvedValueOnce({ session: { id: "session", boardId: "board", title: "Board", roomId: "board:board", ownerId: "owner", visibility: "private", role: "editor", expiresAt: "later", guestId: "guest:one", updatedAt: 10 } });
    await expect(loadOpenSessions("board / one")).resolves.toEqual([session]);
    await expect(createOpenSession("board", { role: "editor", password: "password", expiresAt: "later" })).resolves.toMatchObject({ token: "secret" });
    await revokeOpenSession("board", "session");
    await expect(redeemOpenSession("secret", "password", "0123456789abcdef")).resolves.toMatchObject({ guestId: "guest:one" });
    expect(authenticatedFetch).toHaveBeenNthCalledWith(1, "/api/platform?scope=open-sessions&boardId=board+%2F+one");
    expect(publicFetch).toHaveBeenCalledWith("/api/platform", expect.objectContaining({ body: JSON.stringify({ action: "redeem-open-session", token: "secret", password: "password", guestNonce: "0123456789abcdef" }) }));
  });

  it("loads and completes a signed workspace-font upload", async () => {
    const font = { id: "font", workspace_id: "workspace", family: "Kumo Sans", style: "normal" as const, weight_min: 400, weight_max: 700, storage_key: "workspace/font.woff2", mime_type: "font/woff2", created_at: "now", url: "https://signed/font" };
    vi.mocked(authenticatedFetch)
      .mockResolvedValueOnce({ fonts: [font] })
      .mockResolvedValueOnce({ upload: { path: "workspace/font.woff2", token: "token", signedUrl: "https://upload" } })
      .mockResolvedValueOnce({ font });
    await expect(loadWorkspaceFonts()).resolves.toEqual([font]);
    const file = new File(["font"], "font.woff2", { type: "" });
    await expect(uploadWorkspaceFont(file, "Kumo Sans", { weightMin: 400, weightMax: 700 })).resolves.toEqual(font);
    expect(storageMocks.from).toHaveBeenCalledWith("workspace-fonts");
    expect(storageMocks.upload).toHaveBeenCalledWith("workspace/font.woff2", "token", expect.objectContaining({ type: "font/woff2" }), { contentType: "font/woff2", upsert: false });
    expect(authenticatedFetch).toHaveBeenLastCalledWith("/api/platform", expect.objectContaining({ body: JSON.stringify({ action: "complete-font-upload", storageKey: "workspace/font.woff2", family: "Kumo Sans", style: "normal", weightMin: 400, weightMax: 700 }) }));
  });

  it("surfaces signed font upload failures and rejects missing public configuration", async () => {
    vi.mocked(authenticatedFetch).mockResolvedValueOnce({ upload: { path: "workspace/font.ttf", token: "token", signedUrl: "https://upload" } });
    storageMocks.upload.mockResolvedValueOnce({ error: new Error("storage unavailable") });
    await expect(uploadWorkspaceFont(new File(["font"], "font.ttf", { type: "font/ttf" }), "Broken")).rejects.toThrow("storage unavailable");

    vi.mocked(authenticatedFetch).mockResolvedValueOnce({ upload: { path: "workspace/font.woff", token: "token", signedUrl: "https://upload" } });
    vi.stubEnv("VITE_SUPABASE_URL", "");
    await expect(uploadWorkspaceFont(new File(["font"], "font.woff", { type: "" }), "Missing config")).rejects.toThrow("configuration is incomplete");
  });

  it("infers every supported font type and applies optional metadata defaults", async () => {
    for (const [name, type, input] of [
      ["font.woff", "font/woff", { style: "italic" as const }],
      ["font.ttf", "font/ttf", { weightMin: 500 }],
      ["font.otf", "font/otf", {}],
      ["font", "", {}],
    ] as const) {
      vi.mocked(authenticatedFetch)
        .mockResolvedValueOnce({ upload: { path: `workspace/${name}`, token: "token", signedUrl: "https://upload" } })
        .mockResolvedValueOnce({ font: { id: name } });
      await uploadWorkspaceFont(new File(["font"], name, { type: "" }), "Family", input);
      expect(authenticatedFetch).toHaveBeenLastCalledWith("/api/platform", expect.objectContaining({
        body: expect.stringContaining(`"style":"${input.style ?? "normal"}"`),
      }));
      expect(storageMocks.upload).toHaveBeenLastCalledWith(
        `workspace/${name}`, "token", expect.objectContaining({ type }),
        { contentType: type, upsert: false }
      );
    }
  });
});
