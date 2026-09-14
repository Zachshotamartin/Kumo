import { clearPendingGoogleRedirect, hasPendingGoogleRedirect, markPendingGoogleRedirect } from "./googleRedirectState";

afterEach(() => { vi.restoreAllMocks(); sessionStorage.clear(); });

it("tracks Google redirects separately from ordinary visits", () => {
  sessionStorage.clear();
  expect(hasPendingGoogleRedirect()).toBe(false);
  markPendingGoogleRedirect();
  expect(hasPendingGoogleRedirect()).toBe(true);
  clearPendingGoogleRedirect();
  expect(hasPendingGoogleRedirect()).toBe(false);
});

it("defers to Firebase when redirect storage cannot be read or cleared", () => {
  vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("Storage blocked"); });
  vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => { throw new Error("Storage blocked"); });
  expect(hasPendingGoogleRedirect()).toBe(true);
  expect(() => clearPendingGoogleRedirect()).not.toThrow();
});
