import {
  forgetOpenSessionPassword,
  openSessionGuestNonce,
  openSessionGuestNonceKey,
  openSessionPassword,
  rememberOpenSessionPassword,
} from "./openSession";

describe("open-session browser identity", () => {
  beforeEach(() => {
    sessionStorage.clear();
    forgetOpenSessionPassword("shared-token");
  });

  it("creates one stable valid nonce per token and replaces malformed state", () => {
    const key = openSessionGuestNonceKey("shared-token");
    sessionStorage.setItem(key, "bad");
    const nonce = openSessionGuestNonce("shared-token");
    expect(nonce).toMatch(/^[a-z0-9_-]{16,80}$/i);
    expect(nonce).not.toBe("bad");
    expect(openSessionGuestNonce("shared-token")).toBe(nonce);
  });

  it("keeps the session password in memory and never writes it to web storage", () => {
    rememberOpenSessionPassword("shared-token", "correct horse battery");
    expect(openSessionPassword("shared-token")).toBe("correct horse battery");
    expect(JSON.stringify({ ...sessionStorage })).not.toContain("correct horse battery");
    expect(JSON.stringify({ ...localStorage })).not.toContain("correct horse battery");
  });

  it("forgets the password on request and reports an empty password for unknown tokens", () => {
    rememberOpenSessionPassword("shared-token", "correct horse battery");
    forgetOpenSessionPassword("shared-token");
    expect(openSessionPassword("shared-token")).toBe("");
    expect(openSessionPassword("another-token")).toBe("");
  });
});
