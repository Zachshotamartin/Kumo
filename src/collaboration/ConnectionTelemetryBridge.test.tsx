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

  it("reports zero-duration failures and contains telemetry transport errors", async () => {
    const warning = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    mocks.report.mockRejectedValue(new Error("telemetry offline"));
    render(<Provider store={testStore()}><ConnectionTelemetryBridge /></Provider>);
    await waitFor(() => expect(mocks.lostListener).toBeTypeOf("function"));
    act(() => mocks.lostListener?.("failed"));
    await waitFor(() => expect(warning).toHaveBeenCalledWith(
      "Kumo could not record collaboration telemetry.",
      expect.any(Error)
    ));
    expect(mocks.report).toHaveBeenCalledWith(expect.objectContaining({ event: "failed", durationMs: 0 }));
    warning.mockRestore();
  });

  it("ignores connection events until both a board and room are selected", () => {
    const store = testStore();
    store.dispatch(setWhiteboardData({ id: null, roomId: null }));
    render(<Provider store={store}><ConnectionTelemetryBridge /></Provider>);
    act(() => mocks.lostListener?.("lost"));
    expect(mocks.report).not.toHaveBeenCalled();
  });

  it("records restoration from connection status when the callback is omitted", async () => {
    const store = testStore();
    const view = render(<Provider store={store}><ConnectionTelemetryBridge /></Provider>);
    await waitFor(() => expect(mocks.report).toHaveBeenCalledWith(expect.objectContaining({ event: "ready" })));
    mocks.report.mockClear();
    mocks.status = "reconnecting";
    view.rerender(<Provider store={store}><ConnectionTelemetryBridge /></Provider>);
    mocks.status = "connected";
    view.rerender(<Provider store={store}><ConnectionTelemetryBridge /></Provider>);
    await waitFor(() => expect(mocks.report).toHaveBeenCalledWith(expect.objectContaining({ event: "restored" })));
    act(() => mocks.lostListener?.("restored"));
    expect(mocks.report).toHaveBeenCalledTimes(1);
  });

  it("does not attribute a previous room outage to a newly opened board", async () => {
    const store = testStore();
    const view = render(<Provider store={store}><ConnectionTelemetryBridge /></Provider>);
    await waitFor(() => expect(mocks.report).toHaveBeenCalledWith(expect.objectContaining({ event: "ready" })));
    mocks.report.mockClear();
    mocks.status = "reconnecting";
    view.rerender(<Provider store={store}><ConnectionTelemetryBridge /></Provider>);
    act(() => {
      store.dispatch(setWhiteboardData({ id: "next-board", roomId: "board:next-board" }));
    });
    mocks.status = "connected";
    view.rerender(<Provider store={store}><ConnectionTelemetryBridge /></Provider>);
    await waitFor(() => expect(mocks.report).toHaveBeenCalledWith(expect.objectContaining({
      event: "ready", boardId: "next-board", roomId: "board:next-board",
    })));
    expect(mocks.report).not.toHaveBeenCalledWith(expect.objectContaining({ event: "restored" }));
  });
});
