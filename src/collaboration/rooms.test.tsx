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
      headers: expect.objectContaining({ Authorization: "Bearer token" }),
    }));
  });

  it("rejects missing sessions and API authorization failures", async () => {
    render(<LiveblocksRoot><div>Child</div></LiveblocksRoot>);
    mocks.token.mockResolvedValueOnce(undefined);
    await expect(mocks.authEndpoint?.("board:one")).rejects.toThrow("Authentication required");
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ error: "Denied" }), { status: 403 }));
    await expect(mocks.authEndpoint?.("board:one")).rejects.toThrow("Denied");
  });
});
