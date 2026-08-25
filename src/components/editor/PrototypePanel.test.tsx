import { configureStore } from "@reduxjs/toolkit";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Provider } from "react-redux";
import type { Shape } from "../../classes/shape";
import actionsReducer from "../../features/actions/actionsSlice";
import authReducer from "../../features/auth/authSlice";
import editorReducer from "../../features/editor/editorSlice";
import selectedReducer, { setSelectedShapes } from "../../features/selected/selectedSlice";
import whiteBoardReducer, { setWhiteboardData } from "../../features/whiteBoard/whiteBoardSlice";
import PrototypePanel from "./PrototypePanel";

const mocks = vi.hoisted(() => ({
  actions: { commitShapes: vi.fn() }, loadLinks: vi.fn(), createLink: vi.fn(), revokeLink: vi.fn(), clipboard: vi.fn(),
}));
vi.mock("../../editor/useEditorActions", () => ({ useEditorActions: () => mocks.actions }));
vi.mock("../../services/platformRepository", () => ({ loadPrototypeLinks: mocks.loadLinks, createPrototypeLink: mocks.createLink, revokePrototypeLink: mocks.revokeLink }));

const shape = (id: string, patch: Partial<Shape> = {}): Shape => ({
  id, type: "rectangle", name: id, x1: 0, y1: 0, x2: 200, y2: 120, width: 200, height: 120, level: 0, zIndex: 1, parentId: null, ...patch,
});

const renderPanel = () => {
  const store = configureStore({ reducer: { auth: authReducer, whiteBoard: whiteBoardReducer, actions: actionsReducer, selected: selectedReducer, editor: editorReducer } });
  store.dispatch(setWhiteboardData({
    id: "board", roomId: "board:board", role: "owner", title: "Prototype", shapes: [
      shape("start", { type: "frame", prototypeStart: true, prototypeInteractions: [{ id: "interaction", trigger: "click", action: "navigate", destinationId: "destination", transition: "dissolve", duration: 0.25 }] }),
      shape("destination", { type: "frame", name: "Destination" }),
      shape("board-object", { type: "board", title: "Roadmap", boardId: "roadmap" }),
      shape("variable", { type: "resource", resourceKind: "string-variable", resourceName: "State" }),
    ],
  }));
  store.dispatch(setSelectedShapes(["start"]));
  render(<Provider store={store}><PrototypePanel /></Provider>);
  return store;
};

describe("PrototypePanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: mocks.clipboard } });
    mocks.clipboard.mockResolvedValue(undefined);
    mocks.loadLinks.mockResolvedValue([{ id: "existing", board_id: "board", start_shape_id: "start", device_frame: "phone", expires_at: null, revoked_at: null, created_at: "" }]);
    mocks.createLink.mockResolvedValue({ link: { id: "created", board_id: "board", start_shape_id: "start", device_frame: "desktop", expires_at: null, revoked_at: null, created_at: "" }, token: "secret", url: "https://kumo.test/?prototype=secret" });
    mocks.revokeLink.mockResolvedValue({ revoked: true });
  });

  it("presents flows, changes starting points, and removes interactions", async () => {
    const store = renderPanel();
    fireEvent.click(screen.getByRole("button", { name: /Present prototype/ }));
    expect(store.getState().editor.presentationMode).toBe(true);
    fireEvent.click(screen.getByRole("checkbox", { name: "Flow starting point" }));
    expect(mocks.actions.commitShapes).toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Remove interaction" }));
    expect(mocks.actions.commitShapes).toHaveBeenCalledTimes(2);
    fireEvent.click(screen.getByRole("button", { name: "Close prototype" }));
    expect(store.getState().editor.rightPanel).toBe("properties");
    expect(await screen.findByText("phone presentation")).toBeVisible();
  });

  it("adds URL, keyboard, variable, conditional, and board interactions", async () => {
    renderPanel();
    const selects = await screen.findAllByRole("combobox");
    fireEvent.change(selects[0]!, { target: { value: "key-down" } });
    fireEvent.change(screen.getByLabelText("Prototype trigger key"), { target: { value: "Space" } });
    fireEvent.change(selects[1]!, { target: { value: "open-url" } });
    fireEvent.change(screen.getByDisplayValue("https://"), { target: { value: "https://kumo.test" } });
    fireEvent.change(screen.getByRole("combobox", { name: "Transition" }), { target: { value: "slide-left" } });
    fireEvent.click(screen.getByRole("button", { name: /Add interaction/ }));
    expect(mocks.actions.commitShapes).toHaveBeenCalledWith(expect.arrayContaining([expect.objectContaining({ id: "start", prototypeInteractions: expect.arrayContaining([expect.objectContaining({ trigger: "key-down", key: "Space", action: "open-url", url: "https://kumo.test", transition: "slide-left" })]) })]));

    fireEvent.change(screen.getByRole("combobox", { name: "Action" }), { target: { value: "set-variable" } });
    fireEvent.change(screen.getByRole("combobox", { name: "Variable" }), { target: { value: "variable" } });
    fireEvent.change(screen.getByRole("textbox", { name: "Value" }), { target: { value: "ready" } });
    fireEvent.click(screen.getByRole("checkbox", { name: "Run only when condition matches" }));
    fireEvent.click(screen.getByRole("button", { name: /Add interaction/ }));
    expect(mocks.actions.commitShapes).toHaveBeenCalledTimes(2);

    fireEvent.change(screen.getByRole("combobox", { name: "Action" }), { target: { value: "open-board" } });
    fireEvent.change(screen.getByRole("combobox", { name: "Board object" }), { target: { value: "board-object" } });
    fireEvent.click(screen.getByRole("button", { name: /Add interaction/ }));
    expect(mocks.actions.commitShapes).toHaveBeenCalledTimes(3);
  });

  it("creates, copies, and revokes presentation-only links", async () => {
    renderPanel();
    await screen.findByText("phone presentation");
    fireEvent.change(screen.getByRole("combobox", { name: "Device frame" }), { target: { value: "desktop" } });
    fireEvent.change(screen.getByLabelText("Optional password"), { target: { value: "secret" } });
    fireEvent.click(screen.getByRole("button", { name: /Create prototype link/ }));
    await waitFor(() => expect(mocks.createLink).toHaveBeenCalledWith("board", { startShapeId: "start", password: "secret", deviceFrame: "desktop" }));
    fireEvent.click(screen.getByRole("button", { name: /Copy prototype link/ }));
    await waitFor(() => expect(mocks.clipboard).toHaveBeenCalledWith("https://kumo.test/?prototype=secret"));
    fireEvent.click(screen.getAllByRole("button", { name: "Revoke" })[0]!);
    await waitFor(() => expect(mocks.revokeLink).toHaveBeenCalledWith("board", expect.any(String)));
  });
});
