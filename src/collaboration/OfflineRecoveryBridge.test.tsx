import { configureStore } from "@reduxjs/toolkit";
import { render, waitFor } from "@testing-library/react";
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
    const state = store();
    queueBoardMutation({ id: "settings", boardId: "board", createdAt: 1, kind: "settings", payload: { title: "Offline title" } });
    const view = render(<Provider store={state}><OfflineRecoveryBridge connectionStatus="disconnected" /></Provider>);
    expect(JSON.parse(window.localStorage.getItem("kumo:recovery:board") ?? "null")).toMatchObject({ boardId: "board", baseRevision: 4 });
    view.rerender(<Provider store={state}><OfflineRecoveryBridge connectionStatus="connected" /></Provider>);
    await waitFor(() => expect(updateBoardSettings).toHaveBeenCalledWith("board", { title: "Offline title" }));
  });

  it("does nothing before a board has been opened", () => {
    const state = store();
    state.dispatch(setWhiteboardData({ id: null }));
    render(<Provider store={state}><OfflineRecoveryBridge connectionStatus="disconnected" /></Provider>);
    expect(window.localStorage.length).toBe(0);
  });
});
