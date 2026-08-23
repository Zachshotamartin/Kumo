import { Provider } from "react-redux";
import { act, render, screen } from "@testing-library/react";
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

vi.mock("./components/homepage/homePage", () => ({
  default: () => (
    <main>
      <h1>Every board can lead somewhere</h1>
      <button type="button" role="tab" aria-selected="true">Sign in</button>
    </main>
  ),
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

  afterEach(() => vi.useRealTimers());

  it("uses the approved animated Kumo lockup while Firebase restores the session", () => {
    mocks.observeAuth.mockImplementationOnce(() => undefined);
    const { container } = render(
      <Provider store={store}>
        <App />
      </Provider>
    );
    expect(screen.getByRole("status")).toHaveTextContent("KumoOpening your canvas");
    expect(container.querySelector('kumo-logo[context="loading"]')).toBeInTheDocument();
  });

  it("keeps the authored startup visible before rendering the initialized app", async () => {
    vi.useFakeTimers();
    render(
      <Provider store={store}>
        <App />
      </Provider>
    );
    expect(screen.getByRole("status")).toHaveTextContent("Opening your canvas");
    await act(async () => { await vi.advanceTimersByTimeAsync(2000); });
    vi.useRealTimers();
    expect(await screen.findByRole("heading", { name: /every board can lead somewhere/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Sign in" })).toHaveAttribute("aria-selected", "true");
  });
});
