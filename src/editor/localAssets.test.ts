import { createLocalAssets } from "./localAssets";

it("keeps demo media in the browser and revokes URLs on removal/reset", async () => {
  const create = vi.fn().mockReturnValueOnce("blob:one").mockReturnValueOnce("blob:two");
  const revoke = vi.fn();
  vi.stubGlobal("URL", class extends URL { static createObjectURL = create; static revokeObjectURL = revoke; });
  try {
    const assets = createLocalAssets();
    const file = new File(["pixels"], "demo.png", { type: "image/png" });
    const one = await assets.upload("demo", file, { width: 80, height: 40 });
    expect(one).toMatchObject({ board_id: "demo", mime_type: "image/png", width: 80, height: 40, url: "blob:one", byte_size: 6 });
    await assets.remove(one.id);
    await assets.remove(one.id);
    expect(revoke).toHaveBeenCalledTimes(1);
    await assets.upload("demo", file, { width: 80, height: 40 });
    assets.dispose();
    assets.dispose();
    expect(revoke.mock.calls.flat()).toEqual(["blob:one", "blob:two"]);
  } finally { vi.unstubAllGlobals(); }
});
