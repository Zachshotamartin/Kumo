import { configureStore } from "@reduxjs/toolkit";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Provider } from "react-redux";
import type { Shape } from "../../classes/shape";
import { buildLayerUnits } from "../../editor/layers";
import actionsReducer from "../../features/actions/actionsSlice";
import authReducer from "../../features/auth/authSlice";
import editorReducer from "../../features/editor/editorSlice";
import selectedReducer, { setSelectedShapes } from "../../features/selected/selectedSlice";
import whiteBoardReducer, { setWhiteboardData } from "../../features/whiteBoard/whiteBoardSlice";
import InspectorPanel from "./InspectorPanel";
import LayersPanel, { layerDisplayName, layerDropClass, layerDropPlacement, layerUnitLabel } from "./LayersPanel";

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
    expect(buildLayerUnits([shape("first"), shape("second")]).map((unit) => unit.ids[0])).toEqual(["second", "first"]);
  });

  it("derives layer labels, rename drafts, drop placement, and drop styling", () => {
    const named = shape("named", { name: "Named" });
    const unnamed = shape("unnamed", { name: undefined, type: "text" });
    const group = shape("grouped", { groupId: "group", groupName: "Navigation" });
    const unnamedGroup = shape("unnamed-group", { groupId: "group", groupName: undefined });
    expect(layerUnitLabel({ key: "shape:named", groupId: null, ids: [named.id], members: [named] })).toBe("Named");
    expect(layerUnitLabel({ key: "shape:unnamed", groupId: null, ids: [unnamed.id], members: [unnamed] })).toBe("text");
    expect(layerUnitLabel({ key: "group:group", groupId: "group", ids: [group.id], members: [group] })).toBe("Navigation, 1 layers");
    expect(layerUnitLabel({ key: "group:group", groupId: "group", ids: [unnamedGroup.id], members: [unnamedGroup] })).toBe("Group, 1 layers");
    expect(layerDisplayName(true, group)).toBe("Navigation");
    expect(layerDisplayName(true, unnamedGroup)).toBe("Group");
    expect(layerDisplayName(false, named)).toBe("Named");
    expect(layerDisplayName(false, unnamed)).toBe("text");
    expect(layerDropPlacement(10, { top: 0, height: 100 })).toBe("front");
    expect(layerDropPlacement(90, { top: 0, height: 100 })).toBe("back");
    const front = layerDropClass({ key: "target", placement: "front" }, "target");
    const back = layerDropClass({ key: "target", placement: "back" }, "target");
    expect(front).not.toBe("");
    expect(back).not.toBe("");
    expect(front).not.toBe(back);
    expect(layerDropClass(null, "target")).toBe("");
    expect(layerDropClass({ key: "other", placement: "front" }, "target")).toBe("");
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
    // Drop must use the synchronous drag payload rather than waiting for a
    // React state render; WebKit can deliver drop immediately after dragstart.
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

  it("renders every layer icon and the visible/locked state variants", () => {
    renderPanel(<LayersPanel />, [
      shape("text", { type: "text", name: undefined, hidden: true, locked: true }),
      shape("ellipse", { type: "ellipse" }),
      shape("image", { type: "image" }),
      shape("board", { type: "board" }),
      shape("rectangle", { name: undefined }),
    ], []);
    expect(screen.getByRole("button", { name: "text" })).toBeVisible();
    expect(screen.getByRole("button", { name: "ellipse" })).toBeVisible();
    expect(screen.getByRole("button", { name: "image" })).toBeVisible();
    expect(screen.getByRole("button", { name: "board" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Show text" }));
    fireEvent.click(screen.getByRole("button", { name: "Unlock text" }));
    expect(actions.commitShapes).toHaveBeenCalledTimes(2);
    fireEvent.doubleClick(screen.getByRole("button", { name: "text" }));
    fireEvent.keyDown(screen.getByRole("textbox", { name: "Rename text" }), { key: "Escape" });
  });

  it("renames and cancels renames for members inside a logical group", () => {
    renderPanel(<LayersPanel />, [
      shape("1", { groupId: "group", groupName: null as unknown as string, name: undefined }),
      shape("2", { groupId: "group", groupName: null as unknown as string }),
    ], []);
    expect(screen.getByRole("button", { name: "Group, 2 layers" })).toBeVisible();
    fireEvent.doubleClick(screen.getByRole("button", { name: "rectangle" }));
    const first = screen.getByRole("textbox", { name: "Rename rectangle" });
    fireEvent.change(first, { target: { value: "   " } });
    fireEvent.blur(first);
    const committed = actions.commitShapes.mock.calls.at(-1)?.[0] as Shape[];
    expect(committed.find((item) => item.id === "1")?.name).toBe("rectangle");
    fireEvent.click(screen.getByRole("button", { name: "rectangle" }));
    fireEvent.click(screen.getByRole("button", { name: "Hide rectangle" }));

    fireEvent.doubleClick(screen.getByRole("button", { name: "2" }));
    const second = screen.getByRole("textbox", { name: "Rename 2" });
    fireEvent.keyDown(second, { key: "Escape" });
    expect(screen.getByRole("button", { name: "2" })).toBeVisible();
    fireEvent.doubleClick(screen.getByRole("button", { name: "Group, 2 layers" }));
    fireEvent.keyDown(screen.getByRole("textbox", { name: "Rename Group, 2 layers" }), { key: "Escape" });
    actions.canEdit = false;
    fireEvent.doubleClick(screen.getByRole("button", { name: "rectangle" }));
  });

  it("covers additive selection, viewer drag prevention, and every drag/drop placement", () => {
    const store = renderPanel(<LayersPanel />, [shape("1", { zIndex: 1 }), shape("2", { zIndex: 2 }), shape("3", { zIndex: 3 })], ["1"]);
    fireEvent.click(screen.getByRole("button", { name: "2" }), { shiftKey: true });
    expect(store.getState().selected.selectedShapes).toEqual(["1", "2"]);

    const transfer = { effectAllowed: "none", dropEffect: "none", setData: vi.fn() };
    const source = screen.getByRole("button", { name: "3" });
    const sourceItem = source.closest("[role='listitem']")!;
    const initialTarget = screen.getByRole("button", { name: "1" }).closest("[role='listitem']")!;
    fireEvent.dragOver(initialTarget, { clientY: 10, dataTransfer: transfer });
    fireEvent.dragStart(source, { dataTransfer: transfer });
    fireEvent.dragOver(sourceItem, { clientY: 10, dataTransfer: transfer });
    const target = screen.getByRole("button", { name: "1" }).closest("[role='listitem']")!;
    Object.defineProperty(target, "getBoundingClientRect", { configurable: true, value: () => ({ top: 100, height: 100 }) });
    fireEvent.dragOver(target, { clientY: 10, dataTransfer: transfer });
    expect(transfer.dropEffect).toBe("move");
    fireEvent.drop(target, { clientY: 10, dataTransfer: transfer });
    const backTarget = screen.getByRole("button", { name: "1" }).closest("[role='listitem']")!;
    Object.defineProperty(backTarget, "getBoundingClientRect", { configurable: true, value: () => ({ top: -100, height: 10 }) });
    fireEvent.dragStart(screen.getByRole("button", { name: "3" }), { dataTransfer: transfer });
    fireEvent.dragOver(backTarget, { clientY: 10, dataTransfer: transfer });
    fireEvent.drop(backTarget, { clientY: 10, dataTransfer: transfer });
    expect(actions.commitShapes).toHaveBeenCalled();
    fireEvent.dragEnd(source, { dataTransfer: transfer });
    fireEvent.click(screen.getByRole("button", { name: "Move 2 forward" }));

    actions.canEdit = false;
    const prevented = fireEvent.dragStart(source, { dataTransfer: transfer });
    expect(prevented).toBe(false);
    fireEvent.doubleClick(source);
  });

  it("operates nested groups, recursive frames, and their reorder controls", () => {
    const root = shape("root", { type: "frame", name: "Root", zIndex: 10 });
    const nested = shape("nested", { type: "section", name: "Nested", parentId: root.id, zIndex: 7 });
    const grandchild = shape("grandchild", { type: "text", name: "Grandchild", parentId: nested.id, zIndex: 6 });
    const memberOne = shape("member-one", { name: undefined, groupId: "nested-group", groupName: null as unknown as string, parentId: root.id, hidden: true, locked: true, zIndex: 5 });
    const memberTwo = shape("member-two", { groupId: "nested-group", groupName: null as unknown as string, parentId: root.id, hidden: true, locked: true, zIndex: 4 });
    renderPanel(<LayersPanel />, [root, nested, grandchild, memberOne, memberTwo], []);

    expect(screen.getByRole("button", { name: "Group, 2 layers" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Grandchild" })).toBeVisible();
    const nestedTransfer = { effectAllowed: "none", dropEffect: "none", setData: vi.fn() };
    const nestedSource = screen.getByRole("button", { name: "Group, 2 layers" });
    let nestedTarget = screen.getByRole("button", { name: "Nested" }).closest("div[style]")!;
    Object.defineProperty(nestedTarget, "getBoundingClientRect", { configurable: true, value: () => ({ top: 100, height: 100 }) });
    fireEvent.dragStart(nestedSource, { dataTransfer: nestedTransfer });
    nestedTarget = screen.getByRole("button", { name: "Nested" }).closest("div[style]")!;
    Object.defineProperty(nestedTarget, "getBoundingClientRect", { configurable: true, value: () => ({ top: 100, height: 100 }) });
    fireEvent.dragOver(nestedTarget, { clientY: 0, dataTransfer: nestedTransfer });
    fireEvent.drop(nestedTarget, { clientY: 0, dataTransfer: nestedTransfer });
    fireEvent.dragEnd(nestedSource, { dataTransfer: nestedTransfer });
    fireEvent.click(screen.getByRole("button", { name: "Collapse Group, 2 layers" }));
    fireEvent.click(screen.getByRole("button", { name: "Expand Group, 2 layers" }));
    fireEvent.click(screen.getByRole("button", { name: "Show Group, 2 layers" }));
    fireEvent.click(screen.getByRole("button", { name: "Unlock Group, 2 layers" }));
    fireEvent.click(screen.getByRole("button", { name: "Move Group, 2 layers forward" }));
    fireEvent.click(screen.getByRole("button", { name: "Move Group, 2 layers backward" }));

    fireEvent.doubleClick(screen.getByRole("button", { name: "Group, 2 layers" }));
    const groupName = screen.getByRole("textbox", { name: "Rename Group, 2 layers" });
    fireEvent.change(groupName, { target: { value: " " } });
    fireEvent.blur(groupName);
    expect((actions.commitShapes.mock.calls.at(-1)?.[0] as Shape[]).filter((item) => item.groupId === "nested-group").every((item) => item.groupName === "Group")).toBe(true);
    fireEvent.doubleClick(screen.getByRole("button", { name: "Group, 2 layers" }));
    fireEvent.keyDown(screen.getByRole("textbox", { name: "Rename Group, 2 layers" }), { key: "Escape" });

    fireEvent.click(screen.getByRole("button", { name: "Collapse Nested" }));
    expect(screen.queryByRole("button", { name: "Grandchild" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Expand Nested" }));
    fireEvent.doubleClick(screen.getByRole("button", { name: "Nested" }));
    const nestedName = screen.getByRole("textbox", { name: "Rename Nested" });
    fireEvent.change(nestedName, { target: { value: " " } });
    fireEvent.blur(nestedName);
    actions.canEdit = false;
    fireEvent.doubleClick(screen.getByRole("button", { name: "Nested" }));
  });

  it("selects the implicit page and commits explicit page names with Enter", () => {
    const implicitStore = renderPanel(<LayersPanel />, [shape("content")], ["content"]);
    fireEvent.click(screen.getByRole("button", { name: "Page 1" }));
    expect(implicitStore.getState().selected.selectedShapes).toEqual([]);
    cleanup();

    const page = shape("only-page", { type: "page-resource", name: "Only", pageName: "Only", pageOrder: 0, hidden: true, locked: true });
    renderPanel(<LayersPanel />, [page], []);
    const input = screen.getByRole("textbox", { name: "Rename Only" });
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "Renamed" } });
    fireEvent.keyDown(input, { key: "Enter" });
    fireEvent.blur(input);
    expect(actions.renameDocumentPage).toHaveBeenCalledWith("only-page", "Renamed");
    expect(screen.getByRole("button", { name: "Delete Only" })).toBeDisabled();
  });
});
