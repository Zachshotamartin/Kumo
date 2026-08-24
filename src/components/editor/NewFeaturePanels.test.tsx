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
import { MAX_KUMO_IMPORT_BYTES } from "../../editor/import";
import ExportPanel from "./ExportPanel";
import InspectPanel from "./InspectPanel";
import PresentationView from "./PresentationView";
import PrototypePanel from "./PrototypePanel";

const mocks = vi.hoisted(() => ({
  actions: {
    canEdit: true, commitShapes: vi.fn(), createComponentSelected: vi.fn(), createVariantSetSelected: vi.fn(),
    addComponentInstance: vi.fn(), resetSelectedInstance: vi.fn(), detachSelectedInstance: vi.fn(), swapSelectedVariant: vi.fn(),
    createStyleFromSelected: vi.fn(), applyStyleToSelected: vi.fn(), createLibraryVariable: vi.fn(), bindVariableToSelected: vi.fn(),
    groupSelected: vi.fn(), frameSelected: vi.fn(), patchSelected: vi.fn(),
  },
  download: vi.fn(), png: vi.fn(), svgAssets: vi.fn(), pdf: vi.fn(), listBranches: vi.fn(), createBranch: vi.fn(), mergeBranch: vi.fn(), archiveBranch: vi.fn(), diffBranch: vi.fn(), reviewBranch: vi.fn(),
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
  diffDesignBranch: mocks.diffBranch, reviewDesignBranch: mocks.reviewBranch,
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
    mocks.diffBranch.mockResolvedValue({ diff: [{ shapeId: "child", status: "changed", name: "Continue" }] });
    mocks.reviewBranch.mockResolvedValue({ reviewed: true, status: "approved" });
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

  it("edits modes, aliases, and typed component properties from the assets panel", () => {
    const definition = shape("definition", "frame", {
      componentDefinition: true,
      componentName: "Card",
      componentProperties: {
        label: { type: "text", label: "Label", defaultValue: "Hello", targetNodeId: "definition-label" },
        visible: { type: "boolean", label: "Show content", defaultValue: true, targetNodeId: "definition-label" },
        nested: { type: "instance-swap", label: "Nested component", defaultValue: component.id, targetNodeId: "definition-nested", preferredValues: [component.id, variant.id] },
        slot: { type: "slot", label: "Slot content", defaultValue: "Body", targetNodeId: "definition-label" },
      },
    });
    const definitionLabel = shape("definition-label", "text", { parentId: definition.id, text: "Hello" });
    const definitionNested = shape("definition-nested", "frame", { parentId: definition.id, instanceOf: component.id });
    const cardInstance = shape("card-instance", "frame", { instanceOf: definition.id, instanceRootId: "card-instance" });
    const instanceLabel = shape("instance-label", "text", { instanceRootId: cardInstance.id, componentNodeId: definitionLabel.id, text: "Hello" });
    const instanceNested = shape("instance-nested", "frame", { instanceRootId: cardInstance.id, componentNodeId: definitionNested.id, instanceOf: component.id });
    const collection = shape("theme", "resource", { resourceKind: "variable-collection", resourceName: "Theme", resourceValue: { light: "Light", dark: "Dark" }, hidden: true });
    const accent = shape("accent", "resource", { resourceKind: "color-variable", resourceName: "Accent", resourceValue: { value: "#b87a2e" }, variableCollectionId: collection.id, variableModeValues: { light: "#ffffff", dark: "#17181a" }, hidden: true });
    const secondary = shape("secondary", "resource", { resourceKind: "color-variable", resourceName: "Secondary", resourceValue: { value: "#555555" }, variableCollectionId: collection.id, variableModeValues: { light: "#eeeeee", dark: "#222222" }, hidden: true });
    const store = makeStore("");
    store.dispatch(setWhiteboardData({ shapes: [component, variant, definition, definitionLabel, definitionNested, cardInstance, instanceLabel, instanceNested, collection, accent, secondary] }));
    store.dispatch(setSelectedShapes([cardInstance.id]));
    render(<Provider store={store}><DesignLibraryPanel /></Provider>);

    fireEvent.change(screen.getByLabelText("Label"), { target: { value: "Updated" } });
    fireEvent.click(screen.getByLabelText("Show content"));
    fireEvent.change(screen.getByLabelText("Nested component"), { target: { value: variant.id } });
    fireEvent.change(screen.getByLabelText("Slot content"), { target: { value: "New body" } });
    fireEvent.change(screen.getByLabelText("Active mode"), { target: { value: "dark" } });
    fireEvent.click(screen.getByRole("button", { name: "Add themed color" }));
    fireEvent.change(screen.getAllByLabelText("Alias")[0]!, { target: { value: secondary.id } });
    fireEvent.change(screen.getByLabelText("Accent Light value"), { target: { value: "#fefefe" } });

    expect(mocks.actions.patchSelected).toHaveBeenCalledWith({ activeVariableModes: { theme: "dark" } });
    expect(mocks.actions.commitShapes).toHaveBeenCalledWith(expect.arrayContaining([expect.objectContaining({ id: instanceLabel.id, text: "Updated" })]));
    expect(mocks.actions.commitShapes).toHaveBeenCalledWith(expect.arrayContaining([expect.objectContaining({ id: "accent", variableAliasId: "secondary" })]));
  });

  it("exposes text, visibility, nested instances, and slots as component properties", () => {
    const definition = shape("definition", "frame", { componentDefinition: true, componentName: "Card" });
    const label = shape("definition-label", "text", { parentId: definition.id, text: "Hello" });
    const nested = shape("definition-nested", "frame", { parentId: definition.id, instanceOf: component.id });
    const store = makeStore("");
    store.dispatch(setWhiteboardData({ shapes: [component, variant, definition, label, nested] }));
    store.dispatch(setSelectedShapes([definition.id]));
    render(<Provider store={store}><DesignLibraryPanel /></Provider>);
    fireEvent.click(screen.getByRole("button", { name: "Expose text" }));
    fireEvent.click(screen.getByRole("button", { name: "Expose visibility" }));
    fireEvent.click(screen.getByRole("button", { name: "Expose instance swap" }));
    fireEvent.click(screen.getByRole("button", { name: "Expose slot" }));
    expect(mocks.actions.commitShapes).toHaveBeenCalledTimes(4);
    expect(mocks.actions.commitShapes).toHaveBeenCalledWith(expect.arrayContaining([expect.objectContaining({
      id: definition.id,
      componentProperties: expect.objectContaining({ "slot-content": expect.objectContaining({ type: "slot" }) }),
    })]));
  });

  it("authors interactions, starting points, and opens presentation", () => {
    const store = renderWithStore(<PrototypePanel />, frame.id);
    fireEvent.click(screen.getByRole("checkbox", { name: "Flow starting point" }));
    fireEvent.click(screen.getByRole("button", { name: /Add interaction/ }));
    fireEvent.click(screen.getByRole("button", { name: /Present prototype/ }));
    expect(mocks.actions.commitShapes).toHaveBeenCalledTimes(2);
    expect(store.getState().editor.presentationMode).toBe(true);
  });

  it("authors keyboard-triggered conditional prototype actions", () => {
    renderWithStore(<PrototypePanel />, child.id);
    fireEvent.change(screen.getByLabelText("Trigger"), { target: { value: "key-down" } });
    fireEvent.change(screen.getByLabelText("Prototype trigger key"), { target: { value: "Space" } });
    fireEvent.click(screen.getByRole("button", { name: /Add interaction/ }));
    const committed = mocks.actions.commitShapes.mock.calls.at(-1)?.[0] as Shape[];
    expect(committed.find((candidate) => candidate.id === child.id)?.prototypeInteractions?.at(-1)).toMatchObject({ trigger: "key-down", key: "Space" });
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

  it("rejects an oversized Kumo document before reading it", async () => {
    renderWithStore(<ExportPanel />, "");
    const file = new File(["{}"], "oversized.kumo.json", { type: "application/json" });
    const text = vi.fn().mockResolvedValue("{}");
    Object.defineProperties(file, {
      size: { configurable: true, value: MAX_KUMO_IMPORT_BYTES + 1 },
      text: { configurable: true, value: text },
    });
    fireEvent.change(screen.getByLabelText("Import Kumo document"), { target: { files: [file] } });
    expect(await screen.findByRole("status")).toHaveTextContent("larger than the 10 MB import limit");
    expect(text).not.toHaveBeenCalled();
    expect(mocks.actions.commitShapes).not.toHaveBeenCalled();
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
    fireEvent.click(screen.getAllByRole("button", { name: "Review" })[0]!);
    expect(await screen.findByText("changed · Continue")).toBeVisible();
    fireEvent.change(screen.getByLabelText("Review note"), { target: { value: "Ready" } });
    fireEvent.click(screen.getByRole("button", { name: "Approve" }));
    await waitFor(() => expect(mocks.reviewBranch).toHaveBeenCalledWith("board", "branch", "approved", "Ready"));
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

  it("runs mouse-enter, mouse-leave, and keyboard prototype triggers", () => {
    const interactive = shape("multi-trigger", "rectangle", {
      name: "Trigger surface", parentId: frame.id,
      prototypeInteractions: [
        { id: "enter", trigger: "mouse-enter", action: "set-variable", variableId: "state", variableValue: "entered" },
        { id: "leave", trigger: "mouse-leave", action: "set-variable", variableId: "state", variableValue: "left" },
        { id: "key", trigger: "key-down", key: "Enter", action: "navigate", destinationId: target.id },
      ],
    });
    const state = shape("state", "resource", { hidden: true, resourceKind: "string-variable", resourceValue: { value: "idle" } });
    const store = makeStore("");
    store.dispatch(setWhiteboardData({ shapes: [frame, target, interactive, state] }));
    store.dispatch(setPresentationFrameId(frame.id));
    render(<Provider store={store}><PresentationView /></Provider>);
    const surface = screen.getByRole("button", { name: "Trigger surface" });
    fireEvent.mouseEnter(surface);
    fireEvent.mouseLeave(surface);
    fireEvent.keyDown(window, { key: "Enter" });
    expect(screen.getByText(target.name!)).toBeVisible();
  });

  it("renders subtract and intersect prototypes with real SVG masks and clipping", () => {
    const sources = [
      shape("source-one", "rectangle", { x1: 10, y1: 10, x2: 90, y2: 50 }),
      shape("source-two", "ellipse", { x1: 30, y1: 10, x2: 80, y2: 50 }),
    ];
    const subtract = shape("subtract", "boolean", {
      name: "Subtract boolean", parentId: frame.id, booleanOperation: "subtract", booleanChildren: sources,
    });
    const intersect = shape("intersect", "boolean", {
      name: "Intersect boolean", parentId: frame.id, booleanOperation: "intersect", booleanChildren: sources,
      x1: 110, x2: 210,
    });
    const store = makeStore("");
    store.dispatch(setWhiteboardData({ shapes: [frame, subtract, intersect] }));
    store.dispatch(setPresentationFrameId(frame.id));
    render(<Provider store={store}><PresentationView /></Provider>);

    const subtractSvg = screen.getByRole("button", { name: "Subtract boolean" }).querySelector("svg")!;
    const intersectSvg = screen.getByRole("button", { name: "Intersect boolean" }).querySelector("svg")!;
    expect(subtractSvg).toHaveAttribute("data-boolean-operation", "subtract");
    expect(subtractSvg.querySelector("mask")).not.toBeNull();
    expect(intersectSvg).toHaveAttribute("data-boolean-operation", "intersect");
    expect(intersectSvg.querySelector("clipPath")).not.toBeNull();
    expect(intersectSvg.querySelector("[fill-rule='evenodd']")).toBeNull();
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
