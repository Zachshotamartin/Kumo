import { FIREBASE_HOSTED_AUTH_DOMAIN, resolveFirebaseAuthDomain } from "./authDomain";

describe("Firebase authentication domain", () => {
  it("uses the app origin so redirect state remains first-party", () => {
    expect(resolveFirebaseAuthDomain("legacy.firebaseapp.com", { host: "kumo-ochre.vercel.app", protocol: "https:" }))
      .toBe("kumo-ochre.vercel.app");
  });

  it("uses Firebase hosting for HTTP localhost and redacted local env pulls", () => {
    expect(resolveFirebaseAuthDomain(undefined, { host: "localhost:5175", protocol: "http:" }))
      .toBe(FIREBASE_HOSTED_AUTH_DOMAIN);
    expect(resolveFirebaseAuthDomain("[SENSITIVE]", { host: "localhost:5175", protocol: "http:" }))
      .toBe(FIREBASE_HOSTED_AUTH_DOMAIN);
  });

  it("falls back to configured and hosted domains outside an HTTPS browser", () => {
    expect(resolveFirebaseAuthDomain("configured.example.com", undefined)).toBe("configured.example.com");
    expect(resolveFirebaseAuthDomain(undefined, undefined)).toBe(FIREBASE_HOSTED_AUTH_DOMAIN);
  });
});
