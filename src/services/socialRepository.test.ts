import { createClient } from "@supabase/supabase-js";
import { authenticatedFetch } from "./apiClient";
import {
  getProfile,
  listFriendships,
  mutateFriendship,
  searchProfiles,
  updateProfile,
  uploadProfileAvatar,
} from "./socialRepository";

vi.mock("./apiClient", () => ({ authenticatedFetch: vi.fn() }));
vi.mock("@supabase/supabase-js", () => ({ createClient: vi.fn() }));

describe("social repository", () => {
  beforeEach(() => vi.clearAllMocks());

  it("loads the current profile and encoded public profile routes", async () => {
    vi.mocked(authenticatedFetch)
      .mockResolvedValueOnce({ profile: { id: "self" } })
      .mockResolvedValueOnce({ profile: { id: "friend" } });
    await expect(getProfile()).resolves.toEqual({ id: "self" });
    await expect(getProfile("alex name")).resolves.toEqual({ id: "friend" });
    expect(authenticatedFetch).toHaveBeenNthCalledWith(1, "/api/profile");
    expect(authenticatedFetch).toHaveBeenNthCalledWith(2, "/api/profile?username=alex%20name");
  });

  it("updates profiles and loads friendship groups", async () => {
    vi.mocked(authenticatedFetch)
      .mockResolvedValueOnce({ profile: { username: "avery" } })
      .mockResolvedValueOnce({ friends: [], incoming: [], outgoing: [], blocked: [] });
    await updateProfile({ displayName: "Avery", discoverable: false });
    expect(authenticatedFetch).toHaveBeenNthCalledWith(1, "/api/profile", {
      method: "PATCH",
      body: JSON.stringify({ displayName: "Avery", discoverable: false }),
    });
    await expect(listFriendships()).resolves.toEqual({ friends: [], incoming: [], outgoing: [], blocked: [] });
  });

  it("searches profiles only after two characters and mutates friendship state", async () => {
    await expect(searchProfiles("a")).resolves.toEqual([]);
    expect(authenticatedFetch).not.toHaveBeenCalled();
    vi.mocked(authenticatedFetch)
      .mockResolvedValueOnce({ results: [{ id: "friend" }] })
      .mockResolvedValueOnce({ relationship: "outgoing" });
    await expect(searchProfiles(" Alex ")).resolves.toEqual([{ id: "friend" }]);
    expect(authenticatedFetch).toHaveBeenNthCalledWith(1, "/api/friends?query=Alex");
    await expect(mutateFriendship("friend", "request")).resolves.toBe("outgoing");
    expect(authenticatedFetch).toHaveBeenNthCalledWith(2, "/api/friends", {
      method: "POST",
      body: JSON.stringify({ targetUid: "friend", action: "request" }),
    });
  });
});

