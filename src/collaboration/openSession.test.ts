import { openSessionGuestNonce, openSessionGuestNonceKey } from "./openSession";

describe("open-session browser identity", () => {
  beforeEach(() => sessionStorage.clear());

  it("creates one stable valid nonce per token and replaces malformed state", () => {
    const key = openSessionGuestNonceKey("shared-token");
    sessionStorage.setItem(key, "bad");
    const nonce = openSessionGuestNonce("shared-token");
    expect(nonce).toMatch(/^[a-z0-9_-]{16,80}$/i);
    expect(nonce).not.toBe("bad");
    expect(openSessionGuestNonce("shared-token")).toBe(nonce);
  });
});
