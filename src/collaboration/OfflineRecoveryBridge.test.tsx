import { configureStore } from "@reduxjs/toolkit";
import { act, render, waitFor } from "@testing-library/react";
import { Provider } from "react-redux";
import actionsReducer from "../features/actions/actionsSlice";
import authReducer from "../features/auth/authSlice";
import editorReducer from "../features/editor/editorSlice";
import selectedReducer from "../features/selected/selectedSlice";
import whiteBoardReducer, { setWhiteboardData } from "../features/whiteBoard/whiteBoardSlice";
import { queueBoardMutation } from "./offlineRecovery";
import { OfflineRecoveryBridge } from "./OfflineRecoveryBridge";
import { updateBoardSettings } from "../services/boardRepository";

vi.mock("../services/boardRepository", () => ({ updateBoardSettings: vi.fn().mockResolvedValue(undefined) }));

const store = () => {
  const result = configureStore({ reducer: { auth: authReducer, whiteBoard: whiteBoardReducer, actions: actionsReducer, selected: selectedReducer, editor: editorReducer } });
  result.dispatch(setWhiteboardData({
    id: "board", revision: 4, backGroundColor: "#111111",
    shapes: [{ id: "one", type: "rectangle", x1: 0, y1: 0, x2: 20, y2: 20, width: 20, height: 20, level: 0, zIndex: 1 }],
  }));
  return result;
};

describe("OfflineRecoveryBridge", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.clearAllMocks();
  });

  it("snapshots disconnected work and replays queued settings after reconnection", async () => {
    vi.useFakeTimers();
    const state = store();
    queueBoardMutation({ id: "settings", boardId: "board", createdAt: 1, kind: "settings", payload: { title: "Offline title" } });
    const view = render(<Provider store={state}><OfflineRecoveryBridge connectionStatus="disconnected" /></Provider>);
    expect(JSON.parse(window.localStorage.getItem("kumo:recovery:board") ?? "null")).toMatchObject({ boardId: "board", baseRevision: 4, baseShapes: [expect.objectContaining({ id: "one" })] });
    view.rerender(<Provider store={state}><OfflineRecoveryBridge connectionStatus="connected" /></Provider>);
    await vi.waitFor(() => expect(updateBoardSettings).toHaveBeenCalledWith("board", { title: "Offline title" }));
    expect(window.localStorage.getItem("kumo:recovery:board")).not.toBeNull();
    await vi.waitFor(() => expect(state.getState().editor.rightPanel).toBe("platform"));
    vi.useRealTimers();
  });

  it("does nothing before a board has been opened", () => {
    const state = store();
    state.dispatch(setWhiteboardData({ id: null }));
    render(<Provider store={state}><OfflineRecoveryBridge connectionStatus="disconnected" /></Provider>);
    expect(window.localStorage.length).toBe(0);
  });

  it("retains the recovery snapshot when a queued mutation still fails", async () => {
    vi.mocked(updateBoardSettings).mockRejectedValueOnce(new Error("offline"));
    const state = store();
    queueBoardMutation({ id: "failed", boardId: "board", createdAt: 1, kind: "settings", payload: { title: "Retry" } });
    const view = render(<Provider store={state}><OfflineRecoveryBridge connectionStatus="disconnected" /></Provider>);
    view.rerender(<Provider store={state}><OfflineRecoveryBridge connectionStatus="connected" /></Provider>);
    await waitFor(() => expect(updateBoardSettings).toHaveBeenCalled());
    expect(window.localStorage.getItem("kumo:recovery:board")).not.toBeNull();
  });

  it("opens recovery tools for hydrated work and uses current board data without a connected base", async () => {
    const state = store();
    const shapes = state.getState().whiteBoard.shapes;
    window.localStorage.setItem("kumo:recovery:board", JSON.stringify({
      boardId: "board", savedAt: 1, baseRevision: 1, baseBackgroundColor: "#000", backgroundColor: "#111111", baseShapes: shapes, shapes,
    }));
    const hydrated = render(<Provider store={state}><OfflineRecoveryBridge connectionStatus="connected" /></Provider>);
    await waitFor(() => expect(state.getState().editor.rightPanel).toBe("platform"));
    hydrated.unmount();

    state.dispatch(setWhiteboardData({ id: null }));
    const disconnected = render(<Provider store={state}><OfflineRecoveryBridge connectionStatus="disconnected" /></Provider>);
    act(() => { state.dispatch(setWhiteboardData({ id: "new-board", revision: 2, backGroundColor: "#222", shapes })); });
    await waitFor(() => expect(JSON.parse(window.localStorage.getItem("kumo:recovery:new-board") ?? "null")).toMatchObject({
      boardId: "new-board", baseBackgroundColor: "#222", baseShapes: [expect.objectContaining({ id: "one" })],
    }));
    disconnected.unmount();
  });
});
