import { configureStore } from "@reduxjs/toolkit";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Provider } from "react-redux";
import type { Shape } from "../../classes/shape";
import actionsReducer from "../../features/actions/actionsSlice";
import authReducer, { login } from "../../features/auth/authSlice";
import editorReducer, { setCurrentPageId, setPresentationFrameId } from "../../features/editor/editorSlice";
import selectedReducer, { setSelectedShapes } from "../../features/selected/selectedSlice";
import whiteBoardReducer, { setWhiteboardData } from "../../features/whiteBoard/whiteBoardSlice";
import BranchesPanel from "./BranchesPanel";
import CommandPalette from "./CommandPalette";
import DesignLibraryPanel from "./DesignLibraryPanel";
import ExportPanel from "./ExportPanel";
import InspectPanel from "./InspectPanel";
import PresentationView from "./PresentationView";
import PrototypePanel from "./PrototypePanel";

const mocks = vi.hoisted(() => ({
  actions: {
    canEdit: true, commitShapes: vi.fn(), createComponentSelected: vi.fn(), createVariantSetSelected: vi.fn(),
    addComponentInstance: vi.fn(), resetSelectedInstance: vi.fn(), detachSelectedInstance: vi.fn(), swapSelectedVariant: vi.fn(),
    createStyleFromSelected: vi.fn(), applyStyleToSelected: vi.fn(), createLibraryVariable: vi.fn(), bindVariableToSelected: vi.fn(),
    groupSelected: vi.fn(), frameSelected: vi.fn(),
  },
  download: vi.fn(), png: vi.fn(), svgAssets: vi.fn(), pdf: vi.fn(), listBranches: vi.fn(), createBranch: vi.fn(), mergeBranch: vi.fn(), archiveBranch: vi.fn(),
  getBoard: vi.fn(), clipboard: vi.fn(),
}));

vi.mock("../../editor/useEditorActions", () => ({ useEditorActions: () => mocks.actions }));
vi.mock("../../editor/export", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../editor/export")>();
  return { ...original, downloadBlob: mocks.download, svgToPng: mocks.png, serializeSvgWithAssets: mocks.svgAssets, serializePdf: mocks.pdf };
});
vi.mock("../../services/branchRepository", () => ({
  listDesignBranches: mocks.listBranches, createDesignBranch: mocks.createBranch,
  mergeDesignBranch: mocks.mergeBranch, archiveDesignBranch: mocks.archiveBranch,
}));
vi.mock("../../services/boardRepository", () => ({ getBoard: mocks.getBoard }));

const shape = (id: string, type = "rectangle", patch: Partial<Shape> = {}): Shape => ({
  id, type, name: id, x1: 0, y1: 0, x2: 100, y2: 60, width: 100, height: 60,
  level: 0, zIndex: 1, parentId: null, backgroundColor: "#b87a2e", color: "#fff", ...patch,
});

const component = shape("component", "frame", { componentDefinition: true, componentName: "Button", componentSetId: "set", variantProperties: { State: "Default" } });
const variant = shape("variant", "frame", { componentDefinition: true, componentName: "Hover", componentSetId: "set", variantProperties: { State: "Hover" }, zIndex: 2 });
const instance = shape("instance", "frame", { instanceOf: component.id, instanceRootId: "instance", componentNodeId: component.id, zIndex: 3 });
const fill = shape("fill", "resource", { resourceKind: "fill-style", resourceName: "Brand fill", resourceValue: { backgroundColor: "#b87a2e" }, hidden: true, zIndex: 4 });
const variable = shape("variable", "resource", { resourceKind: "color-variable", resourceName: "Accent", resourceValue: { value: "#b87a2e" }, hidden: true, zIndex: 5 });
const frame = shape("frame", "frame", { prototypeStart: true, zIndex: 6 });
const target = shape("target", "frame", { x1: 200, x2: 300, zIndex: 7 });
const child = shape("child", "text", {
  parentId: frame.id, text: "Continue", zIndex: 8,
  prototypeInteractions: [{ id: "interaction", trigger: "click", action: "navigate", destinationId: target.id }],
});

const makeStore = (selected = instance.id) => {
  const store = configureStore({ reducer: { auth: authReducer, whiteBoard: whiteBoardReducer, actions: actionsReducer, selected: selectedReducer, editor: editorReducer } });
  store.dispatch(login({ uid: "owner", email: "owner@example.com" }));
  store.dispatch(setWhiteboardData({
    id: "board", roomId: "board:board", baseRoomId: "board:board", role: "owner", title: "Kumo board", type: "private",
    uid: "owner", shapes: [component, variant, instance, fill, variable, frame, target, child], revision: 0,
  }));
  store.dispatch(setSelectedShapes(selected ? [selected] : []));
  return store;
};

const renderWithStore = (ui: React.ReactNode, selected?: string) => {
  const store = makeStore(selected);
  render(<Provider store={store}>{ui}</Provider>);
  return store;
};

