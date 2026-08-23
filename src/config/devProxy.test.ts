import { PREVIEW_API_TARGET, devProxyForMode } from "./devProxy";

describe("development API proxy", () => {
  it("uses the stable authenticated preview API only in remote mode", () => {
    expect(devProxyForMode("remote")).toEqual({
      "/api": {
        target: PREVIEW_API_TARGET,
        changeOrigin: true,
        secure: true,
      },
    });
    expect(devProxyForMode("development")).toBeUndefined();
    expect(devProxyForMode("production")).toBeUndefined();
  });
});
