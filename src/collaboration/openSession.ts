export const openSessionGuestNonceKey = (token: string) => `kumo:open-session-guest:${token.slice(0, 24)}`;

/**
 * Open-session passwords are reusable credentials, so they are held in memory for the lifetime of
 * the page instead of in `sessionStorage`: web storage keeps them in clear text where any script on
 * the origin can read them, and they would outlive the tab's use of the board. Reloading the page
 * therefore asks the guest for the password again, which is the intended trade-off.
 */
const openSessionPasswords = new Map<string, string>();

export const rememberOpenSessionPassword = (token: string, password: string) => {
  openSessionPasswords.set(token.slice(0, 24), password);
};

export const openSessionPassword = (token: string) => openSessionPasswords.get(token.slice(0, 24)) ?? "";

export const forgetOpenSessionPassword = (token: string) => {
  openSessionPasswords.delete(token.slice(0, 24));
};

export const openSessionGuestNonce = (token: string) => {
  const key = openSessionGuestNonceKey(token);
  const existing = sessionStorage.getItem(key);
  if (existing && /^[a-z0-9_-]{16,80}$/i.test(existing)) return existing;
  const nonce = crypto.randomUUID();
  sessionStorage.setItem(key, nonce);
  return nonce;
};
