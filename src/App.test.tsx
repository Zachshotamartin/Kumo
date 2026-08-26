import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";
import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import App from "./App";
import store from "./store";
import { logout } from "./features/auth/authSlice";
import authReducer from "./features/auth/authSlice";
import { setWhiteboardData } from "./features/whiteBoard/whiteBoardSlice";
import whiteBoardReducer from "./features/whiteBoard/whiteBoardSlice";

const mocks = vi.hoisted(() => ({
  observeAuth: vi.fn(),
  unsubscribe: vi.fn(),
  ensureProfile: vi.fn(),
  startObservability: vi.fn(),
  stopObservability: vi.fn(),
  signOut: vi.fn(),
  getBoard: vi.fn(),
}));

vi.mock("./config/firebase", () => ({
  auth: {},
  provider: {},
}));

vi.mock("./components/homepage/homePage", () => ({
  default: ({ authPending }: { authPending?: boolean }) => (
    <main>
      <h1>Every board can lead somewhere</h1>
      {authPending && <p role="status">Checking your existing session</p>}
      <button type="button" role="tab" aria-selected="true" disabled={authPending}>Sign in</button>
    </main>
  ),
}));

vi.mock("./components/workSpace/workSpace", () => ({ default: () => <div>Editor workspace</div> }));
vi.mock("./components/middlePage/middlePage", () => ({ default: () => <div>Board dashboard</div> }));
vi.mock("./components/editor/PrototypeShareView", () => ({ default: ({ token }: { token: string }) => <div>Prototype {token}</div> }));
vi.mock("./history/VersionShareView", () => ({ default: ({ versionId, token }: { versionId: string; token: string }) => <div>Version {versionId} {token}</div> }));
vi.mock("./components/editor/OpenSessionView", () => ({ default: ({ token }: { token: string }) => <div>Open session {token}</div> }));
vi.mock("./collaboration/LiveblocksRoot", () => ({ LiveblocksRoot: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock("./services/userRepository", () => ({ ensureUserProfile: mocks.ensureProfile }));
vi.mock("./services/boardRepository", () => ({ getBoard: mocks.getBoard }));
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
  signOut: mocks.signOut,
}));

