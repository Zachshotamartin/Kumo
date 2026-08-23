import { configureStore } from "@reduxjs/toolkit";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Provider } from "react-redux";
import type { Shape } from "../../classes/shape";
import type { EditorActions } from "../../editor/useEditorActions";
import actionsReducer from "../../features/actions/actionsSlice";
import authReducer from "../../features/auth/authSlice";
import editorReducer from "../../features/editor/editorSlice";
import selectedReducer, { setSelectedShapes } from "../../features/selected/selectedSlice";
import whiteBoardReducer, { setWhiteboardData } from "../../features/whiteBoard/whiteBoardSlice";
import { listBoards } from "../../services/boardRepository";
import { InspectorPanelView } from "./InspectorPanel";

vi.mock("../../services/boardRepository", () => ({ listBoards: vi.fn().mockResolvedValue([]) }));

const textShape: Shape = {
  id: "text",
  type: "text",
  name: "Product note",
  x1: 0,
  y1: 0,
  x2: 240,
  y2: 120,
  width: 240,
  height: 120,
  level: 0,
  zIndex: 1,
  color: "#f7f7f5",
  backgroundColor: "transparent",
  borderColor: "transparent",
  borderWidth: 0,
  fontSize: 18,
  fontFamily: "Arial",
  fontWeight: "normal",
  textAlign: "left",
  alignItems: "flex-start",
  textDecoration: "none",
  lineHeight: 1.2,
  letterSpacing: 0,
};

const rectangle = (id: string, extra: Partial<Shape> = {}): Shape => ({
  ...textShape,
  id,
  type: "rectangle",
  name: id,
  x2: 100,
  y2: 80,
  width: 100,
  height: 80,
  backgroundColor: "#f4f2ed",
  borderColor: "#17181a",
  ...extra,
});

const editorActions = (): EditorActions => ({
  canEdit: true,
  canUndo: false,
  canRedo: false,
  previewShapes: vi.fn(),
  cancelPreview: vi.fn(),
  commitShapes: vi.fn(),
  commitBoardPatch: vi.fn(),
  patchSelected: vi.fn(),
  removeSelected: vi.fn(),
  copySelected: vi.fn(),
  cutSelected: vi.fn(),
  paste: vi.fn(),
  duplicateSelected: vi.fn(),
  orderSelected: vi.fn(),
  alignSelected: vi.fn(),
  distributeSelected: vi.fn(),
  groupSelected: vi.fn(),
  ungroupSelected: vi.fn(),
  nudgeSelected: vi.fn(),
  undo: vi.fn(),
  redo: vi.fn(),
  setShapeGeometry: vi.fn(),
});

const renderInspector = (
  shapes: Shape[] = [textShape],
  selectedIds: string[] = [textShape.id]
) => {
  const store = configureStore({
    reducer: {
      auth: authReducer,
      whiteBoard: whiteBoardReducer,
      actions: actionsReducer,
      selected: selectedReducer,
      editor: editorReducer,
    },
  });
  store.dispatch(setWhiteboardData({ id: "board", role: "owner", shapes }));
  store.dispatch(setSelectedShapes(selectedIds));
  const actions = editorActions();
  render(<Provider store={store}><InspectorPanelView actions={actions} /></Provider>);
  return { actions, store };
};

