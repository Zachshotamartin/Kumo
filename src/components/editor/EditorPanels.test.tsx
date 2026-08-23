import { configureStore } from "@reduxjs/toolkit";
import { fireEvent, render, screen } from "@testing-library/react";
import { Provider } from "react-redux";
import type { Shape } from "../../classes/shape";
import { buildLayerUnits } from "../../editor/layers";
import actionsReducer from "../../features/actions/actionsSlice";
import authReducer from "../../features/auth/authSlice";
import editorReducer from "../../features/editor/editorSlice";
import selectedReducer, { setSelectedShapes } from "../../features/selected/selectedSlice";
import whiteBoardReducer, { setWhiteboardData } from "../../features/whiteBoard/whiteBoardSlice";
import InspectorPanel from "./InspectorPanel";
import LayersPanel from "./LayersPanel";

const actions = vi.hoisted(() => ({
  canEdit: true,
  canUndo: false,
  canRedo: false,
  previewShapes: vi.fn(),
  cancelPreview: vi.fn(),
  commitShapes: vi.fn(),
  commitBoardPatch: vi.fn(),
  patchSelected: vi.fn(),
  addPage: vi.fn(),
  renameDocumentPage: vi.fn(),
  duplicateDocumentPage: vi.fn(),
  deleteDocumentPage: vi.fn(),
  sectionSelected: vi.fn(),
  collectSelectedSections: vi.fn(),
  booleanSelected: vi.fn(),
  maskSelected: vi.fn(),
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
}));

vi.mock("../../editor/useEditorActions", () => ({ useEditorActions: () => actions }));
vi.mock("../../services/boardRepository", () => ({ listBoards: vi.fn().mockResolvedValue([]) }));

const shape = (id: string, extra: Partial<Shape> = {}): Shape => ({
  id,
  name: id,
  type: "rectangle",
  x1: 0,
  y1: 0,
  x2: 20,
  y2: 20,
  width: 20,
  height: 20,
  level: 0,
  zIndex: Number(id) || 1,
  ...extra,
});

const renderPanel = (component: React.ReactNode, shapes: Shape[], selected: string[]) => {
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
  store.dispatch(setSelectedShapes(selected));
  render(<Provider store={store}>{component}</Provider>);
  return store;
};

