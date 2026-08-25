export const openSessionPasswordKey = (token: string) => `kumo:open-session-password:${token.slice(0, 24)}`;
export const openSessionGuestNonceKey = (token: string) => `kumo:open-session-guest:${token.slice(0, 24)}`;

export const openSessionGuestNonce = (token: string) => {
  const key = openSessionGuestNonceKey(token);
  const existing = sessionStorage.getItem(key);
  if (existing && /^[a-z0-9_-]{16,80}$/i.test(existing)) return existing;
  const nonce = crypto.randomUUID();
  sessionStorage.setItem(key, nonce);
  return nonce;
};
