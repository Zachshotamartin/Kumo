export const FIREBASE_HOSTED_AUTH_DOMAIN = "kumo-7d8e1.firebaseapp.com";

type BrowserLocation = Pick<Location, "host" | "protocol">;

/**
 * Redirect authentication uses Kumo's own HTTPS origin so browsers do not
 * have to read Firebase state from third-party storage. Firebase always
 * constructs an HTTPS helper URL, so HTTP localhost must retain the hosted
 * Firebase domain and use popup authentication instead.
 */
export const resolveFirebaseAuthDomain = (
  configuredDomain: string | undefined,
  browserLocation: BrowserLocation | undefined
) => {
  if (browserLocation?.protocol === "https:" && browserLocation.host) return browserLocation.host;
  if (configuredDomain && !/placeholder|sensitive|encrypted|^\[.*\]$/i.test(configuredDomain)) {
    return configuredDomain;
  }
  return FIREBASE_HOSTED_AUTH_DOMAIN;
};
