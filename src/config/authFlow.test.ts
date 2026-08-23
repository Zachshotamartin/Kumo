import { googleAuthFlowForLocation } from "./authFlow";

describe("Google authentication flow", () => {
  it("uses same-origin redirects on HTTPS deployments", () => {
    expect(googleAuthFlowForLocation({ protocol: "https:" })).toBe("redirect");
  });

  it("uses a popup on HTTP localhost because Firebase redirect helpers require HTTPS", () => {
    expect(googleAuthFlowForLocation({ protocol: "http:" })).toBe("popup");
    expect(googleAuthFlowForLocation(undefined)).toBe("popup");
  });
});
