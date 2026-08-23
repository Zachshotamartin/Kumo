import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import HomePage from "./homePage";

const mocks = vi.hoisted(() => ({
  signIn: vi.fn().mockResolvedValue(undefined),
  register: vi.fn().mockResolvedValue(undefined),
  google: vi.fn().mockResolvedValue(undefined),
  reset: vi.fn().mockResolvedValue(undefined),
  profile: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("firebase/auth", () => ({
  signInWithEmailAndPassword: mocks.signIn,
  createUserWithEmailAndPassword: mocks.register,
  signInWithPopup: mocks.google,
  sendPasswordResetEmail: mocks.reset,
}));
vi.mock("../../config/firebase", () => ({ auth: {}, provider: {} }));
vi.mock("../../services/userRepository", () => ({ ensureUserProfile: mocks.profile }));

describe("HomePage authentication", () => {
  beforeEach(() => vi.clearAllMocks());

  const fillCredentials = () => {
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: " user@example.com " } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "password" } });
  };

  it("signs in and provisions the application profile", async () => {
    render(<HomePage />);
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
    mocks.google.mockRejectedValueOnce(new Error("Popup closed"));
    render(<HomePage />);
    fireEvent.click(screen.getByRole("button", { name: "Continue with Google" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Popup closed");
    expect(screen.getByLabelText("Animated Kumo mascot")).toHaveAttribute("context", "error");
  });
});
