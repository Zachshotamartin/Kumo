import { Provider } from "react-redux";
import { act, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import App from "./App";
import store from "./store";
import { logout } from "./features/auth/authSlice";
import { setWhiteboardData } from "./features/whiteBoard/whiteBoardSlice";

const mocks = vi.hoisted(() => ({
  observeAuth: vi.fn(),
  unsubscribe: vi.fn(),
  ensureProfile: vi.fn(),
  startObservability: vi.fn(),
  stopObservability: vi.fn(),
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

vi.mock("./components/workSpace/workSpace", () => ({ default: () => <div>Editor workspace</div> }));
vi.mock("./components/middlePage/middlePage", () => ({ default: () => <div>Board dashboard</div> }));
vi.mock("./components/editor/PrototypeShareView", () => ({ default: ({ token }: { token: string }) => <div>Prototype {token}</div> }));
vi.mock("./history/VersionShareView", () => ({ default: ({ versionId, token }: { versionId: string; token: string }) => <div>Version {versionId} {token}</div> }));
vi.mock("./components/editor/OpenSessionView", () => ({ default: ({ token }: { token: string }) => <div>Open session {token}</div> }));
vi.mock("./services/userRepository", () => ({ ensureUserProfile: mocks.ensureProfile }));
vi.mock("./platform/observability", () => ({ startObservability: mocks.startObservability }));

vi.mock("firebase/auth", () => ({
  onAuthStateChanged: (
    _auth: unknown,
    callback: (user: null) => void,
    onError: (error: unknown) => void
  ) => {
    mocks.observeAuth(callback, onError);
    return mocks.unsubscribe;
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
    store.dispatch(logout());
    store.dispatch(setWhiteboardData({ id: null }));
    mocks.observeAuth.mockImplementation((callback: (user: null) => void) => callback(null));
    mocks.ensureProfile.mockResolvedValue({ displayName: "Ada", username: "ada", avatarUrl: null });
    mocks.startObservability.mockReturnValue(mocks.stopObservability);
    window.history.replaceState({}, "", "/");
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

  it("initializes authentication errors, honors reduced motion, and unsubscribes", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: true } as MediaQueryList)));
    mocks.observeAuth.mockImplementation((_callback: unknown, onError: () => void) => onError());
    const rendered = render(<Provider store={store}><App /></Provider>);
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    vi.useRealTimers();
    expect(await screen.findByRole("heading", { name: /every board can lead somewhere/i })).toBeVisible();
    rendered.unmount();
    expect(mocks.unsubscribe).toHaveBeenCalledOnce();
    vi.unstubAllGlobals();
  });

  it("loads authenticated dashboards, profiles, observability, and the editor workspace", async () => {
    vi.useFakeTimers();
    mocks.observeAuth.mockImplementation((callback: (user: { uid: string; email: null }) => void) => callback({ uid: "owner", email: null }));
    const dashboard = render(<Provider store={store}><App /></Provider>);
    await act(async () => { await vi.advanceTimersByTimeAsync(2000); });
    vi.useRealTimers();
    expect(await screen.findByText("Board dashboard")).toBeVisible();
    expect(store.getState().auth).toMatchObject({ uid: "owner", email: "", displayName: "Ada" });
    expect(mocks.startObservability).toHaveBeenCalledOnce();
    dashboard.unmount();
    expect(mocks.stopObservability).toHaveBeenCalledOnce();

    vi.useFakeTimers();
    store.dispatch(setWhiteboardData({ id: "board" }));
    const workspace = render(<Provider store={store}><App /></Provider>);
    await act(async () => { await vi.advanceTimersByTimeAsync(2000); });
    vi.useRealTimers();
    expect(await screen.findByText("Editor workspace")).toBeVisible();
    workspace.unmount();
  });

  it("logs profile initialization failures without breaking the authenticated shell", async () => {
    vi.useFakeTimers();
    const error = new Error("profile offline");
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.ensureProfile.mockRejectedValue(error);
    mocks.observeAuth.mockImplementation((callback: (user: { uid: string; email: string }) => void) => callback({ uid: "owner", email: "owner@example.com" }));
    render(<Provider store={store}><App /></Provider>);
    await act(async () => { await vi.advanceTimersByTimeAsync(2000); });
    vi.useRealTimers();
    expect(await screen.findByText("Board dashboard")).toBeVisible();
    expect(consoleError).toHaveBeenCalledWith("Kumo could not initialize the authenticated profile.", error);
  });

  it.each([
    ["/?openSession=session-token", "Open session session-token"],
    ["/?versionToken=share-token&version=version-id", "Version version-id share-token"],
    ["/?prototype=prototype-token", "Prototype prototype-token"],
  ])("routes public share URL %s", async (url, expected) => {
    vi.useFakeTimers();
    window.history.replaceState({}, "", url);
    render(<Provider store={store}><App /></Provider>);
    await act(async () => { await vi.advanceTimersByTimeAsync(2000); });
    vi.useRealTimers();
    expect(await screen.findByText(expected)).toBeVisible();
  });
});
