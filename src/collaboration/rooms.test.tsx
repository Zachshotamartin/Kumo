import { configureStore } from "@reduxjs/toolkit";
import { act, render, screen } from "@testing-library/react";
import { Provider } from "react-redux";
import actionsReducer from "../features/actions/actionsSlice";
import authReducer from "../features/auth/authSlice";
import editorReducer from "../features/editor/editorSlice";
import selectedReducer from "../features/selected/selectedSlice";
import whiteBoardReducer, { setWhiteboardData } from "../features/whiteBoard/whiteBoardSlice";
import BoardRoom from "./BoardRoom";
import { LiveblocksRoot } from "./LiveblocksRoot";

const mocks = vi.hoisted(() => ({
  authEndpoint: undefined as undefined | ((room?: string) => Promise<unknown>),
  token: vi.fn(),
}));

vi.mock("@liveblocks/client", () => ({ LiveMap: class {} }));
vi.mock("@liveblocks/react", () => ({
  LiveblocksProvider: ({ authEndpoint, children }: { authEndpoint: (room?: string) => Promise<unknown>; children: React.ReactNode }) => {
    mocks.authEndpoint = authEndpoint;
    return <>{children}</>;
  },
}));
vi.mock("@liveblocks/react/suspense", () => ({
  RoomProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  ClientSideSuspense: ({ children }: { children: () => React.ReactNode }) => <>{children()}</>,
}));
vi.mock("../config/firebase", () => ({ auth: { currentUser: { getIdToken: mocks.token } } }));
vi.mock("./CollaborationBridge", () => ({ default: () => <div>Bridge</div> }));
vi.mock("./ConnectionTelemetryBridge", () => ({ ConnectionTelemetryBridge: () => <div>Telemetry</div> }));
vi.mock("../components/editor/EditorWorkspace", () => ({ default: () => <div>Workspace</div> }));

const store = () => configureStore({
  reducer: {
    auth: authReducer,
    whiteBoard: whiteBoardReducer,
    actions: actionsReducer,
    selected: selectedReducer,
    editor: editorReducer,
  },
});

describe("collaboration room providers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.history.replaceState({}, "", "/");
    sessionStorage.clear();
    mocks.token.mockResolvedValue("token");
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => vi.unstubAllGlobals());

  it("shows a connection state until a room is selected, then mounts the editor", () => {
    const appStore = store();
    const { rerender } = render(<Provider store={appStore}><BoardRoom /></Provider>);
    expect(screen.getByRole("status")).toHaveTextContent("Connecting to board");
    act(() => { appStore.dispatch(setWhiteboardData({ roomId: "board:one", id: "one" })); });
    rerender(<Provider store={appStore}><BoardRoom /></Provider>);
    expect(screen.getByText("Bridge")).toBeInTheDocument();
    expect(screen.getByText("Telemetry")).toBeInTheDocument();
    expect(screen.getByText("Workspace")).toBeInTheDocument();
  });

  it("authenticates Liveblocks rooms with the Firebase token", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ token: "liveblocks" }), { status: 200 }));
    render(<LiveblocksRoot><div>Child</div></LiveblocksRoot>);
    await expect(mocks.authEndpoint?.("board:one")).resolves.toEqual({ token: "liveblocks" });
    expect(fetch).toHaveBeenCalledWith("/api/liveblocks-auth", expect.objectContaining({
      headers: expect.objectContaining({ Authorization: "Bearer token", "X-Kumo-Session-Id": expect.any(String) }),
    }));
  });

  it("rejects missing sessions and API authorization failures", async () => {
    render(<LiveblocksRoot><div>Child</div></LiveblocksRoot>);
    mocks.token.mockResolvedValueOnce(undefined);
    await expect(mocks.authEndpoint?.("board:one")).rejects.toThrow("Authentication required");
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ error: "Denied" }), { status: 403 }));
    await expect(mocks.authEndpoint?.("board:one")).rejects.toThrow("Denied");
  });

  it("authorizes anonymous open sessions with their separately stored password", async () => {
    window.history.replaceState({}, "", "/?openSession=guest-token");
    sessionStorage.setItem("kumo:open-session-password:guest-token", "shared-secret");
    sessionStorage.setItem("kumo:open-session-guest:guest-token", "0123456789abcdef");
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ token: "guest-liveblocks" }), { status: 200 }));
    render(<LiveblocksRoot><div>Child</div></LiveblocksRoot>);
    await expect(mocks.authEndpoint?.("board:guest-board")).resolves.toEqual({ token: "guest-liveblocks" });
    expect(fetch).toHaveBeenCalledWith("/api/liveblocks-auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ room: "board:guest-board", openSessionToken: "guest-token", openSessionPassword: "shared-secret", openSessionGuestNonce: "0123456789abcdef" }),
    });
    expect(mocks.token).not.toHaveBeenCalled();
    window.history.replaceState({}, "", "/");
    sessionStorage.clear();
  });

  it("uses open-session defaults and maps authorization fallbacks", async () => {
    render(<LiveblocksRoot><div>Child</div></LiveblocksRoot>);
    window.history.replaceState({}, "", "/?openSession=guest-token");
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({}), { status: 403 }));
    await expect(mocks.authEndpoint?.()).rejects.toThrow("Open-session collaboration authorization failed");
    const openSessionBody = JSON.parse(vi.mocked(fetch).mock.calls.at(-1)?.[1]?.body as string) as Record<string, unknown>;
    expect(openSessionBody).toEqual({ openSessionToken: "guest-token", openSessionPassword: "", openSessionGuestNonce: expect.any(String) });

    window.history.replaceState({}, "", "/");
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({}), { status: 403 }));
    await expect(mocks.authEndpoint?.()).rejects.toThrow("Collaboration authorization failed");
  });
});
