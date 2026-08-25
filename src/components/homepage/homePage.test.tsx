import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import HomePage from "./homePage";

const mocks = vi.hoisted(() => ({
  signIn: vi.fn().mockResolvedValue(undefined),
  register: vi.fn().mockResolvedValue(undefined),
  googleRedirect: vi.fn().mockResolvedValue(undefined),
  redirectResult: vi.fn().mockResolvedValue(null),
  reset: vi.fn().mockResolvedValue(undefined),
  profile: vi.fn().mockResolvedValue(undefined),
  credential: vi.fn().mockResolvedValue(undefined),
  hasLocal: vi.fn(() => false),
  consumeLocal: vi.fn(() => null as null | { returnUrl: string; credential: Record<string, unknown> }),
  prepareLocal: vi.fn().mockResolvedValue("https://accounts.example/authorize"),
  usesLocal: vi.fn(() => false),
}));

vi.mock("firebase/auth", () => ({
  signInWithEmailAndPassword: mocks.signIn,
  createUserWithEmailAndPassword: mocks.register,
  signInWithRedirect: mocks.googleRedirect,
  signInWithCredential: mocks.credential,
  getRedirectResult: mocks.redirectResult,
  sendPasswordResetEmail: mocks.reset,
}));
vi.mock("../../config/firebase", () => ({ auth: {}, firebaseApiKey: "public-key", provider: {} }));
vi.mock("../../services/userRepository", () => ({ ensureUserProfile: mocks.profile }));
vi.mock("../../config/localGoogleRedirect", () => ({
  consumeLocalGoogleRedirect: mocks.consumeLocal,
  hasLocalGoogleRedirectResult: mocks.hasLocal,
  prepareLocalGoogleRedirect: mocks.prepareLocal,
  usesLocalGoogleRedirect: mocks.usesLocal,
}));

