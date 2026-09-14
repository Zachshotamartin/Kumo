const GOOGLE_REDIRECT_MARKER = "kumo:google-redirect-pending";

export const hasPendingGoogleRedirect = () => {
  try { return window.sessionStorage.getItem(GOOGLE_REDIRECT_MARKER) === "pending"; }
  catch { return true; }
};

export const markPendingGoogleRedirect = () => window.sessionStorage.setItem(GOOGLE_REDIRECT_MARKER, "pending");

export const clearPendingGoogleRedirect = () => {
  try { window.sessionStorage.removeItem(GOOGLE_REDIRECT_MARKER); }
  catch { /* Firebase handles browsers where redirect storage is unavailable. */ }
};
