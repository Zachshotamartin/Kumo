import { configureStore } from "@reduxjs/toolkit";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
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
  loadPrototypeLinks: vi.fn(), createPrototypeLink: vi.fn(), revokePrototypeLink: vi.fn(),
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
vi.mock("../../services/platformRepository", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../services/platformRepository")>();
  return {
    ...original,
    loadPrototypeLinks: mocks.loadPrototypeLinks,
    createPrototypeLink: mocks.createPrototypeLink,
    revokePrototypeLink: mocks.revokePrototypeLink,
  };
});

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

const makeRawPresentationStore = (shapes: Shape[]) => {
  const store = configureStore({
    reducer: { auth: authReducer, whiteBoard: whiteBoardReducer, actions: actionsReducer, selected: selectedReducer, editor: editorReducer },
    preloadedState: {
      whiteBoard: {
        ...whiteBoardReducer(undefined, { type: "@@init" }),
        id: "board",
        roomId: "board:board",
        role: "owner" as const,
        shapes,
      },
    },
  });
  store.dispatch(login({ uid: "owner", email: "owner@example.com" }));
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
    mocks.actions.canEdit = true;
    mocks.png.mockResolvedValue(new Blob(["png"], { type: "image/png" }));
    mocks.svgAssets.mockResolvedValue("<svg/>");
    mocks.pdf.mockResolvedValue(new Uint8Array([1, 2, 3]));
    mocks.listBranches.mockResolvedValue([{ id: "branch", board_id: "board", name: "Exploration", room_id: "branch:branch", created_by: "owner", status: "open", created_at: new Date().toISOString(), updated_at: new Date().toISOString(), merged_at: null }]);
    mocks.createBranch.mockResolvedValue({ id: "new", board_id: "board", name: "Exploration", room_id: "branch:new", status: "open" });
    mocks.mergeBranch.mockResolvedValue({ merged: true, checkpointId: "checkpoint", revision: 42 });
    mocks.archiveBranch.mockResolvedValue({ archived: true });
    mocks.diffBranch.mockResolvedValue({ diff: [{ shapeId: "child", status: "changed", name: "Continue" }] });
    mocks.reviewBranch.mockResolvedValue({ reviewed: true, status: "approved" });
    mocks.loadPrototypeLinks.mockResolvedValue([]);
    mocks.createPrototypeLink.mockResolvedValue({
      link: { id: "prototype-link", board_id: "board", start_shape_id: frame.id, device_frame: "none", expires_at: null, revoked_at: null, created_at: "2026-08-25" },
      token: "token",
      url: "https://kumo.example/p/token",
    });
    mocks.revokePrototypeLink.mockResolvedValue({ revoked: true });
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

  it("covers empty assets, editing restrictions, collection creation, and panel dismissal", () => {
    mocks.actions.canEdit = false;
    const store = makeStore("");
    store.dispatch(setWhiteboardData({ shapes: [] }));
    render(<Provider store={store}><DesignLibraryPanel /></Provider>);
    expect(screen.getByText("Create a component from a selected object or frame.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Create from selection/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Combine as variants/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Text" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Identity" } });
    fireEvent.change(screen.getByLabelText("Collection"), { target: { value: "Brand modes" } });
    fireEvent.change(screen.getByLabelText("Modes"), { target: { value: "Light, , Dark" } });
    fireEvent.click(screen.getByRole("button", { name: /Add collection/ }));
    expect(mocks.actions.commitShapes).toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("Variable color"), { target: { value: "#123456" } });
    fireEvent.change(screen.getAllByDisplayValue("#123456")[0]!, { target: { value: "#654321" } });
    fireEvent.click(screen.getByRole("button", { name: /Add color variable/ }));
    expect(mocks.actions.createLibraryVariable).toHaveBeenCalledWith("color-variable", "Identity color", "#654321");
    fireEvent.click(screen.getByRole("button", { name: "Close assets" }));
    expect(store.getState().editor.rightPanel).toBe("properties");
  });

  it("covers component and variable fallbacks, style actions, aliases, and mode values", () => {
    const unnamed = shape("unnamed", "frame", { componentDefinition: true, componentName: undefined, name: undefined, componentSetId: "fallback-set", variantProperties: undefined });
    const namedVariant = shape("named-variant", "frame", { componentDefinition: true, componentName: "Named", componentSetId: "fallback-set", variantProperties: {} });
    const definition = shape("property-definition", "frame", {
      componentDefinition: true,
      componentName: "Property definition",
      componentSetId: "fallback-set",
      componentProperties: {
        visible: { type: "boolean", label: "Visible override", defaultValue: true, targetNodeId: "node" },
        variant: { type: "variant", label: "Variant property", defaultValue: namedVariant.id, targetNodeId: "node" },
        content: { type: "text", label: "Content property", defaultValue: "Default", targetNodeId: "node" },
      },
    });
    const propertyInstance = shape("property-instance", "frame", {
      instanceOf: definition.id,
      instanceRootId: "property-instance",
      instanceProperties: { visible: false, content: "Override" },
    });
    const collection = shape("collection", "resource", { resourceKind: "variable-collection", resourceName: "Modes", resourceValue: { light: "Light" }, hidden: true });
    const emptyCollection = shape("empty-collection", "resource", { resourceKind: "variable-collection", resourceName: "Empty", resourceValue: undefined, hidden: true });
    const themed = shape("themed", "resource", { resourceKind: "color-variable", resourceName: "Themed", resourceValue: { value: undefined } as unknown as Record<string, string | number | boolean>, variableCollectionId: collection.id, variableModeValues: undefined, variableAliasId: "plain", hidden: true });
    const orphan = shape("orphan", "resource", { resourceKind: "color-variable", resourceName: "Orphan", resourceValue: { value: "#111111" }, variableCollectionId: "missing", hidden: true });
    const plain = shape("plain", "resource", { resourceKind: "color-variable", resourceName: "Plain", resourceValue: { value: "#222222" }, hidden: true });
    const text = shape("text", "text", { text: "Text", activeVariableModes: { collection: "light" } });
    const store = makeStore("");
    store.dispatch(setWhiteboardData({ shapes: [unnamed, namedVariant, definition, propertyInstance, collection, emptyCollection, themed, orphan, plain, text] }));
    store.dispatch(setSelectedShapes([propertyInstance.id, text.id]));
    const view = render(<Provider store={store}><DesignLibraryPanel /></Provider>);

    expect(screen.getByText("Component")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Insert Component" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Combine as variants/ }));
    expect(mocks.actions.createVariantSetSelected).toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("Variant"), { target: { value: namedVariant.id } });
    fireEvent.click(screen.getByLabelText("Visible override"));
    fireEvent.change(screen.getByLabelText("Variant property"), { target: { value: unnamed.id } });
    fireEvent.change(screen.getByLabelText("Content property"), { target: { value: "Changed" } });
    expect(screen.getAllByRole("button", { name: "Add themed color" })[0]).toBeEnabled();
    expect(screen.getAllByRole("button", { name: "Add themed color" })[1]).toBeDisabled();
    fireEvent.click(screen.getAllByRole("button", { name: "Add themed color" })[0]!);
    fireEvent.change(screen.getAllByLabelText("Alias")[0]!, { target: { value: "" } });
    fireEvent.change(screen.getByLabelText("Themed Light value"), { target: { value: "#abcdef" } });
    const modeColor = view.container.querySelectorAll<HTMLInputElement>('input[type="color"]')[1]!;
    expect(modeColor).toHaveValue("#000000");
    fireEvent.change(modeColor, { target: { value: "#fedcba" } });

    act(() => store.dispatch(setSelectedShapes([text.id])));
    fireEvent.click(screen.getByRole("button", { name: "Text" }));
    fireEvent.click(screen.getByRole("button", { name: "Effect" }));
    fireEvent.click(screen.getByRole("button", { name: /Bind Themed to text/ }));
    expect(mocks.actions.createStyleFromSelected).toHaveBeenCalledWith("text-style", "Brand text");
    expect(mocks.actions.bindVariableToSelected).toHaveBeenCalledWith("color", themed.id);
  });

  it("disables property exposure when a component has no children", () => {
    const definition = shape("empty-definition", "frame", { componentDefinition: true, componentName: "Empty" });
    const store = makeStore("");
    store.dispatch(setWhiteboardData({ shapes: [definition] }));
    store.dispatch(setSelectedShapes([definition.id]));
    render(<Provider store={store}><DesignLibraryPanel /></Provider>);
    expect(screen.getByRole("button", { name: "Expose text" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Expose visibility" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Expose instance swap" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Expose slot" })).toBeDisabled();
  });

  it("uses safe empty defaults when exposed component children are unnamed", () => {
    const definition = shape("fallback-definition", "frame", { componentDefinition: true, componentName: "Fallback" });
    const visual = shape("visual", "rectangle", { parentId: definition.id, name: "Visual", text: undefined });
    const label = shape("label", "text", { parentId: definition.id, name: undefined, text: undefined });
    const store = makeStore("");
    store.dispatch(setWhiteboardData({ shapes: [definition, visual, label] }));
    store.dispatch(setSelectedShapes([definition.id]));
    render(<Provider store={store}><DesignLibraryPanel /></Provider>);
    fireEvent.click(screen.getByRole("button", { name: "Expose text" }));
    fireEvent.click(screen.getByRole("button", { name: "Expose slot" }));
    expect(mocks.actions.commitShapes).toHaveBeenCalledWith(expect.arrayContaining([expect.objectContaining({
      id: definition.id,
      componentProperties: expect.objectContaining({ "slot-content": expect.objectContaining({ defaultValue: "Visual", targetField: "name" }) }),
    })]));

    act(() => store.dispatch(setWhiteboardData({ shapes: [definition, { ...visual, name: undefined }, label] })));
    fireEvent.click(screen.getByRole("button", { name: "Expose slot" }));
    expect(mocks.actions.commitShapes).toHaveBeenCalledWith(expect.arrayContaining([expect.objectContaining({
      id: definition.id,
      componentProperties: expect.objectContaining({ "slot-content": expect.objectContaining({ defaultValue: "" }) }),
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

  it("authors every prototype destination and condition shape and removes interactions", () => {
    const boardLink = shape("board-link", "board", { boardId: "destination-board", title: "Destination board" });
    const unnamedBoardLink = shape("unnamed-board-link", "board", { boardId: "unnamed-board", title: undefined });
    const componentWithoutName = shape("component-without-name", "frame", { name: undefined, componentDefinition: true });
    const stateVariable = shape("state-variable", "resource", { resourceKind: "string-variable", resourceName: "State", resourceValue: { value: "idle" } });
    const store = makeStore(child.id);
    store.dispatch(setWhiteboardData({ shapes: [
      ...store.getState().whiteBoard.shapes.map((candidate) => candidate.id === child.id ? {
        ...candidate,
        prototypeInteractions: [
          ...(candidate.prototypeInteractions ?? []),
          { id: "back", trigger: "click" as const, action: "back" as const },
          { id: "missing-target", trigger: "click" as const, action: "navigate" as const, destinationId: "missing" },
        ],
      } : candidate),
      boardLink,
      unnamedBoardLink,
      componentWithoutName,
      stateVariable,
    ] }));
    render(<Provider store={store}><PrototypePanel /></Provider>);

    fireEvent.click(screen.getAllByRole("button", { name: "Remove interaction" })[0]!);
    expect(mocks.actions.commitShapes).toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Close prototype" }));
    expect(store.getState().editor.rightPanel).toBe("properties");
    fireEvent.click(screen.getByRole("button", { name: /Present prototype/ }));
    expect(store.getState().editor.presentationFrameId).toBeNull();

    const actionSelect = screen.getByRole("combobox", { name: "Action" });
    const add = () => fireEvent.click(screen.getByRole("button", { name: /Add interaction/ }));

    fireEvent.change(actionSelect, { target: { value: "open-board" } });
    add();
    expect((mocks.actions.commitShapes.mock.calls.at(-1)?.[0] as Shape[]).find((candidate) => candidate.id === child.id)?.prototypeInteractions?.at(-1)).toMatchObject({ action: "open-board", boardId: component.id });
    fireEvent.change(screen.getByRole("combobox", { name: "Board object" }), { target: { value: boardLink.id } });
    add();
    expect((mocks.actions.commitShapes.mock.calls.at(-1)?.[0] as Shape[]).find((candidate) => candidate.id === child.id)?.prototypeInteractions?.at(-1)).toMatchObject({ action: "open-board", boardId: "destination-board" });

    fireEvent.change(actionSelect, { target: { value: "open-url" } });
    fireEvent.change(screen.getByRole("textbox", { name: "URL" }), { target: { value: "https://example.com" } });
    add();

    fireEvent.change(screen.getByRole("combobox", { name: "Trigger" }), { target: { value: "after-delay" } });
    fireEvent.change(actionSelect, { target: { value: "back" } });
    add();

    fireEvent.change(actionSelect, { target: { value: "set-variable" } });
    fireEvent.change(screen.getByRole("combobox", { name: "Variable" }), { target: { value: stateVariable.id } });
    fireEvent.change(screen.getByRole("textbox", { name: "Value" }), { target: { value: "active" } });
    fireEvent.change(screen.getByRole("combobox", { name: "Transition" }), { target: { value: "smart-animate" } });
    fireEvent.click(screen.getByRole("checkbox", { name: "Run only when condition matches" }));
    add();
    expect((mocks.actions.commitShapes.mock.calls.at(-1)?.[0] as Shape[]).find((candidate) => candidate.id === child.id)?.prototypeInteractions?.at(-1)).toMatchObject({
      action: "set-variable",
      variableId: stateVariable.id,
      variableValue: "active",
      condition: { variableId: stateVariable.id, operator: "equals", value: "active" },
    });

    fireEvent.change(actionSelect, { target: { value: "change-to" } });
    fireEvent.change(screen.getByRole("combobox", { name: "Destination" }), { target: { value: componentWithoutName.id } });
    add();
    fireEvent.change(actionSelect, { target: { value: "scroll-to" } });
    fireEvent.change(screen.getByRole("combobox", { name: "Destination" }), { target: { value: child.id } });
    add();
    fireEvent.change(actionSelect, { target: { value: "open-overlay" } });
    add();
  });

  it("guards prototype loading for viewers and loads, creates, copies, and revokes owner links", async () => {
    const expiring = { id: "expiring", board_id: "board", start_shape_id: frame.id, device_frame: "phone" as const, expires_at: "2026-09-01", revoked_at: null, created_at: "2026-08-25" };
    const permanent = { ...expiring, id: "permanent", device_frame: "desktop" as const, expires_at: null };
    const revoked = { ...expiring, id: "revoked", revoked_at: "2026-08-26" };
    mocks.loadPrototypeLinks.mockResolvedValueOnce([expiring, permanent, revoked]);
    const store = renderWithStore(<PrototypePanel />, frame.id);
    expect(await screen.findByText(/phone presentation/)).toBeVisible();
    expect(screen.getByText(/Expires/)).toBeVisible();
    expect(screen.getByText("No expiry")).toBeVisible();
    expect(screen.queryByText(/revoked presentation/)).not.toBeInTheDocument();

    fireEvent.change(screen.getByRole("combobox", { name: "Device frame" }), { target: { value: "tablet" } });
    fireEvent.change(screen.getByLabelText("Optional password"), { target: { value: "secret" } });
    fireEvent.click(screen.getByRole("button", { name: /Create prototype link/ }));
    await waitFor(() => expect(mocks.createPrototypeLink).toHaveBeenCalledWith("board", { startShapeId: frame.id, password: "secret", deviceFrame: "tablet" }));
    fireEvent.click(screen.getByRole("button", { name: /Copy prototype link/ }));
    expect(mocks.clipboard).toHaveBeenCalledWith("https://kumo.example/p/token");

    fireEvent.click(screen.getAllByRole("button", { name: "Revoke" })[1]!);
    await waitFor(() => expect(mocks.revokePrototypeLink).toHaveBeenCalledWith("board", "expiring"));
    expect(screen.queryByText(/phone presentation/)).not.toBeInTheDocument();

    act(() => store.dispatch(setWhiteboardData({ shapes: store.getState().whiteBoard.shapes.map((candidate) => candidate.id === frame.id ? { ...candidate, prototypeStart: false } : candidate) })));
    act(() => store.dispatch(setSelectedShapes([child.id])));
    fireEvent.change(screen.getByLabelText("Optional password"), { target: { value: "" } });
    mocks.createPrototypeLink.mockResolvedValueOnce({
      link: { id: "second-prototype-link", board_id: "board", start_shape_id: component.id, device_frame: "tablet", expires_at: null, revoked_at: null, created_at: "2026-08-25" },
      token: "token-two",
      url: "https://kumo.example/p/token-two",
    });
    fireEvent.click(screen.getByRole("button", { name: /Create prototype link/ }));
    await waitFor(() => expect(mocks.createPrototypeLink).toHaveBeenLastCalledWith("board", expect.objectContaining({ startShapeId: component.id, password: undefined })));
  });

  it("handles missing and failed prototype-link loading", async () => {
    const viewer = makeStore(frame.id);
    viewer.dispatch(setWhiteboardData({ role: "viewer", shapes: [] }));
    const view = render(<Provider store={viewer}><PrototypePanel /></Provider>);
    expect(screen.getByRole("button", { name: /Create prototype link/ })).toBeDisabled();
    expect(mocks.loadPrototypeLinks).not.toHaveBeenCalled();
    view.unmount();

    const missing = makeStore(frame.id);
    missing.dispatch(setWhiteboardData({ id: null }));
    const noBoard = render(<Provider store={missing}><PrototypePanel /></Provider>);
    expect(mocks.loadPrototypeLinks).not.toHaveBeenCalled();
    noBoard.unmount();

    const unselected = makeStore("");
    const noSelection = render(<Provider store={unselected}><PrototypePanel /></Provider>);
    expect(screen.getByText(/Select an object to connect/)).toBeVisible();
    noSelection.unmount();

    mocks.loadPrototypeLinks.mockRejectedValueOnce(new Error("offline"));
    renderWithStore(<PrototypePanel />, frame.id);
    await waitFor(() => expect(mocks.loadPrototypeLinks).toHaveBeenCalledWith("board"));
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

  it("opens the searchable keyboard reference only from an unmodified canvas question mark", () => {
    const store = renderWithStore(<CommandPalette />, child.id);
    const editing = document.createElement("input");
    document.body.append(editing);
    fireEvent.keyDown(editing, { key: "?" });
    expect(screen.queryByRole("dialog", { name: "Keyboard shortcuts" })).not.toBeInTheDocument();
    fireEvent.keyDown(window, { key: "?", metaKey: true });
    fireEvent.keyDown(window, { key: "?", ctrlKey: true });
    fireEvent.keyDown(window, { key: "?", altKey: true });
    expect(screen.queryByRole("dialog", { name: "Keyboard shortcuts" })).not.toBeInTheDocument();

    fireEvent.keyDown(window, { key: "?" });
    const input = screen.getByRole("textbox", { name: "Search keyboard shortcuts" });
    expect(screen.queryByRole("option", { name: /Open assets/ })).not.toBeInTheDocument();
    fireEvent.change(input, { target: { value: "Draw rectangle" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(store.getState().selected.selectedTool).toBe("rectangle");
    editing.remove();
  });

  it("navigates, dismisses, and runs every kind of command-palette result", () => {
    const animation = vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      callback(0);
      return 1;
    });
    const store = makeStore("");
    const unnamed = shape("unnamed", "rectangle", { name: undefined, text: undefined, parentId: frame.id });
    store.dispatch(setWhiteboardData({ shapes: [...store.getState().whiteBoard.shapes, unnamed] }));
    render(<Provider store={store}><CommandPalette /></Provider>);

    fireEvent.click(screen.getByRole("button", { name: "Search objects and commands" }));
    let input = screen.getByRole("textbox", { name: "Search objects and commands" });
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "ArrowUp" });
    fireEvent.keyDown(input, { key: "Shift" });
    fireEvent.change(input, { target: { value: "nothing can match this" } });
    expect(screen.getByText("No matching objects or commands.")).toBeVisible();
    fireEvent.keyDown(input, { key: "Enter" });
    fireEvent.keyDown(input, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "Search and commands" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Search objects and commands" }));
    input = screen.getByRole("textbox", { name: "Search objects and commands" });
    fireEvent.change(input, { target: { value: "Group selection" } });
    const group = screen.getByRole("option", { name: /Group selection/ });
    fireEvent.mouseEnter(group);
    fireEvent.click(group);
    expect(mocks.actions.groupSelected).toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Search objects and commands" }));
    const dialog = screen.getByRole("dialog", { name: "Search and commands" });
    fireEvent.pointerDown(dialog);
    expect(dialog).toBeInTheDocument();
    fireEvent.pointerDown(dialog.parentElement!);
    expect(screen.queryByRole("dialog", { name: "Search and commands" })).not.toBeInTheDocument();

    const runResult = (query: string) => {
      fireEvent.click(screen.getByRole("button", { name: "Search objects and commands" }));
      const search = screen.getByRole("textbox", { name: "Search objects and commands" });
      fireEvent.change(search, { target: { value: query } });
      fireEvent.keyDown(search, { key: "Enter" });
    };
    runResult("Create component");
    expect(mocks.actions.createComponentSelected).toHaveBeenCalledWith("Component");
    runResult("Reset zoom");
    expect(store.getState().editor.viewport.zoom).toBe(1);
    runResult("Draw ellipse");
    expect(store.getState().selected.selectedTool).toBe("ellipse");
    runResult("Frame selection");
    expect(mocks.actions.frameSelected).toHaveBeenCalled();
    runResult("rectangle");
    expect(store.getState().selected.selectedShapes).toEqual([unnamed.id]);
    animation.mockRestore();
  });

  it("copies handoff code and token values", async () => {
    renderWithStore(<InspectPanel />, child.id);
    fireEvent.click(screen.getByRole("button", { name: "Copy CSS" }));
    fireEvent.click(screen.getByRole("button", { name: "#b87a2e" }));
    await waitFor(() => expect(mocks.clipboard).toHaveBeenCalledTimes(2));
    expect(screen.getByText(/\.kumo-text/)).toBeVisible();
  });

  it("covers empty inspect state, every code format, links, and copy reset", async () => {
    const empty = makeStore("");
    const emptyView = render(<Provider store={empty}><InspectPanel /></Provider>);
    expect(screen.getByText(/Select a layer to inspect/)).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Close inspect" }));
    expect(empty.getState().editor.rightPanel).toBe("properties");
    emptyView.unmount();

    renderWithStore(<InspectPanel />, child.id);
    fireEvent.click(screen.getByRole("button", { name: "Copy link to selection" }));
    for (const format of ["react", "swift", "json", "story", "tokens", "css"] as const) {
      fireEvent.change(screen.getByRole("combobox", { name: "Code format" }), { target: { value: format } });
    }
    fireEvent.click(screen.getByRole("button", { name: "Copy CSS" }));
    await waitFor(() => expect(mocks.clipboard).toHaveBeenCalled());
    await act(async () => { await new Promise((resolve) => window.setTimeout(resolve, 1250)); });
  });

  it("renders rich handoff metadata, comparison, aliases, assets, and component variants", () => {
    const resource = shape("resource-a", "resource", { resourceKind: "color-variable", resourceName: "Primary", variableAliasId: "resource-b" });
    const circular = shape("resource-b", "resource", { resourceKind: "color-variable", resourceName: "Secondary", variableAliasId: "resource-a" });
    const terminal = shape("resource-c", "resource", { resourceKind: "color-variable", resourceName: "Terminal" });
    const definition = shape("inspect-definition", "frame", {
      name: undefined,
      componentName: "Card",
      componentDefinition: true,
      componentSetId: "inspect-set",
      variantProperties: { State: "Default" },
      componentProperties: { label: { type: "text", label: "Label", defaultValue: "Hello", targetNodeId: "label" } },
      pageId: "page-two",
      devStatus: "ready",
      devAnnotation: "Use the production card.",
      codeComponentUrl: "https://code.example/card",
      variableBindings: { backgroundColor: resource.id, color: terminal.id },
      backgroundImage: "https://images.example/background.png",
      embedImageUrl: "https://images.example/embed.png",
      fills: [{ id: "image-fill", type: "image", imageUrl: "https://images.example/fill.png", opacity: 1, visible: true, blendMode: "normal" }],
      backgroundColor: "#111111",
      layoutMode: "horizontal",
      borderColor: undefined,
      borderWidth: undefined,
    });
    const namedVariant = shape("inspect-variant-name", "frame", {
      componentDefinition: true,
      componentName: undefined,
      name: "Named variant",
      componentSetId: "inspect-set",
      backgroundColor: "#222222",
      borderColor: "#ffffff",
      borderWidth: 2,
      width: 140,
      height: 100,
      x2: 140,
      y2: 100,
    });
    const fallbackVariant = shape("inspect-variant-fallback", "frame", { componentDefinition: true, componentName: undefined, name: undefined, componentSetId: "inspect-set" });
    const store = makeRawPresentationStore([definition, namedVariant, fallbackVariant, resource, circular, terminal]);
    store.dispatch(setSelectedShapes([definition.id, namedVariant.id]));
    render(<Provider store={store}><InspectPanel /></Provider>);

    expect(screen.getByRole("heading", { name: "frame" })).toBeVisible();
    expect(screen.getByText("Use the production card.")).toBeVisible();
    expect(screen.getByRole("link", { name: "Open code component" })).toHaveAttribute("href", "https://code.example/card");
    expect(screen.getByText(/3 variants/)).toBeVisible();
    expect(screen.getByText(/circular/)).toBeVisible();
    expect(screen.getByRole("heading", { name: "Frame comparison" })).toBeVisible();
    expect(screen.getAllByRole("link", { name: /Download/ })).toHaveLength(3);
    fireEvent.click(screen.getByRole("button", { name: /Named variant/ }));
    expect(store.getState().selected.selectedShapes).toEqual([namedVariant.id]);
  });

  it("renders a singular unnamed component playground variant", () => {
    const solo = shape("solo-component", "frame", { name: undefined, componentName: undefined, componentDefinition: true });
    const store = makeStore("");
    store.dispatch(setWhiteboardData({ shapes: [solo] }));
    store.dispatch(setSelectedShapes([solo.id]));
    render(<Provider store={store}><InspectPanel /></Provider>);
    expect(screen.getByText("1 variant")).toBeVisible();
    expect(screen.getByRole("button", { name: "Variant" })).toBeVisible();
  });

  it("exports all formats and imports a validated Kumo document", async () => {
    const store = renderWithStore(<ExportPanel />, "");
    fireEvent.click(screen.getByRole("button", { name: "SVG" }));
    fireEvent.click(screen.getByRole("button", { name: "PNG" }));
    fireEvent.click(screen.getByRole("button", { name: "PDF" }));
    act(() => store.dispatch(setWhiteboardData({ title: "***" })));
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

  it("covers selected export options, all failure messages, import guards, and panel controls", async () => {
    const store = makeStore(child.id);
    store.dispatch(setWhiteboardData({ title: null }));
    render(<Provider store={store}><ExportPanel /></Provider>);
    expect(screen.getByRole("heading", { name: "Selection · 1" })).toBeVisible();
    fireEvent.change(screen.getByLabelText("PNG scale"), { target: { value: "4" } });
    fireEvent.click(screen.getByRole("button", { name: "Close export" }));
    expect(store.getState().editor.rightPanel).toBe("properties");
    fireEvent.click(screen.getByRole("button", { name: /Add Kumo document/ }));

    const input = screen.getByLabelText("Import Kumo document");
    fireEvent.change(input, { target: { files: [] } });
    fireEvent.change(input, { target: { files: null } });

    mocks.png.mockRejectedValueOnce(new Error("PNG unavailable"));
    fireEvent.click(screen.getByRole("button", { name: "PNG" }));
    expect(await screen.findByRole("status")).toHaveTextContent("PNG unavailable");
    mocks.png.mockRejectedValueOnce("png unavailable");
    fireEvent.click(screen.getByRole("button", { name: "PNG" }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("PNG export failed."));

    mocks.svgAssets.mockRejectedValueOnce(new Error("SVG unavailable"));
    fireEvent.click(screen.getByRole("button", { name: "SVG" }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("SVG unavailable"));
    mocks.svgAssets.mockRejectedValueOnce("svg unavailable");
    fireEvent.click(screen.getByRole("button", { name: "SVG" }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("SVG export failed."));

    mocks.pdf.mockRejectedValueOnce(new Error("PDF unavailable"));
    fireEvent.click(screen.getByRole("button", { name: "PDF" }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("PDF unavailable"));
    mocks.pdf.mockRejectedValueOnce("pdf unavailable");
    fireEvent.click(screen.getByRole("button", { name: "PDF" }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("PDF export failed."));

    fireEvent.click(screen.getByRole("button", { name: "Kumo" }));
    expect(mocks.download).toHaveBeenCalledWith(expect.any(Blob), "kumo-board.kumo.json");

    const unreadable = new File(["bad"], "bad.kumo.json", { type: "application/json" });
    Object.defineProperty(unreadable, "text", { value: vi.fn().mockRejectedValue("unreadable") });
    fireEvent.change(input, { target: { files: [unreadable] } });
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Import failed."));
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
    fireEvent.keyDown(window, { key: "ArrowLeft" });
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

  it("returns from the presentation empty state when the document has no frame", () => {
    const store = makeStore("");
    store.dispatch(setWhiteboardData({ shapes: [shape("loose")] }));
    render(<Provider store={store}><PresentationView /></Provider>);
    expect(screen.getByText("Create a top-level frame to present this prototype.")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Return to editor" }));
    expect(store.getState().editor.presentationMode).toBe(false);
    expect(store.getState().editor.presentationFrameId).toBeNull();
  });

  it("executes prototype overlays, variables, scroll targets, variants, conditions, and external URLs", () => {
    const open = vi.spyOn(window, "open").mockImplementation(() => null);
    const scrollIntoView = vi.fn();
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", { configurable: true, value: scrollIntoView });
    vi.stubGlobal("CSS", { ...CSS, escape: (value: string) => value });
    const overlay = shape("overlay", "frame", {
      x1: 500, y1: 0, x2: 700, y2: 160, name: "Overlay",
      prototypeOverlaySettings: { closeOnOutside: true, background: "rgba(1,2,3,.5)", position: "center" },
    });
    const overlayText = shape("overlay-text", "text", { parentId: overlay.id, text: "Overlay copy", x1: 510, y1: 10, x2: 650, y2: 50 });
    const overlayBox = shape("overlay-box", "rectangle", { parentId: overlay.id, x1: 510, y1: 60, x2: 650, y2: 120 });
    const resource = shape("state", "resource", { hidden: true, resourceKind: "string-variable", resourceValue: { value: "idle" } });
    const destinationVariant = shape("variant-destination", "frame", { componentDefinition: true, componentSetId: "set", variantProperties: { State: "Hover" }, x1: 800, x2: 900 });
    const controls = [
      shape("plain", "rectangle", { name: undefined, parentId: frame.id }),
      shape("blocked", "rectangle", { name: "Blocked", parentId: frame.id, x1: 105, x2: 205, prototypeInteractions: [{ id: "blocked", trigger: "click", action: "navigate", destinationId: target.id, condition: { variableId: "state", operator: "equals", value: "ready" } }] }),
      shape("variant-action", "rectangle", { name: "Change variant", parentId: frame.id, instanceRootId: instance.id, x1: 210, x2: 310, prototypeInteractions: [{ id: "variant", trigger: "click", action: "change-to", destinationId: destinationVariant.id }] }),
      shape("missing-overlay", "rectangle", { name: "Missing overlay", parentId: frame.id, y1: 65, y2: 125, prototypeInteractions: [{ id: "missing", trigger: "click", action: "open-overlay", destinationId: "missing" }] }),
      shape("open-overlay", "rectangle", { name: "Open overlay", parentId: frame.id, x1: 105, x2: 205, y1: 65, y2: 125, prototypeInteractions: [{ id: "overlay", trigger: "click", action: "open-overlay", destinationId: overlay.id }] }),
      shape("close-overlay", "rectangle", { name: "Close overlay action", parentId: frame.id, x1: 210, x2: 310, y1: 65, y2: 125, prototypeInteractions: [{ id: "close", trigger: "click", action: "close-overlay" }] }),
      shape("scroll", "rectangle", { name: "Scroll target action", parentId: frame.id, y1: 130, y2: 190, prototypeInteractions: [{ id: "scroll", trigger: "click", action: "scroll-to", destinationId: "plain" }] }),
      shape("variable-action", "rectangle", { name: "Set empty variable", parentId: frame.id, x1: 105, x2: 205, y1: 130, y2: 190, prototypeInteractions: [{ id: "variable", trigger: "click", action: "set-variable", variableId: resource.id }] }),
      shape("url-empty", "rectangle", { name: "Empty URL", parentId: frame.id, x1: 210, x2: 310, y1: 130, y2: 190, prototypeInteractions: [{ id: "url-empty", trigger: "click", action: "open-url" }] }),
      shape("url-invalid", "rectangle", { name: "Invalid URL", parentId: frame.id, y1: 195, y2: 255, prototypeInteractions: [{ id: "url-invalid", trigger: "click", action: "open-url", url: "not a url" }] }),
      shape("url-script", "rectangle", { name: "Script URL", parentId: frame.id, x1: 105, x2: 205, y1: 195, y2: 255, prototypeInteractions: [{ id: "url-script", trigger: "click", action: "open-url", url: "javascript:alert(1)" }] }),
      shape("url-http", "rectangle", { name: "Web URL", parentId: frame.id, x1: 210, x2: 310, y1: 195, y2: 255, prototypeInteractions: [{ id: "url-http", trigger: "click", action: "open-url", url: "https://example.com/path" }] }),
      shape("board-without-id", "rectangle", { name: "Board without id", parentId: frame.id, x1: 315, x2: 415, y1: 195, y2: 255, prototypeInteractions: [{ id: "board", trigger: "click", action: "open-board" }] }),
    ];
    const store = makeStore("");
    store.dispatch(setWhiteboardData({ shapes: [frame, target, instance, destinationVariant, overlay, overlayText, overlayBox, resource, ...controls] }));
    store.dispatch(setPresentationFrameId(frame.id));
    render(<Provider store={store}><PresentationView /></Provider>);

    fireEvent.click(screen.getByRole("button", { name: "rectangle" }));
    fireEvent.click(screen.getByRole("button", { name: "Blocked" }));
    expect(screen.getByText(frame.name!)).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Change variant" }));
    fireEvent.click(screen.getByRole("button", { name: "Missing overlay" }));
    expect(screen.queryByRole("button", { name: "Close prototype overlay backdrop" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Open overlay" }));
    expect(screen.getByText("Overlay copy")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Close overlay action" }));
    expect(screen.queryByText("Overlay copy")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Scroll target action" }));
    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: "smooth", block: "center", inline: "center" });
    fireEvent.click(screen.getByRole("button", { name: "Set empty variable" }));
    fireEvent.click(screen.getByRole("button", { name: "Empty URL" }));
    fireEvent.click(screen.getByRole("button", { name: "Invalid URL" }));
    fireEvent.click(screen.getByRole("button", { name: "Script URL" }));
    fireEvent.click(screen.getByRole("button", { name: "Web URL" }));
    fireEvent.click(screen.getByRole("button", { name: "Board without id" }));
    expect(open).toHaveBeenCalledOnce();
    expect(open).toHaveBeenCalledWith("https://example.com/path", "_blank", "noopener,noreferrer");
    vi.unstubAllGlobals();
  });

  it("supports every overlay dismissal path and respects outside-click locking", () => {
    const lockedOverlay = shape("locked-overlay", "frame", {
      x1: 500, x2: 700,
      prototypeOverlaySettings: { closeOnOutside: false, background: "#0008", position: "center" },
    });
    const defaultOverlay = shape("default-overlay", "frame", { x1: 720, x2: 900 });
    const openOverlay = shape("open", "rectangle", { name: "Show modal", parentId: frame.id, prototypeInteractions: [{ id: "open", trigger: "click", action: "open-overlay", destinationId: lockedOverlay.id }] });
    const openDefault = shape("open-default", "rectangle", { name: "Show default modal", parentId: frame.id, x1: 110, x2: 210, prototypeInteractions: [{ id: "open-default", trigger: "click", action: "open-overlay", destinationId: defaultOverlay.id }] });
    const store = makeStore("");
    store.dispatch(setWhiteboardData({ shapes: [frame, lockedOverlay, defaultOverlay, openOverlay, openDefault] }));
    store.dispatch(setPresentationFrameId(frame.id));
    const rendered = render(<Provider store={store}><PresentationView /></Provider>);
    const show = () => fireEvent.click(screen.getByRole("button", { name: "Show modal" }));
    show();
    const backdrop = screen.getByRole("button", { name: "Close prototype overlay backdrop" });
    fireEvent.click(backdrop);
    expect(screen.getByRole("button", { name: "Close prototype overlay backdrop" })).toBeVisible();
    fireEvent.keyDown(backdrop, { key: "Tab" });
    fireEvent.keyDown(backdrop, { key: "Escape" });
    expect(screen.queryByRole("button", { name: "Close prototype overlay backdrop" })).not.toBeInTheDocument();
    show();
    fireEvent.keyDown(screen.getByRole("button", { name: "Close prototype overlay backdrop" }), { key: "Enter" });
    show();
    fireEvent.keyDown(screen.getByRole("button", { name: "Close prototype overlay backdrop" }), { key: " " });
    show();
    fireEvent.click(screen.getByRole("button", { name: "Close prototype overlay" }));
    fireEvent.click(screen.getByRole("button", { name: "Show default modal" }));
    fireEvent.click(screen.getByRole("button", { name: "Close prototype overlay backdrop" }));
    expect(rendered.queryByRole("button", { name: "Close prototype overlay backdrop" })).not.toBeInTheDocument();
  });

  it("switches named prototype flows, resets scrolling, and handles delayed and back actions", () => {
    vi.useFakeTimers();
    const scrollTo = vi.fn();
    Object.defineProperty(HTMLElement.prototype, "scrollTo", { configurable: true, value: scrollTo });
    const firstFrame = shape("flow-one-frame", "frame", { name: "First flow", prototypeStart: false, prototypeOverflowAxis: "both" });
    const secondFrame = shape("flow-two-frame", "frame", { name: "Second flow", x1: 300, x2: 500, prototypeOverflowAxis: "horizontal" });
    const delayed = shape("delayed", "rectangle", { parentId: firstFrame.id, prototypeInteractions: [
      { id: "default-delay", trigger: "after-delay", action: "set-variable", variableId: "missing" },
      { id: "delay", trigger: "after-delay", action: "navigate", destinationId: secondFrame.id, delay: -1 },
    ] });
    const back = shape("back", "rectangle", { name: "Go back action", parentId: secondFrame.id, prototypeInteractions: [{ id: "back", trigger: "click", action: "back" }] });
    const firstFlow = shape("flow-one", "resource", { hidden: true, resourceKind: "prototype-flow", resourceValue: { json: JSON.stringify({ id: "one", name: "One", description: "", startFrameId: firstFrame.id }) } });
    const secondFlow = shape("flow-two", "resource", { hidden: true, resourceKind: "prototype-flow", resourceValue: { json: JSON.stringify({ id: "two", name: "Two", description: "", startFrameId: secondFrame.id }) } });
    const store = makeStore("");
    store.dispatch(setWhiteboardData({ shapes: [firstFrame, secondFrame, delayed, back, firstFlow, secondFlow] }));
    store.dispatch(setPresentationFrameId("missing"));
    render(<Provider store={store}><PresentationView /></Provider>);
    const flow = screen.getByLabelText("Prototype flow");
    fireEvent.change(flow, { target: { value: "missing" } });
    fireEvent.change(flow, { target: { value: "two" } });
    expect(screen.getByRole("button", { name: "Go back action" })).toBeVisible();
    expect(scrollTo).toHaveBeenCalledWith(0, 0);
    fireEvent.change(flow, { target: { value: "one" } });
    act(() => { vi.runOnlyPendingTimers(); });
    expect(screen.getByRole("button", { name: "Go back action" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Go back action" }));
    expect(screen.getByRole("button", { name: "delayed" })).toBeVisible();
    vi.useRealTimers();
  });

  it("renders vector variants, masks, clipped children, scrolling positions, and board labels", () => {
    const maskEllipse = shape("mask-ellipse", "ellipse", { parentId: frame.id, isMask: true, x1: 10, y1: 10, x2: 90, y2: 50 });
    const maskedEllipse = shape("masked-ellipse", "rectangle", { name: "Ellipse masked", parentId: frame.id, maskId: maskEllipse.id, x1: 0, y1: 0, x2: 100, y2: 60 });
    const maskRect = shape("mask-rect", "rectangle", { parentId: frame.id, isMask: true, x1: 120, y1: 10, x2: 190, y2: 50 });
    const maskedRect = shape("masked-rect", "rectangle", { name: "Rect masked", parentId: frame.id, maskId: maskRect.id, x1: 110, y1: 0, x2: 210, y2: 60 });
    const clipped = shape("clipped", "rectangle", { name: "Frame clipped", parentId: frame.id, x1: -20, y1: -20, x2: 40, y2: 40 });
    const fixed = shape("fixed", "rectangle", { name: "Fixed", parentId: frame.id, prototypePosition: "fixed", x1: 0, y1: 70, x2: 80, y2: 120, flipX: true, flipY: true });
    const sticky = shape("sticky", "rectangle", { name: "Sticky", parentId: frame.id, prototypePosition: "sticky", prototypeStickyOffset: undefined, x1: 90, y1: 70, x2: 170, y2: 120 });
    const connector = shape("connector", "connector", { name: "Connector", parentId: frame.id, connectorStart: { anchor: "auto", x: 180, y: 80 }, connectorEnd: { anchor: "auto", x: 260, y: 110 }, x1: 180, y1: 80, x2: 260, y2: 110 });
    const union = shape("union", "boolean", { name: "Union", parentId: frame.id, x1: 0, y1: 130, x2: 80, y2: 190, backgroundColor: undefined, booleanOperation: undefined, booleanChildren: [shape("u1"), shape("u2", "ellipse")] });
    const exclude = shape("exclude", "boolean", { name: "Exclude", parentId: frame.id, x1: 90, y1: 130, x2: 170, y2: 190, booleanOperation: "exclude", booleanChildren: [shape("e1"), shape("e2", "ellipse")] });
    const openVector = shape("open-vector", "vector", { name: "Open vector", parentId: frame.id, x1: 180, y1: 130, x2: 260, y2: 190, backgroundColor: undefined, borderColor: undefined, borderWidth: undefined, strokeCap: "square", strokeJoin: undefined, vectorClosed: false, vectorPoints: [{ id: "a", x: 180, y: 130 }, { id: "b", x: 260, y: 190 }] });
    const network = shape("network", "vector", { name: "Network", parentId: frame.id, x1: 270, y1: 130, x2: 350, y2: 190, strokeCap: "round", vectorClosed: true, vectorPoints: [{ id: "a", x: 270, y: 130 }, { id: "b", x: 350, y: 190 }], vectorPaths: [{ id: "path", pointIds: ["a", "b"], closed: false }] });
    const boardLink = shape("board-link", "board", { name: "Board card", title: "Roadmap", parentId: frame.id, x1: 270, y1: 70, x2: 350, y2: 120 });
    const store = makeStore("");
    store.dispatch(setWhiteboardData({ shapes: [{ ...frame, clipContent: true, backgroundColor: undefined, prototypeOverflow: "scroll", prototypeOverflowAxis: "vertical" }, maskEllipse, maskedEllipse, maskRect, maskedRect, clipped, fixed, sticky, connector, union, exclude, openVector, network, boardLink] }));
    store.dispatch(setPresentationFrameId(frame.id));
    render(<Provider store={store}><PresentationView /></Provider>);
    const stage = screen.getByRole("button", { name: "Fixed" }).parentElement!;
    Object.defineProperties(stage, { scrollLeft: { configurable: true, value: 12 }, scrollTop: { configurable: true, value: 30 } });
    fireEvent.scroll(stage);
    expect(screen.getByRole("button", { name: "Fixed" })).toHaveStyle({ transform: "translate(12px, 30px) rotate(0deg) scaleX(-1) scaleY(-1)" });
    expect(screen.getByRole("button", { name: "Sticky" })).toHaveStyle({ transform: "translateY(30px) rotate(0deg) scaleX(1) scaleY(1)" });
    expect(screen.getByRole("button", { name: "Ellipse masked" }).style.clipPath).toContain("ellipse");
    expect(screen.getByRole("button", { name: "Rect masked" }).style.clipPath).toContain("inset");
    expect(screen.getByRole("button", { name: "Frame clipped" }).style.clipPath).toContain("inset");
    expect(screen.getByRole("button", { name: "Union" }).querySelector("path")).toHaveAttribute("data-boolean-operation", "union");
    expect(screen.getByRole("button", { name: "Exclude" }).querySelector("path")).toHaveAttribute("fill-rule", "evenodd");
    expect(screen.getByRole("button", { name: "Open vector" }).querySelector("path")).toHaveAttribute("stroke-linecap", "square");
    expect(screen.getByRole("button", { name: "Network" }).querySelector("path")).toHaveAttribute("stroke-linecap", "round");
    expect(screen.getByRole("button", { name: "Board card" })).toHaveTextContent("Roadmap");
  });

  it("renders sparse prototype defaults and suppresses the click following a drag", () => {
    const rawFrame = { ...shape("raw-frame", "frame"), name: undefined, backgroundColor: undefined, clipContent: false };
    const rawResource: Shape = { ...shape("raw-variable", "resource"), hidden: true, resourceKind: "string-variable", resourceValue: undefined };
    const rawVector = {
      ...shape("raw-vector", "vector"), name: "Sparse vector", parentId: rawFrame.id,
      vectorPoints: undefined, vectorPaths: undefined, vectorClosed: true,
      backgroundColor: undefined, borderColor: undefined, borderWidth: undefined,
      strokeCap: "none" as const, strokeJoin: undefined, prototypePosition: "sticky" as const, prototypeStickyOffset: undefined,
    };
    const rawNetwork = {
      ...shape("raw-network", "vector"), name: "Sparse network", parentId: rawFrame.id, x1: 220, x2: 320,
      vectorPoints: undefined, vectorPaths: [{ id: "empty", pointIds: [], closed: false }], vectorClosed: false,
    };
    const drag = shape("drag-suppress", "rectangle", {
      name: "Drag without click", parentId: rawFrame.id, x1: 110, x2: 210,
      prototypeInteractions: [
        { id: "drag", trigger: "drag", action: "set-variable", variableId: rawResource.id },
        { id: "click", trigger: "click", action: "navigate", destinationId: "missing" },
      ],
    });
    const store = makeRawPresentationStore([rawFrame, rawResource, rawVector, rawNetwork, drag]);
    store.dispatch(setPresentationFrameId(rawFrame.id));
    render(<Provider store={store}><PresentationView /></Provider>);
    expect(screen.getByText("Prototype")).toBeVisible();
    expect(screen.getByRole("button", { name: "Sparse vector" }).querySelector("path")).toHaveAttribute("stroke-linecap", "butt");
    const dragButton = screen.getByRole("button", { name: "Drag without click" });
    fireEvent.pointerDown(dragButton, { clientX: 0, clientY: 0 });
    fireEvent.pointerUp(dragButton, { clientX: 20, clientY: 20 });
    fireEvent.click(dragButton);
    expect(screen.getByText("Prototype")).toBeVisible();
  });

  it("opens linked boards successfully and reports non-Error failures", async () => {
    const link = shape("link", "board", { name: "Open destination", parentId: frame.id, prototypeInteractions: [{ id: "open", trigger: "click", action: "open-board", boardId: "destination", destinationFrameId: "not-a-frame" }] });
    const destinationFrame = shape("destination-frame", "frame", { name: "Destination frame" });
    const nonFrameDestination = shape("not-a-frame", "rectangle", { name: "Not a frame" });
    mocks.getBoard.mockResolvedValueOnce({ id: "destination", roomId: "board:destination", role: "viewer", title: "Destination", shapes: [nonFrameDestination, destinationFrame] });
    const successful = makeStore("");
    successful.dispatch(setWhiteboardData({ shapes: [frame, link] }));
    successful.dispatch(setSelectedShapes([link.id]));
    successful.dispatch(setPresentationFrameId(frame.id));
    const first = render(<Provider store={successful}><PresentationView /></Provider>);
    fireEvent.click(screen.getByRole("button", { name: "Open destination" }));
    await waitFor(() => expect(successful.getState().whiteBoard.id).toBe("destination"));
    expect(successful.getState().selected.selectedShapes).toEqual([]);
    expect(screen.getByTestId("prototype-frame-destination:destination-frame")).toBeVisible();
    first.unmount();

    const implicitLink = shape("implicit-link", "board", { name: "Implicit destination", parentId: frame.id, boardId: "implicit" });
    mocks.getBoard.mockResolvedValueOnce({ id: "implicit", roomId: "board:implicit", role: "viewer", title: "Implicit", shapes: [destinationFrame] });
    const implicit = makeStore("");
    implicit.dispatch(setWhiteboardData({ shapes: [frame, implicitLink] }));
    implicit.dispatch(setPresentationFrameId(frame.id));
    const implicitView = render(<Provider store={implicit}><PresentationView /></Provider>);
    fireEvent.click(screen.getByRole("button", { name: "Implicit destination" }));
    await waitFor(() => expect(implicit.getState().whiteBoard.id).toBe("implicit"));
    implicitView.unmount();

    mocks.getBoard.mockResolvedValueOnce({ id: "empty", roomId: "board:empty", role: "viewer", title: "Empty", shapes: [] });
    const empty = makeStore("");
    empty.dispatch(setWhiteboardData({ shapes: [frame, link] }));
    empty.dispatch(setPresentationFrameId(frame.id));
    const emptyView = render(<Provider store={empty}><PresentationView /></Provider>);
    fireEvent.click(screen.getByRole("button", { name: "Open destination" }));
    await waitFor(() => expect(empty.getState().whiteBoard.id).toBe("empty"));
    expect(empty.getState().editor.presentationMode).toBe(false);
    emptyView.unmount();

    mocks.getBoard.mockRejectedValueOnce("offline");
    const failed = makeStore("");
    failed.dispatch(setWhiteboardData({ shapes: [frame, link] }));
    failed.dispatch(setPresentationFrameId(frame.id));
    render(<Provider store={failed}><PresentationView /></Provider>);
    fireEvent.click(screen.getByRole("button", { name: "Open destination" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("We couldn't open the linked board.");
  });
});