describe("HomePage authentication", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.signIn.mockResolvedValue(undefined);
    mocks.register.mockResolvedValue(undefined);
    mocks.googleRedirect.mockResolvedValue(undefined);
    mocks.redirectResult.mockResolvedValue(null);
    mocks.reset.mockResolvedValue(undefined);
    mocks.profile.mockResolvedValue(undefined);
    mocks.credential.mockResolvedValue(undefined);
    mocks.hasLocal.mockReturnValue(false);
    mocks.consumeLocal.mockReturnValue(null);
    mocks.prepareLocal.mockResolvedValue("https://accounts.example/authorize");
    mocks.usesLocal.mockReturnValue(false);
    window.history.replaceState({}, "", "/");
  });

  const fillCredentials = () => {
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: " user@example.com " } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "password" } });
  };

  it("signs in and provisions the application profile", async () => {
    render(<HomePage />);
    expect(screen.getByText("Kumo", { exact: true })).toBeInTheDocument();
    expect(screen.getAllByLabelText("Animated Kumo mascot")).toHaveLength(1);
    fillCredentials();
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    await waitFor(() => expect(mocks.signIn).toHaveBeenCalledWith({}, "user@example.com", "password"));
    expect(mocks.profile).toHaveBeenCalled();
  });

  it("registers a new account and maps Firebase validation errors", async () => {
    mocks.register.mockRejectedValueOnce({ code: "auth/email-already-in-use" });
    render(<HomePage />);
    fireEvent.click(screen.getByRole("tab", { name: "Create account" }));
    fillCredentials();
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("An account already uses this email");
    expect(screen.getByLabelText("Animated Kumo mascot")).toHaveAttribute("context", "error");
  });

  it("validates and sends password reset requests", async () => {
    render(<HomePage />);
    fireEvent.click(screen.getByRole("button", { name: "Forgot password?" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Enter your email first");
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "user@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Forgot password?" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Password reset email sent");
    expect(screen.getByLabelText("Animated Kumo mascot")).toHaveAttribute("context", "success");
  });

  it("reports Google authentication failures", async () => {
    mocks.googleRedirect.mockRejectedValueOnce(new Error("Redirect failed"));
    render(<HomePage />);
    fireEvent.click(screen.getByRole("button", { name: "Continue with Google" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Redirect failed");
    expect(screen.getByLabelText("Animated Kumo mascot")).toHaveAttribute("context", "error");
  });

  it("uses redirect authentication", async () => {
    render(<HomePage />);
    fireEvent.click(screen.getByRole("button", { name: "Continue with Google" }));
    await waitFor(() => expect(mocks.googleRedirect).toHaveBeenCalledWith({}, {}));
  });

  it("reports errors returned after a Google redirect", async () => {
    mocks.redirectResult.mockRejectedValueOnce(new Error("Redirect was rejected"));
    render(<HomePage />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Redirect was rejected");
  });

  it.each([
    ["auth/invalid-credential", "The email or password is incorrect."],
    ["auth/wrong-password", "The email or password is incorrect."],
    ["auth/user-not-found", "The email or password is incorrect."],
    ["auth/weak-password", "Use a password with at least six characters."],
    ["auth/unknown", "Authentication failed. Please try again."],
  ])("maps the %s sign-in failure", async (code, message) => {
    mocks.signIn.mockRejectedValueOnce({ code });
    render(<HomePage />);
    fillCredentials();
    fireEvent.submit(screen.getByRole("button", { name: "Sign in" }).closest("form")!);
    expect(await screen.findByRole("alert")).toHaveTextContent(message);
  });

  it.each([null, "offline", new Error("without a Firebase code")])("handles unstructured authentication failures", async (failure) => {
    mocks.signIn.mockRejectedValueOnce(failure);
    render(<HomePage />);
    fillCredentials();
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Authentication failed. Please try again.");
  });

  it("clears feedback when switching modes and exposes the loading state", async () => {
    let finish!: () => void;
    mocks.signIn.mockImplementationOnce(() => new Promise<void>((resolve) => { finish = resolve; }));
    render(<HomePage />);
    fireEvent.click(screen.getByRole("button", { name: "Forgot password?" }));
    fireEvent.click(screen.getByRole("tab", { name: "Create account" }));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: "Sign in" }));
    fillCredentials();
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect(screen.getByRole("button", { name: "Please wait" })).toBeDisabled();
    expect(screen.getByLabelText("Animated Kumo mascot")).toHaveAttribute("context", "loading");
    finish();
    await waitFor(() => expect(screen.getByRole("button", { name: "Sign in" })).toBeEnabled());
  });

  it("reports reset and non-Error Google failures", async () => {
    mocks.reset.mockRejectedValueOnce(new Error("reset failed"));
    render(<HomePage />);
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "user@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Forgot password?" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("We couldn't send a reset email");
    mocks.googleRedirect.mockRejectedValueOnce("redirect failed");
    fireEvent.click(screen.getByRole("button", { name: "Continue with Google" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Authentication with Google failed."));
  });

  it("consumes local Google results, including empty returns", async () => {
    mocks.hasLocal.mockReturnValue(true);
    mocks.consumeLocal.mockReturnValueOnce(null);
    const empty = render(<HomePage />);
    await waitFor(() => expect(mocks.consumeLocal).toHaveBeenCalled());
    expect(mocks.redirectResult).not.toHaveBeenCalled();
    empty.unmount();

    mocks.consumeLocal.mockReturnValueOnce({ returnUrl: "/returned", credential: { providerId: "google.com" } });
    render(<HomePage />);
    await waitFor(() => expect(mocks.credential).toHaveBeenCalledWith({}, { providerId: "google.com" }));
    expect(window.location.pathname).toBe("/returned");
    expect(mocks.profile).toHaveBeenCalled();
  });

  it("prepares local Google redirects and ignores redirect errors after unmount", async () => {
    mocks.usesLocal.mockReturnValue(true);
    mocks.prepareLocal.mockRejectedValueOnce(new Error("Local preparation failed"));
    const first = render(<HomePage />);
    fireEvent.click(screen.getByRole("button", { name: "Continue with Google" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Local preparation failed");
    first.unmount();

    let rejectRedirect!: (reason: unknown) => void;
    mocks.hasLocal.mockReturnValue(false);
    mocks.redirectResult.mockImplementationOnce(() => new Promise((_, reject) => { rejectRedirect = reject; }));
    const pending = render(<HomePage />);
    pending.unmount();
    rejectRedirect(new Error("Too late"));
    await Promise.resolve();
    expect(screen.queryByText("Too late")).not.toBeInTheDocument();
  });

  it("navigates to a prepared local Google redirect", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.usesLocal.mockReturnValue(true);
    render(<HomePage />);
    fireEvent.click(screen.getByRole("button", { name: "Continue with Google" }));
    await waitFor(() => expect(mocks.prepareLocal).toHaveBeenCalledWith("public-key", window.location.href, window.sessionStorage));
    await waitFor(() => expect(screen.getByRole("button", { name: "Continue with Google" })).toBeEnabled());
    consoleError.mockRestore();
  });

  it("uses the fallback message for non-Error redirect completion failures", async () => {
    mocks.redirectResult.mockRejectedValueOnce("redirect failed");
    render(<HomePage />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Authentication with Google failed.");
  });
});
