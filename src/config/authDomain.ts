export const FIREBASE_HOSTED_AUTH_DOMAIN = "kumo-7d8e1.firebaseapp.com";

type BrowserLocation = Pick<Location, "host" | "protocol">;

/**
 * HTTPS deployments proxy Firebase's auth helper through Kumo's own origin so
 * redirect state remains first-party. HTTP localhost cannot host that HTTPS
 * helper, so it redirects through Firebase Hosting and then returns to the
 * original localhost URL.
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