describe("InspectorPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(listBoards).mockResolvedValue([]);
  });

  it("restores the complete text formatting controls", () => {
    const { actions } = renderInspector();

    expect(screen.getByLabelText("Text hex value")).toHaveValue("#f7f7f5");
    expect(screen.getByLabelText("Back hex value")).toHaveValue("transparent");
    fireEvent.change(screen.getByLabelText("Font family"), { target: { value: "Georgia" } });
    fireEvent.change(screen.getByLabelText("Font weight"), { target: { value: "bold" } });
    fireEvent.change(screen.getByLabelText("Stroke style"), { target: { value: "dashed" } });
    fireEvent.click(screen.getByRole("button", { name: "Align text to bottom" }));
    fireEvent.click(screen.getByRole("button", { name: "Overline text" }));
    fireEvent.click(screen.getByRole("group", { name: "Text alignment" }).querySelectorAll("button")[1]!);

    expect(actions.patchSelected).toHaveBeenCalledWith({ fontFamily: "Georgia" });
    expect(actions.patchSelected).toHaveBeenCalledWith({ fontWeight: "bold" });
    expect(actions.patchSelected).toHaveBeenCalledWith({ borderStyle: "dashed" });
    expect(actions.patchSelected).toHaveBeenCalledWith({ alignItems: "flex-end" });
    expect(actions.patchSelected).toHaveBeenCalledWith({ textDecoration: "overline" });
    expect(actions.patchSelected).toHaveBeenCalledWith({ textAlign: "center" });
  });

  it("accepts valid colors, ignores invalid colors, and updates the color picker", () => {
    const { actions } = renderInspector();
    const textColor = screen.getByLabelText("Text hex value");
    textColor.focus();
    fireEvent.change(textColor, { target: { value: "#b87a2e" } });
    expect(actions.patchSelected).toHaveBeenCalledWith({ color: "#b87a2e" });
    expect(textColor).toHaveFocus();
    const background = screen.getByLabelText("Back hex value");
    fireEvent.change(background, { target: { value: "#abcdef" } });
    fireEvent.change(background, { target: { value: "transparent" } });
    const stroke = screen.getByLabelText("Stroke hex value");
    fireEvent.change(stroke, { target: { value: "invalid" } });
    fireEvent.blur(stroke);
    const picker = document.querySelector("input[type='color']") as HTMLInputElement;
    fireEvent.change(picker, { target: { value: "#123456" } });

    expect(actions.patchSelected).toHaveBeenCalledWith({ color: "#b87a2e" });
    expect(actions.patchSelected).toHaveBeenCalledWith({ backgroundColor: "transparent" });
    expect(actions.patchSelected).toHaveBeenCalledWith({ color: "#123456" });
    expect(actions.patchSelected).not.toHaveBeenCalledWith({ borderColor: "invalid" });
  });

  it("commits clamped geometry and numeric appearance values", () => {
    const { actions } = renderInspector();
    const x = screen.getByLabelText("X");
    x.focus();
    fireEvent.change(x, { target: { value: "42" } });
    expect(actions.setShapeGeometry).toHaveBeenCalledWith(expect.objectContaining({ id: "text" }), { x: 42 });
    expect(x).toHaveFocus();
    fireEvent.change(screen.getByLabelText("W"), { target: { value: "0" } });
    fireEvent.change(screen.getByLabelText("α"), { target: { value: "120" } });
    fireEvent.change(screen.getByLabelText("Size"), { target: { value: "4" } });

    expect(actions.setShapeGeometry).toHaveBeenCalledWith(expect.objectContaining({ id: "text" }), { x: 42 });
    expect(actions.setShapeGeometry).toHaveBeenCalledWith(expect.objectContaining({ id: "text" }), { width: 1 });
    expect(actions.patchSelected).toHaveBeenCalledWith({ opacity: 1 });
    expect(actions.patchSelected).toHaveBeenCalledWith({ fontSize: 6 });
  });

  it("restores an invalid numeric draft instead of committing it", () => {
    const { actions } = renderInspector();
    const x = screen.getByLabelText("X") as HTMLInputElement;
    fireEvent.change(x, { target: { value: "not-a-number" } });
    fireEvent.blur(x);
    expect(x).toHaveValue(0);
    expect(actions.setShapeGeometry).not.toHaveBeenCalled();
  });

  it("routes every single-layer ordering, locking, and deletion action", () => {
    const { actions } = renderInspector([rectangle("shape")], ["shape"]);
    ["Front", "Forward", "Backward", "Back"].forEach((name) => {
      fireEvent.click(screen.getByRole("button", { name }));
    });
    fireEvent.click(screen.getByRole("button", { name: "Lock" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));

    expect(actions.orderSelected).toHaveBeenNthCalledWith(1, "front");
    expect(actions.orderSelected).toHaveBeenNthCalledWith(2, "forward");
    expect(actions.orderSelected).toHaveBeenNthCalledWith(3, "backward");
    expect(actions.orderSelected).toHaveBeenNthCalledWith(4, "back");
    expect(actions.patchSelected).toHaveBeenCalledWith({ locked: true });
    expect(actions.removeSelected).toHaveBeenCalledOnce();
  });

  it("edits board canvas preferences when nothing is selected", () => {
    const { actions, store } = renderInspector([], []);
    const background = screen.getByLabelText("Background hex value");
    fireEvent.change(background, { target: { value: "#121212" } });
    fireEvent.click(screen.getByLabelText("Show grid"));
    fireEvent.click(screen.getByLabelText("Snap to grid"));
    fireEvent.change(screen.getByLabelText("Grid"), { target: { value: "200" } });

    expect(actions.commitBoardPatch).toHaveBeenCalledWith({ backGroundColor: "#121212" });
    expect(store.getState().actions.grid).toBe(false);
    expect(store.getState().editor.snapToGrid).toBe(true);
    expect(store.getState().editor.gridSize).toBe(128);
  });

  it("routes multi-layer alignment, distribution, ordering, and grouping", () => {
    const shapes = [rectangle("1"), rectangle("2", { x1: 150, x2: 250, zIndex: 2 })];
    const { actions } = renderInspector(shapes, ["1", "2"]);
    ["Left", "Center X", "Right", "Top", "Center Y", "Bottom"].forEach((name) => {
      fireEvent.click(screen.getByRole("button", { name }));
    });
    fireEvent.click(screen.getByRole("button", { name: "Forward" }));
    fireEvent.click(screen.getByRole("button", { name: "Distribute X" }));
    fireEvent.click(screen.getByRole("button", { name: "Distribute Y" }));
    fireEvent.click(screen.getByRole("button", { name: "Group" }));

    expect(actions.alignSelected).toHaveBeenCalledTimes(6);
    expect(actions.orderSelected).toHaveBeenCalledWith("forward");
    expect(actions.distributeSelected).toHaveBeenCalledWith("horizontal");
    expect(actions.distributeSelected).toHaveBeenCalledWith("vertical");
    expect(actions.groupSelected).toHaveBeenCalledOnce();
  });

  it("loads linked-board destinations and commits the selected destination", async () => {
    vi.mocked(listBoards).mockResolvedValue([
      { id: "board", title: "Current", ownerId: "me", role: "owner", visibility: "private", roomId: "board:board", updatedAt: 1 },
      { id: "destination", title: "Roadmap", ownerId: "owner", role: "editor", visibility: "private", roomId: "board:destination", updatedAt: 2 },
    ]);
    const linked = rectangle("link", { type: "board", boardId: null, title: "Choose a destination" });
    const { actions } = renderInspector([linked], [linked.id]);
    const destination = await screen.findByLabelText("Destination");
    await waitFor(() => expect(destination).toHaveTextContent("Roadmap - shared"));
    expect(destination).not.toHaveTextContent("Current");
    fireEvent.change(destination, { target: { value: "destination" } });
    expect(actions.patchSelected).toHaveBeenCalledWith({
      boardId: "destination",
      title: "Roadmap",
      uid: "owner",
    });
    fireEvent.change(destination, { target: { value: "" } });
    expect(actions.patchSelected).toHaveBeenCalledWith({
      boardId: null,
      title: "Choose a destination",
      uid: null,
    });
  });

  it("keeps an existing linked destination visible and reports list failures", async () => {
    vi.mocked(listBoards).mockRejectedValue(new Error("offline"));
    const linked = rectangle("link", {
      type: "board",
      boardId: "existing",
      title: "Existing destination",
    });
    renderInspector([linked], [linked.id]);
    expect(screen.getByRole("option", { name: "Existing destination" })).toBeInTheDocument();
    expect(await screen.findByRole("alert")).toHaveTextContent("Board destinations could not be loaded.");
  });
});