describe("profile avatar repository", () => {
  const file = () => new File(["avatar"], "avatar.png", { type: "image/png" });
  const upload = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("VITE_SUPABASE_URL", "https://supabase.example");
    vi.stubEnv("VITE_SUPABASE_PUBLISHABLE_KEY", "publishable");
    vi.stubGlobal("createImageBitmap", undefined);
    upload.mockResolvedValue({ error: null });
    vi.mocked(createClient).mockReturnValue({ storage: { from: () => ({ uploadToSignedUrl: upload }) } } as unknown as ReturnType<typeof createClient>);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("uploads the original image when bitmap cropping is unavailable", async () => {
    vi.mocked(authenticatedFetch)
      .mockResolvedValueOnce({ upload: { path: "actor/avatar.png", token: "token" } })
      .mockResolvedValueOnce({ avatarUrl: "https://cdn.example/avatar.png" });
    await expect(uploadProfileAvatar(file())).resolves.toBe("https://cdn.example/avatar.png");
    expect(upload).toHaveBeenCalledWith("actor/avatar.png", "token", expect.objectContaining({ type: "image/png" }), { contentType: "image/png", upsert: false });
  });

  it("center-crops a bitmap to WebP and closes image resources", async () => {
    const drawImage = vi.fn();
    const close = vi.fn();
    vi.stubGlobal("createImageBitmap", vi.fn().mockResolvedValue({ width: 800, height: 600, close }));
    const createElement = vi.spyOn(document, "createElement").mockReturnValue({
      width: 0, height: 0,
      getContext: () => ({ drawImage }),
      toBlob: (resolve: (blob: Blob | null) => void) => resolve(new Blob(["cropped"], { type: "image/webp" })),
    } as unknown as HTMLCanvasElement);
    vi.mocked(authenticatedFetch)
      .mockResolvedValueOnce({ upload: { path: "actor/avatar.webp", token: "token" } })
      .mockResolvedValueOnce({ avatarUrl: "https://cdn.example/avatar.webp" });
    await uploadProfileAvatar(file());
    expect(drawImage).toHaveBeenCalledWith(expect.any(Object), 100, 0, 600, 600, 0, 0, 512, 512);
    expect(close).toHaveBeenCalled();
    expect(upload).toHaveBeenCalledWith("actor/avatar.webp", "token", expect.objectContaining({ type: "image/webp" }), expect.any(Object));
    createElement.mockRestore();
  });

  it("falls back to the source file when canvas encoding fails or has no drawing context", async () => {
    const noContextToBlob = vi.fn();
    vi.stubGlobal("createImageBitmap", vi.fn()
      .mockResolvedValueOnce({ width: 100, height: 200, close: vi.fn() })
      .mockResolvedValueOnce({ width: 100, height: 100, close: vi.fn() }));
    const createElement = vi.spyOn(document, "createElement")
      .mockReturnValueOnce({ width: 0, height: 0, getContext: () => null, toBlob: noContextToBlob } as unknown as HTMLCanvasElement)
      .mockReturnValueOnce({ width: 0, height: 0, getContext: () => ({ drawImage: vi.fn() }), toBlob: (resolve: (blob: null) => void) => resolve(null) } as unknown as HTMLCanvasElement);
    vi.mocked(authenticatedFetch)
      .mockResolvedValueOnce({ upload: { path: "one", token: "one" } }).mockResolvedValueOnce({ avatarUrl: "one" })
      .mockResolvedValueOnce({ upload: { path: "two", token: "two" } }).mockResolvedValueOnce({ avatarUrl: "two" });
    await uploadProfileAvatar(file());
    await uploadProfileAvatar(file());
    expect(upload).toHaveBeenCalledTimes(2);
    expect(noContextToBlob).not.toHaveBeenCalled();
    createElement.mockRestore();
  });

  it("falls back without allocating a canvas for invalid bitmap dimensions", async () => {
    const close = vi.fn();
    vi.stubGlobal("createImageBitmap", vi.fn().mockResolvedValue({ width: 0, height: Number.NaN, close }));
    const createElement = vi.spyOn(document, "createElement");
    vi.mocked(authenticatedFetch)
      .mockResolvedValueOnce({ upload: { path: "actor/avatar.png", token: "token" } })
      .mockResolvedValueOnce({ avatarUrl: "avatar" });
    await expect(uploadProfileAvatar(file())).resolves.toBe("avatar");
    expect(close).toHaveBeenCalled();
    expect(createElement).not.toHaveBeenCalled();
    createElement.mockRestore();
  });

  it("rejects invalid source files before decoding or requesting an upload", async () => {
    const bitmap = vi.fn();
    vi.stubGlobal("createImageBitmap", bitmap);
    for (const source of [
      new File([], "empty.png", { type: "image/png" }),
      new File(["avatar"], "avatar.gif", { type: "image/gif" }),
      new File([new Uint8Array(5 * 1024 * 1024 + 1)], "huge.png", { type: "image/png" }),
    ]) {
      await expect(uploadProfileAvatar(source)).rejects.toThrow("no larger than 5 MB");
    }
    expect(bitmap).not.toHaveBeenCalled();
    expect(authenticatedFetch).not.toHaveBeenCalled();
  });

  it("rejects missing public configuration and signed upload failures", async () => {
    vi.mocked(authenticatedFetch).mockResolvedValue({ upload: { path: "actor/avatar.png", token: "token" } });
    vi.stubEnv("VITE_SUPABASE_URL", "");
    await expect(uploadProfileAvatar(file())).rejects.toThrow("configuration is incomplete");
    vi.stubEnv("VITE_SUPABASE_URL", "https://supabase.example");
    vi.stubEnv("VITE_SUPABASE_PUBLISHABLE_KEY", "");
    await expect(uploadProfileAvatar(file())).rejects.toThrow("configuration is incomplete");
    vi.stubEnv("VITE_SUPABASE_PUBLISHABLE_KEY", "publishable");
    upload.mockResolvedValueOnce({ error: new Error("upload failed") });
    await expect(uploadProfileAvatar(file())).rejects.toThrow("upload failed");
  });
});