describe("new editor capability panels", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.png.mockResolvedValue(new Blob(["png"], { type: "image/png" }));
    mocks.svgAssets.mockResolvedValue("<svg/>");
    mocks.pdf.mockResolvedValue(new Uint8Array([1, 2, 3]));
    mocks.listBranches.mockResolvedValue([{ id: "branch", board_id: "board", name: "Exploration", room_id: "branch:branch", created_by: "owner", status: "open", created_at: new Date().toISOString(), updated_at: new Date().toISOString(), merged_at: null }]);
    mocks.createBranch.mockResolvedValue({ id: "new", board_id: "board", name: "Exploration", room_id: "branch:new", status: "open" });
    mocks.mergeBranch.mockResolvedValue({ merged: true, checkpointId: "checkpoint", revision: 42 });
    mocks.archiveBranch.mockResolvedValue({ archived: true });
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: mocks.clipboard.mockResolvedValue(undefined) } });
  });

  it("creates, inserts, styles, binds, resets, detaches, and swaps assets", () => {
    renderWithStore(<DesignLibraryPanel />);
    fireEvent.click(screen.getByRole("button", { name: /Create from selection/ }));
    fireEvent.click(screen.getByRole("button", { name: /Insert Button/ }));
    fireEvent.click(screen.getByRole("button", { name: "Reset overrides" }));
    fireEvent.click(screen.getByRole("button", { name: "Detach" }));
    fireEvent.change(screen.getByLabelText("Variant"), { target: { value: variant.id } });
    fireEvent.click(screen.getByRole("button", { name: "Fill" }));
    fireEvent.click(screen.getByRole("button", { name: /Brand fill/ }));
    fireEvent.click(screen.getByRole("button", { name: /Add color variable/ }));
    fireEvent.click(screen.getByRole("button", { name: /Bind Accent to fill/ }));
    expect(mocks.actions.createComponentSelected).toHaveBeenCalled();
    expect(mocks.actions.addComponentInstance).toHaveBeenCalledWith(component.id);
    expect(mocks.actions.swapSelectedVariant).toHaveBeenCalledWith(variant.id);
    expect(mocks.actions.applyStyleToSelected).toHaveBeenCalledWith(fill.id);
  });

  it("authors interactions, starting points, and opens presentation", () => {
    const store = renderWithStore(<PrototypePanel />, frame.id);
    fireEvent.click(screen.getByRole("checkbox", { name: "Flow starting point" }));
    fireEvent.click(screen.getByRole("button", { name: /Add interaction/ }));
    fireEvent.click(screen.getByRole("button", { name: /Present prototype/ }));
    expect(mocks.actions.commitShapes).toHaveBeenCalledTimes(2);
    expect(store.getState().editor.presentationMode).toBe(true);
  });

  it("searches layers and commands with the keyboard", () => {
    const store = renderWithStore(<CommandPalette />, child.id);
    fireEvent.keyDown(window, { key: "k", metaKey: true });
    const input = screen.getByRole("textbox", { name: "Search objects and commands" });
    fireEvent.change(input, { target: { value: "assets" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(store.getState().editor.rightPanel).toBe("assets");
    fireEvent.keyDown(window, { key: "p", ctrlKey: true });
    fireEvent.change(screen.getByRole("textbox", { name: "Search objects and commands" }), { target: { value: "Continue" } });
    fireEvent.keyDown(screen.getByRole("textbox", { name: "Search objects and commands" }), { key: "Enter" });
    expect(store.getState().selected.selectedShapes).toEqual([child.id]);
  });

  it("switches pages before selecting a command-palette search result", () => {
    const store = makeStore("");
    const pageOne = shape("page-one", "page-resource", { hidden: true, pageName: "One", pageOrder: 0 });
    const pageTwo = shape("page-two", "page-resource", { hidden: true, pageName: "Two", pageOrder: 1 });
    const remote = shape("remote", "rectangle", { name: "Remote object", pageId: pageTwo.id });
    store.dispatch(setWhiteboardData({ shapes: [pageOne, pageTwo, remote] }));
    store.dispatch(setCurrentPageId(pageOne.id));
    render(<Provider store={store}><CommandPalette /></Provider>);
    fireEvent.keyDown(window, { key: "k", metaKey: true });
    const input = screen.getByRole("textbox", { name: "Search objects and commands" });
    fireEvent.change(input, { target: { value: "Remote object" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(store.getState().editor.currentPageId).toBe(pageTwo.id);
    expect(store.getState().selected.selectedShapes).toEqual([remote.id]);
  });

  it("copies handoff code and token values", async () => {
    renderWithStore(<InspectPanel />, child.id);
    fireEvent.click(screen.getByRole("button", { name: "Copy CSS" }));
    fireEvent.click(screen.getByRole("button", { name: "#b87a2e" }));
    await waitFor(() => expect(mocks.clipboard).toHaveBeenCalledTimes(2));
    expect(screen.getByText(/\.kumo-text/)).toBeVisible();
  });

  it("exports all formats and imports a validated Kumo document", async () => {
    const store = renderWithStore(<ExportPanel />, "");
    fireEvent.click(screen.getByRole("button", { name: "SVG" }));
    fireEvent.click(screen.getByRole("button", { name: "PNG" }));
    fireEvent.click(screen.getByRole("button", { name: "PDF" }));
    fireEvent.click(screen.getByRole("button", { name: "Kumo" }));
    await waitFor(() => expect(mocks.download).toHaveBeenCalledTimes(4));
    const source = JSON.stringify({ format: "kumo-document", schemaVersion: 4, title: "Import", backgroundColor: "#000", shapes: [shape("imported")] });
    const file = new File([source], "import.kumo.json", { type: "application/json" });
    Object.defineProperty(file, "text", { value: vi.fn().mockResolvedValue(source) });
    fireEvent.change(screen.getByLabelText("Import Kumo document"), { target: { files: [file] } });
    await waitFor(() => expect(mocks.actions.commitShapes).toHaveBeenCalled());
    expect(store.getState().whiteBoard.id).toBe("board");
  });

  it("opens, creates, merges, archives, and leaves isolated branches", async () => {
    const store = renderWithStore(<BranchesPanel />);
    expect(await screen.findByText("Exploration")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Open" }));
    expect(store.getState().whiteBoard.activeBranchId).toBe("branch");
    fireEvent.click(screen.getByRole("button", { name: /Return to main/ }));
    fireEvent.click(screen.getByRole("button", { name: /Create from main/ }));
    await waitFor(() => expect(mocks.createBranch).toHaveBeenCalled());
    fireEvent.click(screen.getAllByRole("button", { name: "Merge Exploration" })[0]!);
    fireEvent.click(screen.getByRole("button", { name: "Confirm merge" }));
    await waitFor(() => expect(mocks.mergeBranch).toHaveBeenCalled());
    fireEvent.click(screen.getAllByRole("button", { name: "Archive Exploration" })[0]!);
    await waitFor(() => expect(mocks.archiveBranch).toHaveBeenCalled());
  });

  it("navigates and closes a presented prototype", () => {
    const store = makeStore("");
    store.dispatch(setPresentationFrameId(frame.id));
    render(<Provider store={store}><PresentationView /></Provider>);
    fireEvent.click(screen.getByRole("button", { name: child.name }));
    expect(screen.getByText(target.name!)).toBeVisible();
    fireEvent.keyDown(window, { key: "ArrowLeft" });
    expect(screen.getByText(frame.name!)).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Close presentation" }));
    expect(store.getState().editor.presentationMode).toBe(false);
  });

  it("orders prototype layers by z-index and only fires drag actions after movement", () => {
    const dragSource = shape("drag-source", "rectangle", {
      name: "Drag source", parentId: frame.id, zIndex: 2,
      prototypeInteractions: [{ id: "drag", trigger: "drag", action: "navigate", destinationId: target.id }],
    });
    const above = shape("above", "rectangle", { name: "Above", parentId: frame.id, zIndex: 20 });
    const store = makeStore("");
    store.dispatch(setWhiteboardData({ shapes: [frame, target, dragSource, above] }));
    store.dispatch(setPresentationFrameId(frame.id));
    render(<Provider store={store}><PresentationView /></Provider>);
    const dragButton = screen.getByRole("button", { name: "Drag source" });
    const aboveButton = screen.getByRole("button", { name: "Above" });
    expect(dragButton.compareDocumentPosition(aboveButton) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    fireEvent.pointerUp(dragButton, { clientX: 30, clientY: 30 });
    expect(screen.getByText(frame.name!)).toBeVisible();
    fireEvent.pointerDown(dragButton, { clientX: 10, clientY: 10 });
    fireEvent.pointerUp(dragButton, { clientX: 11, clientY: 11 });
    expect(screen.getByText(frame.name!)).toBeVisible();
    fireEvent.pointerDown(dragButton, { clientX: 10, clientY: 10 });
    fireEvent.pointerUp(dragButton, { clientX: 30, clientY: 30 });
    expect(screen.getByText(target.name!)).toBeVisible();
  });

  it("reports linked-board failures in prototype presentation", async () => {
    const link = shape("link", "board", {
      name: "Open roadmap", parentId: frame.id,
      prototypeInteractions: [{ id: "open", trigger: "click", action: "open-board", boardId: "missing" }],
    });
    mocks.getBoard.mockRejectedValueOnce(new Error("Board unavailable"));
    const store = makeStore("");
    store.dispatch(setWhiteboardData({ shapes: [frame, link] }));
    store.dispatch(setPresentationFrameId(frame.id));
    render(<Provider store={store}><PresentationView /></Provider>);
    fireEvent.click(screen.getByRole("button", { name: "Open roadmap" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Board unavailable");
  });
});
