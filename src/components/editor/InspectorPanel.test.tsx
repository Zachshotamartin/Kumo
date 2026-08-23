import { configureStore } from "@reduxjs/toolkit";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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
  createComponentSelected: vi.fn(),
  createVariantSetSelected: vi.fn(),
  addComponentInstance: vi.fn(),
  detachSelectedInstance: vi.fn(),
  resetSelectedInstance: vi.fn(),
  swapSelectedVariant: vi.fn(),
  createStyleFromSelected: vi.fn(),
  applyStyleToSelected: vi.fn(),
  createLibraryVariable: vi.fn(),
  bindVariableToSelected: vi.fn(),
  booleanSelected: vi.fn(),
  flattenSelectedBoolean: vi.fn(),
  maskSelected: vi.fn(),
  releaseSelectedMask: vi.fn(),
  addPage: vi.fn(),
  renameDocumentPage: vi.fn(),
  duplicateDocumentPage: vi.fn(),
  deleteDocumentPage: vi.fn(),
  sectionSelected: vi.fn(),
  collectSelectedSections: vi.fn(),
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
  frameSelected: vi.fn(),
  unframeSelected: vi.fn(),
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

  it("updates gradients, effects, blend modes, and complete auto-layout settings immediately", () => {
    const frame = rectangle("frame", {
      type: "frame", layoutMode: "horizontal", layoutGap: 8, layoutCounterGap: 10,
      paddingTop: 12, paddingRight: 13, paddingBottom: 14, paddingLeft: 15,
      fillType: "linear-gradient", gradientAngle: 30,
      gradientStops: [{ id: "start", position: 0, color: "#ffffff", opacity: 1 }],
      effects: [{ id: "shadow", type: "drop-shadow", color: "#00000066", x: 1, y: 2, blur: 3, spread: 4, visible: true }],
    });
    const { actions } = renderInspector([frame], [frame.id]);
    fireEvent.change(screen.getByLabelText("Fill type"), { target: { value: "radial-gradient" } });
    fireEvent.change(screen.getByLabelText("Blend mode"), { target: { value: "multiply" } });
    fireEvent.change(screen.getByLabelText("Gradient angle"), { target: { value: "55" } });
    fireEvent.change(screen.getByLabelText("Stop 1 hex value"), { target: { value: "#123456" } });
    fireEvent.change(screen.getByLabelText("At %"), { target: { value: "40" } });

    const effects = screen.getByText("Effects").closest("section")!;
    fireEvent.click(within(effects).getByRole("checkbox"));
    ["X", "Y", "Blur", "Spread"].forEach((label, index) => {
      fireEvent.change(within(effects).getByLabelText(label), { target: { value: String(index + 6) } });
    });
    fireEvent.change(within(effects).getByLabelText("Add effect"), { target: { value: "inner-shadow" } });

    const frameSection = screen.getByText("Frame").closest("section")!;
    fireEvent.click(within(frameSection).getByRole("checkbox", { name: "Clip content" }));
    fireEvent.change(within(frameSection).getByLabelText("Auto layout"), { target: { value: "grid" } });
    ["Gap", "Row gap", "Top", "Right", "Bottom", "Left"].forEach((label, index) => {
      fireEvent.change(within(frameSection).getByLabelText(label), { target: { value: String(index + 20) } });
    });
    fireEvent.click(within(frameSection).getByRole("checkbox", { name: "Wrap" }));
    fireEvent.change(within(frameSection).getByLabelText("Main-axis alignment"), { target: { value: "space-between" } });
    fireEvent.change(within(frameSection).getByLabelText("Cross-axis alignment"), { target: { value: "stretch" } });
    fireEvent.change(within(frameSection).getByLabelText("Width"), { target: { value: "hug" } });
    fireEvent.change(within(frameSection).getByLabelText("Height"), { target: { value: "hug" } });
    fireEvent.click(within(frameSection).getByRole("button", { name: "Remove frame" }));

    expect(actions.patchSelected).toHaveBeenCalledWith({ layoutMode: "grid" });
    expect(actions.patchSelected).toHaveBeenCalledWith({ primaryAlign: "space-between" });
    expect(actions.patchSelected).toHaveBeenCalledWith({ counterAlign: "stretch" });
    expect(actions.unframeSelected).toHaveBeenCalledOnce();
  });

  it("updates advanced typography, parent constraints, and vector editing", () => {
    const nestedText = { ...textShape, parentId: "frame" };
    const { actions } = renderInspector([nestedText], [nestedText.id]);
    fireEvent.change(screen.getByLabelText("Line"), { target: { value: "1.5" } });
    fireEvent.change(screen.getByLabelText("Track"), { target: { value: "2" } });
    fireEvent.change(screen.getByLabelText("Text resizing"), { target: { value: "auto-height" } });
    fireEvent.change(screen.getByLabelText("Paragraph"), { target: { value: "12" } });
    fireEvent.change(screen.getByLabelText("Indent"), { target: { value: "16" } });
    fireEvent.change(screen.getByLabelText("Case"), { target: { value: "upper" } });
    fireEvent.change(screen.getByLabelText("List"), { target: { value: "bulleted" } });
    fireEvent.change(screen.getByLabelText("Positioning"), { target: { value: "absolute" } });
    fireEvent.change(screen.getByLabelText("Horizontal"), { target: { value: "left-right" } });
    fireEvent.change(screen.getByLabelText("Vertical"), { target: { value: "top-bottom" } });
    fireEvent.change(screen.getByLabelText("Grow"), { target: { value: "1" } });
    expect(actions.patchSelected).toHaveBeenCalledWith({ textAutoResize: "auto-height" });
    expect(actions.patchSelected).toHaveBeenCalledWith({ constraintHorizontal: "left-right" });

    const vector = rectangle("vector", { type: "vector", vectorPoints: [{ id: "node", x: 0, y: 0 }], vectorClosed: false });
    const vectorInspector = renderInspector([vector], [vector.id]);
    fireEvent.click(screen.getByRole("checkbox", { name: "Closed path" }));
    expect(vectorInspector.actions.patchSelected).toHaveBeenCalledWith({ vectorClosed: true });
  });

  it("releases boolean groups and masks and routes every multi-selection combine command", () => {
    const composite = rectangle("boolean", { type: "boolean", booleanOperation: "union", booleanChildren: [rectangle("source")] });
    const first = renderInspector([composite], [composite.id]);
    fireEvent.change(screen.getByLabelText("Operation"), { target: { value: "exclude" } });
    fireEvent.click(screen.getByRole("button", { name: "Release boolean group" }));
    expect(first.actions.flattenSelectedBoolean).toHaveBeenCalled();

    const masked = rectangle("mask", { isMask: true });
    const mask = renderInspector([masked], [masked.id]);
    fireEvent.click(screen.getByRole("button", { name: "Release mask" }));
    expect(mask.actions.releaseSelectedMask).toHaveBeenCalled();

    const sections = [rectangle("one", { type: "section" }), rectangle("two", { type: "section", zIndex: 2 })];
    const multi = renderInspector(sections, sections.map((item) => item.id));
    ["Frame selection", "Create section", "Collect sections", "Union", "Subtract", "Intersect", "Exclude", "Use as mask"].forEach((name) => {
      fireEvent.click(screen.getByRole("button", { name }));
    });
    expect(multi.actions.booleanSelected).toHaveBeenCalledTimes(4);
    expect(multi.actions.collectSelectedSections).toHaveBeenCalled();
  });
});
