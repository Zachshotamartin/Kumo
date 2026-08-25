import { configureStore } from "@reduxjs/toolkit";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { Provider } from "react-redux";
import type { Shape } from "../../classes/shape";
import type { EditorActions } from "../../editor/useEditorActions";
import actionsReducer from "../../features/actions/actionsSlice";
import authReducer from "../../features/auth/authSlice";
import editorReducer, { setTextSelection } from "../../features/editor/editorSlice";
import selectedReducer, { setSelectedShapes } from "../../features/selected/selectedSlice";
import whiteBoardReducer, { setWhiteboardData } from "../../features/whiteBoard/whiteBoardSlice";
import { listBoards, type BoardSummary } from "../../services/boardRepository";
import { ColorField, InspectorPanelView, NumberField, inspectorValue } from "./InspectorPanel";

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

  it("normalizes nullish inspector values and keeps focused field drafts stable", () => {
    expect(inspectorValue("configured", "fallback")).toBe("configured");
    expect(inspectorValue(null, "fallback")).toBe("fallback");
    expect(inspectorValue(undefined, "fallback")).toBe("fallback");

    const onNumberCommit = vi.fn();
    const number = render(<NumberField label="Standalone number" value={5} onCommit={onNumberCommit} />);
    const numberInput = screen.getByLabelText("Standalone number");
    fireEvent.focus(numberInput);
    number.rerender(<NumberField label="Standalone number" value={9} onCommit={onNumberCommit} />);
    expect(numberInput).toHaveValue(5);
    fireEvent.blur(numberInput);
    number.rerender(<NumberField label="Standalone number" value={10} onCommit={onNumberCommit} />);
    expect(numberInput).toHaveValue(10);
    cleanup();

    const onColorCommit = vi.fn();
    const color = render(<ColorField label="Standalone color" value="#111111" onCommit={onColorCommit} />);
    const colorInput = screen.getByLabelText("Standalone color hex value");
    fireEvent.focus(colorInput);
    color.rerender(<ColorField label="Standalone color" value="#222222" onCommit={onColorCommit} />);
    expect(colorInput).toHaveValue("#111111");
    fireEvent.change(colorInput, { target: { value: "#abcdef" } });
    fireEvent.blur(colorInput);
    color.rerender(<ColorField label="Standalone color" value="#333333" onCommit={onColorCommit} />);
    expect(colorInput).toHaveValue("#333333");
    expect(onColorCommit).toHaveBeenCalledWith("#abcdef");
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
      { id: "owned", title: "Owned", ownerId: "me", role: "owner", visibility: "private", roomId: "board:owned", updatedAt: 3 },
    ]);
    const linked = rectangle("link", { type: "board", boardId: null, title: "Choose a destination" });
    const { actions } = renderInspector([linked], [linked.id]);
    const destination = await screen.findByLabelText("Destination");
    await waitFor(() => expect(destination).toHaveTextContent("Roadmap - shared"));
    expect(destination).toHaveTextContent("Owned - yours");
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
    fireEvent.change(screen.getByLabelText("Variable weight"), { target: { value: "650" } });
    fireEvent.change(screen.getByLabelText("Variable width"), { target: { value: "90" } });
    fireEvent.click(screen.getByRole("button", { name: "Ligatures" }));
    fireEvent.change(screen.getByLabelText("Positioning"), { target: { value: "absolute" } });
    fireEvent.change(screen.getByLabelText("Horizontal"), { target: { value: "left-right" } });
    fireEvent.change(screen.getByLabelText("Vertical"), { target: { value: "top-bottom" } });
    fireEvent.change(screen.getByLabelText("Grow"), { target: { value: "1" } });
    expect(actions.patchSelected).toHaveBeenCalledWith({ textAutoResize: "auto-height" });
    expect(actions.patchSelected).toHaveBeenCalledWith({ constraintHorizontal: "left-right" });
    expect(actions.patchSelected).toHaveBeenCalledWith({ fontAxes: { wght: 650 } });
    expect(actions.patchSelected).toHaveBeenCalledWith({ openTypeFeatures: { liga: false } });

    const vector = rectangle("vector", { type: "vector", vectorPoints: [{ id: "a", x: 0, y: 0 }, { id: "b", x: 20, y: 20 }, { id: "c", x: 40, y: 0 }], vectorPaths: [{ id: "path", pointIds: ["a", "b", "c"], closed: false }], vectorClosed: false });
    const vectorInspector = renderInspector([vector, rectangle("vector-sibling")], [vector.id]);
    fireEvent.click(screen.getByRole("checkbox", { name: "Closed path" }));
    fireEvent.change(screen.getByLabelText("Cap"), { target: { value: "round" } });
    fireEvent.change(screen.getByLabelText("Join"), { target: { value: "bevel" } });
    fireEvent.change(screen.getByLabelText("Align"), { target: { value: "inside" } });
    fireEvent.change(screen.getByLabelText("Stroke dash pattern"), { target: { value: "8, 4" } });
    fireEvent.click(screen.getByRole("button", { name: "Add vector branch" }));
    expect(vectorInspector.actions.patchSelected).toHaveBeenCalledWith({ vectorClosed: true });
    expect(vectorInspector.actions.patchSelected).toHaveBeenCalledWith({ strokeDash: [8, 4] });
    expect(vectorInspector.actions.commitShapes).toHaveBeenCalledWith(expect.arrayContaining([
      expect.objectContaining({ vectorPaths: expect.arrayContaining([expect.objectContaining({ pointIds: expect.arrayContaining(["a"]) })]) }),
      expect.objectContaining({ id: "vector-sibling" }),
    ]));
  });

  it("crops and filters images and records accessibility and handoff metadata", () => {
    const image = rectangle("image", { type: "image", imageFit: "crop", semanticRole: "image", backgroundImage: "data:image/png;base64,a" });
    const { actions } = renderInspector([image], [image.id]);
    fireEvent.change(screen.getByLabelText("Crop X %"), { target: { value: "25" } });
    fireEvent.change(screen.getByLabelText("Crop width %"), { target: { value: "50" } });
    fireEvent.change(screen.getByLabelText("Brightness"), { target: { value: "1.2" } });
    fireEvent.change(screen.getByLabelText("Alternative text"), { target: { value: "A product concept" } });
    fireEvent.change(screen.getByLabelText("Focus order"), { target: { value: "2" } });
    fireEvent.change(screen.getByLabelText("Status"), { target: { value: "ready" } });
    fireEvent.change(screen.getByLabelText("Annotation"), { target: { value: "Use ProductImage" } });
    fireEvent.change(screen.getByLabelText("Code component URL"), { target: { value: "https://example.com/component" } });
    expect(actions.patchSelected).toHaveBeenCalledWith({ imageCrop: { x: 0.25, y: 0, width: 1, height: 1 } });
    expect(actions.patchSelected).toHaveBeenCalledWith({ imageFilters: { brightness: 1.2, contrast: 1, saturation: 1, blur: 0 } });
    expect(actions.patchSelected).toHaveBeenCalledWith({ altText: "A product concept" });
    expect(actions.patchSelected).toHaveBeenCalledWith({ devStatus: "ready" });
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

  it("commits the remaining numeric, color, appearance, accessibility, and canvas controls", () => {
    const { actions, store } = renderInspector();
    fireEvent.change(screen.getByLabelText("Y"), { target: { value: "15" } });
    fireEvent.change(screen.getByLabelText("H"), { target: { value: "45" } });
    fireEvent.change(screen.getByLabelText("°"), { target: { value: "25" } });
    fireEvent.change(screen.getByLabelText("Radius"), { target: { value: "9" } });
    fireEvent.change(screen.getByLabelText("Semantic role"), { target: { value: "heading" } });
    const y = screen.getByLabelText("Y");
    fireEvent.focus(y);
    fireEvent.keyDown(y, { key: "Enter" });
    fireEvent.blur(y);
    const textHex = screen.getByLabelText("Text hex value");
    fireEvent.keyDown(textHex, { key: "Enter" });
    const picker = textHex.closest("label")!.querySelector("input[type='color']")!;
    fireEvent.focus(picker);
    fireEvent.blur(picker);
    expect(actions.setShapeGeometry).toHaveBeenCalledWith(expect.objectContaining({ id: "text" }), { y: 15 });
    expect(actions.setShapeGeometry).toHaveBeenCalledWith(expect.objectContaining({ id: "text" }), { height: 45 });

    cleanup();
    const canvas = renderInspector([], []);
    const rulersBefore = canvas.store.getState().editor.showRulers;
    fireEvent.click(screen.getByLabelText("Rulers and guides"));
    expect(canvas.store.getState().editor.showRulers).toBe(!rulersBefore);
    expect(store.getState().whiteBoard.id).toBe("board");
  });

  it("creates fills, edits every gradient stop and effect field, and handles the empty effect choice", () => {
    const solid = rectangle("solid", { backgroundColor: undefined, fillType: "solid", gradientStops: undefined });
    const first = renderInspector([solid], [solid.id]);
    fireEvent.change(screen.getByLabelText("Fill type"), { target: { value: "linear-gradient" } });
    expect(first.actions.patchSelected).toHaveBeenCalledWith(expect.objectContaining({
      fillType: "linear-gradient",
      gradientStops: expect.arrayContaining([expect.objectContaining({ position: 0 }), expect.objectContaining({ position: 1 })]),
    }));
    const effectChoice = screen.getByLabelText("Add effect");
    fireEvent.change(effectChoice, { target: { value: "" } });
    cleanup();

    const rich = rectangle("rich", {
      fillType: "linear-gradient", gradientAngle: undefined,
      gradientStops: [
        { id: "one", position: 0, color: "#111111", opacity: 1 },
        { id: "two", position: 1, color: "#222222", opacity: 1 },
      ],
      effects: [
        { id: "one", type: "drop-shadow", color: "#000000", x: 1, y: 2, blur: 3, spread: 4, visible: true },
        { id: "two", type: "inner-shadow", color: "#000000", x: 5, y: 6, blur: 7, spread: 8, visible: false },
      ],
    });
    const second = renderInspector([rich], [rich.id]);
    fireEvent.change(screen.getByLabelText("Gradient angle"), { target: { value: "70" } });
    fireEvent.change(screen.getByLabelText("Stop 2 hex value"), { target: { value: "#abcdef" } });
    fireEvent.change(screen.getAllByLabelText("At %")[1]!, { target: { value: "75" } });
    const effects = screen.getByText("Effects").closest("section")!;
    const rows = effects.querySelectorAll("div[class*='effectRow']");
    const secondEffect = rows[1] as HTMLElement;
    fireEvent.click(within(secondEffect).getByRole("checkbox"));
    fireEvent.change(within(secondEffect).getByLabelText("X"), { target: { value: "10" } });
    fireEvent.change(within(secondEffect).getByLabelText("Y"), { target: { value: "11" } });
    fireEvent.change(within(secondEffect).getByLabelText("Blur"), { target: { value: "12" } });
    fireEvent.change(within(secondEffect).getByLabelText("Spread"), { target: { value: "13" } });
    expect(second.actions.patchSelected).toHaveBeenCalled();
  });

  it("edits all image filters, crop coordinates, and fit mode", () => {
    const image = rectangle("image", {
      type: "image", imageFit: "crop",
      imageFilters: { brightness: 1.1, contrast: 1.2, saturation: 1.3, blur: 2 },
      imageCrop: { x: 0.1, y: 0.2, width: 0.7, height: 0.8 },
    });
    const { actions } = renderInspector([image], [image.id]);
    fireEvent.change(screen.getByLabelText("Fit"), { target: { value: "fit" } });
    fireEvent.change(screen.getByLabelText("Contrast"), { target: { value: "1.5" } });
    fireEvent.change(screen.getByLabelText("Saturation"), { target: { value: "1.6" } });
    fireEvent.change(screen.getByLabelText("Blur"), { target: { value: "4" } });
    fireEvent.change(screen.getByLabelText("Crop Y %"), { target: { value: "30" } });
    fireEvent.change(screen.getByLabelText("Crop height %"), { target: { value: "60" } });
    expect(actions.patchSelected).toHaveBeenCalledWith({ imageFit: "fit" });
    expect(actions.patchSelected).toHaveBeenCalledWith(expect.objectContaining({ imageCrop: expect.objectContaining({ y: 0.3 }) }));
  });

  it("converts and splits vector networks and safely ignores a missing branch origin", () => {
    const points = [{ id: "a", x: 0, y: 0 }, { id: "b", x: 20, y: 20 }, { id: "c", x: 40, y: 0 }];
    const plain = rectangle("plain-vector", { type: "vector", vectorPoints: points, vectorPaths: undefined, vectorClosed: true });
    const first = renderInspector([plain], [plain.id]);
    fireEvent.click(screen.getByRole("button", { name: "Convert to vector network" }));
    expect(first.actions.patchSelected).toHaveBeenCalledWith(expect.objectContaining({ vectorPaths: [expect.objectContaining({ closed: true })] }));
    cleanup();

    const network = rectangle("network", { type: "vector", vectorPoints: points, vectorPaths: [{ id: "path", pointIds: ["a", "b", "c"], closed: false }] });
    const second = renderInspector([network, rectangle("other")], [network.id]);
    fireEvent.click(screen.getByRole("button", { name: "Split path at midpoint" }));
    expect(second.actions.commitShapes).toHaveBeenCalled();
    cleanup();

    const missing = rectangle("missing", { type: "vector", vectorPoints: points, vectorPaths: [{ id: "path", pointIds: ["unknown", "b", "c"], closed: false }] });
    const third = renderInspector([missing], [missing.id]);
    fireEvent.click(screen.getByRole("button", { name: "Add vector branch" }));
    expect(third.actions.commitShapes).not.toHaveBeenCalled();
  });

  it("applies selected-character formatting and the remaining typography controls", () => {
    const { actions, store } = renderInspector([textShape, rectangle("other")], [textShape.id]);
    act(() => store.dispatch(setTextSelection({ shapeId: "text", start: 0, end: 4 })));
    fireEvent.click(screen.getByRole("button", { name: "Bold" }));
    fireEvent.click(screen.getByRole("button", { name: "Underline" }));
    fireEvent.change(screen.getByLabelText("Selection color hex value"), { target: { value: "#123456" } });
    fireEvent.change(screen.getByLabelText("Optical size"), { target: { value: "24" } });
    fireEvent.change(screen.getByLabelText("Slant"), { target: { value: "-5" } });
    fireEvent.click(screen.getByRole("button", { name: "Kerning" }));
    fireEvent.click(screen.getByRole("button", { name: "Contextual alternates" }));
    expect(actions.commitShapes).toHaveBeenCalledTimes(3);
    expect(actions.patchSelected).toHaveBeenCalledWith({ fontAxes: { opsz: 24 } });
  });

  it("routes every parent alignment and remaining multi-layer arrange command", () => {
    const nested = rectangle("nested", { parentId: "frame" });
    const first = renderInspector([nested], [nested.id]);
    ["Left", "Center X", "Right", "Top", "Center Y", "Bottom"].forEach((name) => fireEvent.click(screen.getByRole("button", { name })));
    expect(first.actions.alignSelected).toHaveBeenCalledTimes(6);
    cleanup();

    const shapes = [rectangle("1", { groupId: "group" }), rectangle("2", { groupId: "group", zIndex: 2 })];
    const second = renderInspector(shapes, ["1", "2"]);
    fireEvent.click(screen.getByRole("button", { name: "Front" }));
    fireEvent.click(screen.getByRole("button", { name: "Backward" }));
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    fireEvent.click(screen.getByRole("button", { name: "Ungroup" }));
    expect(second.actions.orderSelected).toHaveBeenCalledTimes(3);
  });

  it("ignores stale board-destination responses", async () => {
    let resolveBoards: (value: BoardSummary[]) => void = () => undefined;
    vi.mocked(listBoards).mockImplementationOnce(() => new Promise((resolve) => { resolveBoards = resolve; }));
    const linked = rectangle("link", { type: "board" });
    renderInspector([linked], [linked.id]);
    cleanup();
    await act(async () => { resolveBoards([]); await Promise.resolve(); });
  });

  it("normalizes explicit null legacy values across shape inspectors", () => {
    const nullText = {
      ...textShape,
      rotation: null, opacity: null, color: null, backgroundColor: null, fillType: null,
      borderColor: null, borderWidth: null, borderRadius: null, borderStyle: null, blendMode: null,
      effects: null, fontSize: null, lineHeight: null, letterSpacing: null, fontFamily: null,
      fontWeight: null, textAutoResize: null, fontAxes: null, openTypeFeatures: null,
      paragraphSpacing: null, textIndent: null, textCase: null, listStyle: null, textAlign: null,
      alignItems: null, textDecoration: null, semanticRole: null, focusOrder: null,
      devStatus: null, devAnnotation: null, codeComponentUrl: null, parentId: "frame",
      layoutPositioning: null, constraintHorizontal: null, constraintVertical: null, layoutGrow: null,
    } as unknown as Shape;
    renderInspector([nullText], [nullText.id]);
    expect(screen.getByLabelText("°")).toHaveValue(0);
    expect(screen.getByLabelText("Font family")).toHaveValue("Arial");
    expect(screen.getByLabelText("Positioning")).toHaveValue("auto");
    cleanup();

    const nullImage = {
      ...rectangle("legacy-image"), type: "image", imageFit: "crop",
      imageFilters: { brightness: null, contrast: null, saturation: null, blur: null },
      imageCrop: { x: null, y: null, width: null, height: null }, semanticRole: null, altText: null,
    } as unknown as Shape;
    renderInspector([nullImage], [nullImage.id]);
    expect(screen.getByLabelText("Brightness")).toHaveValue(1);
    expect(screen.getByLabelText("Crop width %")).toHaveValue(100);
    cleanup();

    const nullFrame = {
      ...rectangle("legacy-frame"), type: "frame", layoutMode: "vertical", clipContent: null,
      layoutGap: null, layoutCounterGap: null, paddingTop: null, paddingRight: null,
      paddingBottom: null, paddingLeft: null, layoutWrap: null, primaryAlign: null,
      counterAlign: null, horizontalSizing: null, verticalSizing: null,
    } as unknown as Shape;
    renderInspector([nullFrame], [nullFrame.id]);
    expect(screen.getByLabelText("Gap")).toHaveValue(12);
    expect(screen.getByLabelText("Width")).toHaveValue("fixed");
  });

  it("commits stroke color/width and covers non-Enter field keys", () => {
    const { actions } = renderInspector([rectangle("shape")], ["shape"]);
    const appearance = screen.getByText("Appearance").closest("section")!;
    fireEvent.change(within(appearance).getByLabelText("Stroke hex value"), { target: { value: "#334455" } });
    const numeric = appearance.querySelector("input[type='number']")!;
    fireEvent.change(numeric, { target: { value: "3" } });
    fireEvent.keyDown(numeric, { key: "Escape" });
    fireEvent.blur(within(appearance).getByLabelText("Stroke hex value"));
    expect(actions.patchSelected).toHaveBeenCalledWith({ borderColor: "#334455" });
    expect(actions.patchSelected).toHaveBeenCalledWith({ borderWidth: 3 });
  });
});