describe("App", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    store.dispatch(logout());
    store.dispatch(setWhiteboardData({ id: null }));
    mocks.observeAuth.mockImplementation((callback: (user: null) => void) => callback(null));
    mocks.ensureProfile.mockResolvedValue({ displayName: "Ada", username: "ada", avatarUrl: null });
    mocks.startObservability.mockReturnValue(mocks.stopObservability);
    mocks.getBoard.mockResolvedValue({ id: "loaded", title: "Loaded" });
    window.history.replaceState({}, "", "/");
  });

  it("renders the public landing page while Firebase restores the session", async () => {
    mocks.observeAuth.mockImplementationOnce(() => undefined);
    const pendingStore = configureStore({
      reducer: { auth: authReducer, whiteBoard: whiteBoardReducer },
    });
    render(
      <Provider store={pendingStore}>
        <App />
      </Provider>
    );
    expect(await screen.findByRole("heading", { name: /every board can lead somewhere/i })).toBeVisible();
    expect(screen.getByRole("tab", { name: "Sign in" })).toBeDisabled();
    expect(screen.getByRole("status")).toHaveTextContent("Checking your existing session");
  });

  it("renders the initialized application without an artificial startup delay", async () => {
    render(
      <Provider store={store}>
        <App />
      </Provider>
    );
    expect(await screen.findByRole("heading", { name: /every board can lead somewhere/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Sign in" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "Sign in" })).toBeEnabled();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("initializes authentication errors and unsubscribes", async () => {
    mocks.observeAuth.mockImplementation((_callback: unknown, onError: () => void) => onError());
    const rendered = render(<Provider store={store}><App /></Provider>);
    expect(await screen.findByRole("heading", { name: /every board can lead somewhere/i })).toBeVisible();
    rendered.unmount();
    expect(mocks.unsubscribe).toHaveBeenCalledOnce();
  });

  it("loads authenticated dashboards, profiles, observability, and the editor workspace", async () => {
    mocks.observeAuth.mockImplementation((callback: (user: { uid: string; email: null }) => void) => callback({ uid: "owner", email: null }));
    const dashboard = render(<Provider store={store}><App /></Provider>);
    expect(await screen.findByText("Board dashboard")).toBeVisible();
    expect(store.getState().auth).toMatchObject({ uid: "owner", email: "", displayName: "Ada" });
    expect(mocks.startObservability).toHaveBeenCalledOnce();
    dashboard.unmount();
    expect(mocks.stopObservability).toHaveBeenCalledOnce();

    store.dispatch(setWhiteboardData({ id: "board" }));
    const workspace = render(<Provider store={store}><App /></Provider>);
    expect(await screen.findByText("Editor workspace")).toBeVisible();
    workspace.unmount();
  });

  it("logs profile initialization failures without breaking the authenticated shell", async () => {
    const error = new Error("profile offline");
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.ensureProfile.mockRejectedValue(error);
    mocks.observeAuth.mockImplementation((callback: (user: { uid: string; email: string }) => void) => callback({ uid: "owner", email: "owner@example.com" }));
    render(<Provider store={store}><App /></Provider>);
    expect(await screen.findByText("Board dashboard")).toBeVisible();
    expect(consoleError).toHaveBeenCalledWith("Kumo could not initialize the authenticated profile.", error);
  });

  it("signs out an explicitly unverified email identity before loading private UI", async () => {
    mocks.observeAuth.mockImplementation((callback: (user: { uid: string; email: string; emailVerified: boolean }) => void) => callback({ uid: "claimed", email: "claimed@example.com", emailVerified: false }));
    render(<Provider store={store}><App /></Provider>);
    expect(await screen.findByRole("heading", { name: /every board can lead somewhere/i })).toBeVisible();
    expect(mocks.signOut).toHaveBeenCalledWith({});
    expect(mocks.ensureProfile).not.toHaveBeenCalled();
  });

  it.each([
    ["/?openSession=session-token", "Open session session-token"],
    ["/?versionToken=share-token&version=version-id", "Version version-id share-token"],
    ["/?prototype=prototype-token", "Prototype prototype-token"],
  ])("routes public share URL %s", async (url, expected) => {
    window.history.replaceState({}, "", url);
    render(<Provider store={store}><App /></Provider>);
    expect(await screen.findByText(expected)).toBeVisible();
  });

  it("synchronizes browser back and forward navigation with loaded editor state", async () => {
    mocks.observeAuth.mockImplementation((callback: (user: { uid: string; email: string }) => void) => callback({ uid: "owner", email: "owner@example.com" }));
    store.dispatch(setWhiteboardData({ id: "current" }));
    const rendered = render(<Provider store={store}><App /></Provider>);
    await screen.findByText("Editor workspace");

    window.history.replaceState({}, "", "/?board=loaded");
    window.dispatchEvent(new PopStateEvent("popstate"));
    await waitFor(() => expect(store.getState().whiteBoard.id).toBe("loaded"));
    expect(mocks.getBoard).toHaveBeenCalledWith("loaded");

    mocks.getBoard.mockClear();
    window.dispatchEvent(new PopStateEvent("popstate"));
    expect(mocks.getBoard).not.toHaveBeenCalled();

    window.history.replaceState({}, "", "/");
    window.dispatchEvent(new PopStateEvent("popstate"));
    await waitFor(() => expect(store.getState().whiteBoard.id).toBeNull());
    rendered.unmount();
  });

  it("repairs failed board history entries and ignores loads after unmount", async () => {
    mocks.observeAuth.mockImplementation((callback: (user: { uid: string; email: string }) => void) => callback({ uid: "owner", email: "owner@example.com" }));
    store.dispatch(setWhiteboardData({ id: null }));
    mocks.getBoard.mockRejectedValueOnce(new Error("missing"));
    const rendered = render(<Provider store={store}><App /></Provider>);
    await screen.findByText("Board dashboard");
    window.history.replaceState({}, "", "/?board=missing");
    window.dispatchEvent(new PopStateEvent("popstate"));
    await waitFor(() => expect(new URL(window.location.href).searchParams.has("board")).toBe(false));
    expect(store.getState().whiteBoard.id).toBeNull();

    let resolveBoard!: (board: { id: string }) => void;
    mocks.getBoard.mockReturnValueOnce(new Promise((resolve) => { resolveBoard = resolve; }));
    window.history.replaceState({}, "", "/?board=late");
    window.dispatchEvent(new PopStateEvent("popstate"));
    rendered.unmount();
    resolveBoard({ id: "late" });
    await Promise.resolve();
    expect(store.getState().whiteBoard.id).toBeNull();
  });
});
