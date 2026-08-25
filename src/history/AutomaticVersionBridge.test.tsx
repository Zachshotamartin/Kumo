import { configureStore } from "@reduxjs/toolkit";
import { act, render } from "@testing-library/react";
import { Provider } from "react-redux";
import actionsReducer from "../features/actions/actionsSlice";
import authReducer, { login } from "../features/auth/authSlice";
import editorReducer from "../features/editor/editorSlice";
import selectedReducer from "../features/selected/selectedSlice";
import whiteBoardReducer, { setWhiteboardData } from "../features/whiteBoard/whiteBoardSlice";
import { createBoardAutosave } from "../services/versionRepository";
import { AutomaticVersionBridge, AUTOSAVE_INTERVAL_MS } from "./AutomaticVersionBridge";

vi.mock("../services/versionRepository", () => ({ createBoardAutosave: vi.fn() }));

const renderBridge = (role: "owner" | "viewer" = "owner", uid = "owner") => {
  const store = configureStore({ reducer: { auth: authReducer, whiteBoard: whiteBoardReducer, actions: actionsReducer, selected: selectedReducer, editor: editorReducer } });
  store.dispatch(login({ uid, email: `${uid}@example.com` }));
  store.dispatch(setWhiteboardData({ id: "board", activeBranchId: "branch", role }));
  return render(<Provider store={store}><AutomaticVersionBridge /></Provider>);
};

describe("AutomaticVersionBridge", () => {
  beforeEach(() => { vi.useFakeTimers(); vi.clearAllMocks(); vi.mocked(createBoardAutosave).mockResolvedValue({ version: null, skipped: true }); });
  afterEach(() => vi.useRealTimers());

  it("saves on the recovery interval and when the page is backgrounded", async () => {
    renderBridge();
    await act(async () => { await vi.advanceTimersByTimeAsync(AUTOSAVE_INTERVAL_MS); });
    expect(createBoardAutosave).toHaveBeenCalledWith("board", "branch");
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
    document.dispatchEvent(new Event("visibilitychange"));
    expect(createBoardAutosave).toHaveBeenCalledTimes(2);
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
    document.dispatchEvent(new Event("visibilitychange"));
    expect(createBoardAutosave).toHaveBeenCalledTimes(2);
  });

  it("contains autosave failures so recovery continues", async () => {
    vi.mocked(createBoardAutosave).mockRejectedValueOnce(new Error("offline"));
    renderBridge();
    await act(async () => { await vi.advanceTimersByTimeAsync(AUTOSAVE_INTERVAL_MS); });
    expect(createBoardAutosave).toHaveBeenCalledOnce();
  });

  it("never writes versions for viewers", async () => {
    renderBridge("viewer");
    await act(async () => { await vi.advanceTimersByTimeAsync(AUTOSAVE_INTERVAL_MS); });
    expect(createBoardAutosave).not.toHaveBeenCalled();
  });

  it("does not call authenticated version APIs for temporary guests", async () => {
    renderBridge("owner", "guest:temporary");
    await act(async () => { await vi.advanceTimersByTimeAsync(AUTOSAVE_INTERVAL_MS); });
    expect(createBoardAutosave).not.toHaveBeenCalled();
  });
});
