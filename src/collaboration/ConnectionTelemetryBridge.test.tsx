import { configureStore } from "@reduxjs/toolkit";
import { act, render, waitFor } from "@testing-library/react";
import { Provider } from "react-redux";
import actionsReducer from "../features/actions/actionsSlice";
import authReducer from "../features/auth/authSlice";
import editorReducer from "../features/editor/editorSlice";
import selectedReducer from "../features/selected/selectedSlice";
import whiteBoardReducer, { setWhiteboardData } from "../features/whiteBoard/whiteBoardSlice";
import { ConnectionTelemetryBridge } from "./ConnectionTelemetryBridge";

const mocks = vi.hoisted(() => ({
  status: "connected",
  lostListener: undefined as undefined | ((event: "lost" | "failed" | "restored") => void),
  consume: vi.fn(),
  report: vi.fn(),
}));

vi.mock("@liveblocks/react", () => ({
  useStatus: () => mocks.status,
  useLostConnectionListener: (listener: typeof mocks.lostListener) => { mocks.lostListener = listener; },
}));
vi.mock("./connectionTelemetry", () => ({
  consumeCollaborationAuthAttempts: mocks.consume,
  reportCollaborationTelemetry: mocks.report,
}));

const testStore = () => {
  const store = configureStore({ reducer: {
    auth: authReducer, whiteBoard: whiteBoardReducer, actions: actionsReducer,
    selected: selectedReducer, editor: editorReducer,
  } });
  store.dispatch(setWhiteboardData({ id: "board", roomId: "board:board" }));
  return store;
};

describe("ConnectionTelemetryBridge", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.status = "connected";
    mocks.lostListener = undefined;
    mocks.consume.mockReturnValue({ attempts: 2, durationMs: 900 });
    mocks.report.mockResolvedValue(undefined);
  });

  it("reports retry recovery exactly once when the room reaches ready", async () => {
    const store = testStore();
    const view = render(<Provider store={store}><ConnectionTelemetryBridge /></Provider>);
    await waitFor(() => expect(mocks.report).toHaveBeenCalledWith(expect.objectContaining({
      event: "ready", attempts: 2, durationMs: 900,
    })));
    view.rerender(<Provider store={store}><ConnectionTelemetryBridge /></Provider>);
    expect(mocks.report).toHaveBeenCalledTimes(1);
  });

  it("records lost, failed, and restored connection outcomes", async () => {
    render(<Provider store={testStore()}><ConnectionTelemetryBridge /></Provider>);
    await waitFor(() => expect(mocks.lostListener).toBeTypeOf("function"));
    act(() => mocks.lostListener?.("lost"));
    act(() => mocks.lostListener?.("failed"));
    act(() => mocks.lostListener?.("restored"));
    await waitFor(() => expect(mocks.report).toHaveBeenCalledWith(expect.objectContaining({ event: "restored" })));
    expect(mocks.report).toHaveBeenCalledWith(expect.objectContaining({ event: "lost" }));
    expect(mocks.report).toHaveBeenCalledWith(expect.objectContaining({ event: "failed" }));
  });
});