describe("editor property panels", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    actions.canEdit = true;
  });

  it("renders the layer empty state without an interactive tree", () => {
    renderPanel(<LayersPanel />, [], []);
    expect(screen.getByText("Draw a shape to start this board.")).toBeVisible();
    expect(screen.queryByRole("list", { name: "Layer stack" })).not.toBeInTheDocument();
  });

  it("builds one front-to-back layer unit for every logical group", () => {
    const units = buildLayerUnits([
      shape("1", { zIndex: 1, groupId: "group" }),
      shape("2", { zIndex: 3, groupId: "group" }),
      shape("3", { zIndex: 2 }),
    ]);
    expect(units.map((unit) => unit.key)).toEqual(["group:group", "shape:3"]);
    expect(units[0]?.ids).toEqual(["2", "1"]);
  });

  it("routes Unlock through the explicit lock patch", () => {
    renderPanel(<InspectorPanel />, [shape("1", { locked: true })], ["1"]);
    fireEvent.click(screen.getByRole("button", { name: "Unlock" }));
    expect(actions.patchSelected).toHaveBeenCalledWith({ locked: false });
  });

  it("locks every member when a group layer is locked", () => {
    const group = [
      shape("1", { groupId: "group" }),
      shape("2", { groupId: "group" }),
    ];
    renderPanel(<LayersPanel />, group, ["1", "2"]);
    fireEvent.click(screen.getByRole("button", { name: "Lock 1" }));
    const committed = actions.commitShapes.mock.calls[0]?.[0] as Shape[];
    expect(committed.map((item) => item.locked)).toEqual([true, true]);
  });

  it("renders, selects, collapses, hides, and locks a logical group", () => {
    const group = [
      shape("1", { zIndex: 1, groupId: "group" }),
      shape("2", { zIndex: 2, groupId: "group" }),
      shape("3", { zIndex: 3 }),
    ];
    const store = renderPanel(<LayersPanel />, group, []);

    fireEvent.click(screen.getByRole("button", { name: "Group, 2 layers" }));
    expect(store.getState().selected.selectedShapes).toEqual(["2", "1"]);
    expect(screen.getByRole("button", { name: "1" })).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Collapse Group, 2 layers" }));
    expect(screen.queryByRole("button", { name: "1" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Expand Group, 2 layers" }));

    fireEvent.click(screen.getByRole("button", { name: "Hide Group, 2 layers" }));
    const hidden = actions.commitShapes.mock.calls.at(-1)?.[0] as Shape[];
    expect(hidden.filter((item) => item.groupId === "group").every((item) => item.hidden)).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "Lock Group, 2 layers" }));
    const locked = actions.commitShapes.mock.calls.at(-1)?.[0] as Shape[];
    expect(locked.filter((item) => item.groupId === "group").every((item) => item.locked)).toBe(true);
  });

  it("moves a group as one layer unit and exposes every arrange step", () => {
    const group = [
      shape("1", { zIndex: 2, groupId: "group" }),
      shape("2", { zIndex: 3, groupId: "group" }),
      shape("3", { zIndex: 1 }),
    ];
    renderPanel(<LayersPanel />, group, ["1", "2"]);
    fireEvent.click(screen.getByRole("button", { name: "Move Group, 2 layers backward" }));
    const committed = actions.commitShapes.mock.calls.at(-1)?.[0] as Shape[];
    expect(committed.slice().sort((a, b) => a.zIndex - b.zIndex).map((item) => item.id))
      .toEqual(["1", "2", "3"]);

    vi.clearAllMocks();
    renderPanel(<InspectorPanel />, group, ["1", "2"]);
    expect(screen.getByRole("button", { name: "Forward" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Backward" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Group" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Ungroup" }));
    expect(actions.ungroupSelected).toHaveBeenCalledOnce();
  });

  it("renames an ungrouped layer from the layer stack", () => {
    renderPanel(<LayersPanel />, [shape("1", { name: "Old name" })], []);
    fireEvent.doubleClick(screen.getByRole("button", { name: "Old name" }));
    const input = screen.getByRole("textbox", { name: "Rename Old name" });
    fireEvent.change(input, { target: { value: "New name" } });
    fireEvent.blur(input);
    const committed = actions.commitShapes.mock.calls.at(-1)?.[0] as Shape[];
    expect(committed[0]?.name).toBe("New name");
  });

  it("cancels a layer rename without committing a draft", () => {
    renderPanel(<LayersPanel />, [shape("1", { name: "Original" })], []);
    fireEvent.doubleClick(screen.getByRole("button", { name: "Original" }));
    const input = screen.getByRole("textbox", { name: "Rename Original" });
    fireEvent.change(input, { target: { value: "Discarded" } });
    fireEvent.keyDown(input, { key: "Escape" });
    expect(actions.commitShapes).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Original" })).toBeVisible();
  });

  it("renames every member of a logical group", () => {
    const group = [
      shape("1", { groupId: "group", groupName: "Group" }),
      shape("2", { groupId: "group", groupName: "Group" }),
    ];
    renderPanel(<LayersPanel />, group, []);
    fireEvent.doubleClick(screen.getByRole("button", { name: "Group, 2 layers" }));
    const input = screen.getByRole("textbox", { name: "Rename Group, 2 layers" });
    fireEvent.change(input, { target: { value: "Navigation" } });
    fireEvent.blur(input);
    const committed = actions.commitShapes.mock.calls.at(-1)?.[0] as Shape[];
    expect(committed.map((item) => item.groupName)).toEqual(["Navigation", "Navigation"]);
  });

  it("drag-reorders one logical layer behind another", () => {
    renderPanel(<LayersPanel />, [shape("1", { zIndex: 1 }), shape("2", { zIndex: 2 })], []);
    const source = screen.getByRole("button", { name: "2" });
    const target = screen.getByRole("button", { name: "1" }).closest("[role='listitem']");
    expect(target).not.toBeNull();
    const dataTransfer = {
      effectAllowed: "none",
      dropEffect: "none",
      setData: vi.fn(),
    };
    fireEvent.dragStart(source, { dataTransfer });
    fireEvent.dragOver(target!, { clientY: 1, dataTransfer });
    fireEvent.drop(target!, { clientY: 1, dataTransfer });
    const committed = actions.commitShapes.mock.calls.at(-1)?.[0] as Shape[];
    expect(committed.map((item) => item.id)).toEqual(["2", "1"]);
    expect(dataTransfer.setData).toHaveBeenCalledWith("text/plain", "shape:2");
  });

  it("shift-click removes an already-selected logical group", () => {
    const group = [
      shape("1", { groupId: "group" }),
      shape("2", { groupId: "group" }),
      shape("3"),
    ];
    const store = renderPanel(<LayersPanel />, group, ["1", "2", "3"]);
    fireEvent.click(screen.getByRole("button", { name: "Group, 2 layers" }), { shiftKey: true });
    expect(store.getState().selected.selectedShapes).toEqual(["3"]);
  });

  it("keeps layer mutations disabled for viewers", () => {
    actions.canEdit = false;
    renderPanel(<LayersPanel />, [shape("1")], []);
    expect(screen.getByRole("button", { name: "Hide 1" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Lock 1" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Move 1 forward" })).toBeDisabled();
  });

  it("adds, selects, renames, duplicates, and deletes document pages", () => {
    const first = shape("page-one", { type: "page-resource", name: "Page one", pageName: "Page one", pageOrder: 0, hidden: true, locked: true });
    const second = shape("page-two", { type: "page-resource", name: "Page two", pageName: "Page two", pageOrder: 1, hidden: true, locked: true });
    const content = shape("content", { pageId: first.id });
    const store = renderPanel(<LayersPanel />, [first, second, content], []);
    fireEvent.click(screen.getByRole("button", { name: "Add page" }));
    const pageName = screen.getByRole("textbox", { name: "Rename Page two" });
    fireEvent.focus(pageName);
    expect(store.getState().editor.currentPageId).toBe(second.id);
    fireEvent.change(pageName, { target: { value: "Flows" } });
    fireEvent.blur(pageName);
    fireEvent.click(screen.getByRole("button", { name: "Duplicate Page two" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete Page two" }));
    expect(actions.addPage).toHaveBeenCalled();
    expect(actions.renameDocumentPage).toHaveBeenCalledWith(second.id, "Flows");
    expect(actions.duplicateDocumentPage).toHaveBeenCalledWith(second.id);
    expect(actions.deleteDocumentPage).toHaveBeenCalledWith(second.id);
  });

  it("renders and operates nested frame layers", () => {
    const frame = shape("frame", { type: "frame", name: "Frame" });
    const child = shape("child", { name: "Child", parentId: frame.id });
    const store = renderPanel(<LayersPanel />, [frame, child], []);
    fireEvent.click(screen.getByRole("button", { name: "Child" }));
    expect(store.getState().selected.selectedShapes).toEqual([child.id]);
    fireEvent.click(screen.getByRole("button", { name: "Hide Child" }));
    fireEvent.click(screen.getByRole("button", { name: "Lock Child" }));
    fireEvent.doubleClick(screen.getByRole("button", { name: "Child" }));
    const rename = screen.getByRole("textbox", { name: "Rename Child" });
    fireEvent.change(rename, { target: { value: "Nested layer" } });
    fireEvent.keyDown(rename, { key: "Enter" });
    fireEvent.click(screen.getByRole("button", { name: "Collapse Frame" }));
    expect(screen.queryByRole("button", { name: "Child" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Expand Frame" }));
    expect(actions.commitShapes).toHaveBeenCalled();
  });
});
