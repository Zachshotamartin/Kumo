import { Provider } from "react-redux";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import App from "./App";
import store from "./store";

const mocks = vi.hoisted(() => ({
  observeAuth: vi.fn(),
}));

vi.mock("./config/firebase", () => ({
  auth: {},
  provider: {},
}));

vi.mock("firebase/auth", () => ({
  onAuthStateChanged: (
    _auth: unknown,
    callback: (user: null) => void,
    onError: (error: unknown) => void
  ) => {
    mocks.observeAuth(callback, onError);
    return () => undefined;
  },
  signInWithEmailAndPassword: vi.fn(),
  signInWithRedirect: vi.fn(),
  signInWithPopup: vi.fn(),
  getRedirectResult: vi.fn().mockResolvedValue(null),
  createUserWithEmailAndPassword: vi.fn(),
  sendPasswordResetEmail: vi.fn(),
}));

describe("App", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.observeAuth.mockImplementation((callback: (user: null) => void) => callback(null));
  });

  it("uses the approved animated Kumo lockup while Firebase restores the session", () => {
    mocks.observeAuth.mockImplementationOnce(() => undefined);
    const { container } = render(
      <Provider store={store}>
        <App />
      </Provider>
    );
    expect(screen.getByRole("status")).toHaveTextContent("KumoLoading workspace");
    expect(container.querySelector('kumo-logo[context="loading"]')).toBeInTheDocument();
  });

  it("renders the sign-in experience after auth initializes", async () => {
    render(
      <Provider store={store}>
        <App />
      </Provider>
    );
    expect(await screen.findByRole("heading", { name: /ideas move faster/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Sign in" })).toHaveAttribute("aria-selected", "true");
  });
});
