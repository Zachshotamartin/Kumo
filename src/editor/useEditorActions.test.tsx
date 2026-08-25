import { configureStore } from "@reduxjs/toolkit";
import { act, renderHook, waitFor } from "@testing-library/react";
import { Provider } from "react-redux";
import type { ReactNode } from "react";
import type { Shape } from "../classes/shape";
import actionsReducer from "../features/actions/actionsSlice";
import authReducer from "../features/auth/authSlice";
import editorReducer, { setClipboard } from "../features/editor/editorSlice";
import selectedReducer, { setSelectedShapes } from "../features/selected/selectedSlice";
import whiteBoardReducer, { setWhiteboardData } from "../features/whiteBoard/whiteBoardSlice";
import { useEditorActions } from "./useEditorActions";

const mocks = vi.hoisted(() => ({
  undo: vi.fn(),
  redo: vi.fn(),
  update: vi.fn(),
  clone: vi.fn(),
  storageSet: vi.fn(),
}));

vi.mock("@liveblocks/react", () => ({
  useCanUndo: () => true,
  useCanRedo: () => true,
  useHistory: () => ({ undo: mocks.undo, redo: mocks.redo }),
  useMutation: (callback: (...args: unknown[]) => unknown) => (...args: unknown[]) => callback({
    storage: {
      get: () => ({ get: () => undefined, set: vi.fn(), delete: vi.fn() }),
      set: mocks.storageSet,
    },
  }, ...args),
}));
vi.mock("../services/boardRepository", () => ({ updateBoardSettings: mocks.update }));
vi.mock("../services/assetRepository", async (importOriginal) => {
  const original = await importOriginal<typeof import("../services/assetRepository")>();
  return { ...original, cloneBoardAssets: mocks.clone };
});

const rect = (id: string, x: number, assetId?: string): Shape => ({
  id, type: "rectangle" as const, x1: x, y1: 0, x2: x + 20, y2: 20,
  width: 20, height: 20, level: 0, rotation: 0, opacity: 1, zIndex: x,
  ...(assetId ? { assetId, backgroundImage: "signed" } : {}),
});

const setup = (role: "owner" | "editor" | "viewer" = "owner") => {
  const store = configureStore({
    reducer: {
      auth: authReducer,
      whiteBoard: whiteBoardReducer,
      actions: actionsReducer,
      selected: selectedReducer,
      editor: editorReducer,
    },
  });
  store.dispatch(setWhiteboardData({
    id: "board", roomId: "board:board", role, type: "private", title: "Board",
    uid: "owner", shapes: [rect("a", 0), rect("b", 40)],
  }));
  store.dispatch(setSelectedShapes(["a", "b"]));
  const wrapper = ({ children }: { children: ReactNode }) => <Provider store={store}>{children}</Provider>;
  return { store, ...renderHook(() => useEditorActions(), { wrapper }) };
};

describe("useEditorActions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.update.mockResolvedValue({});
    mocks.clone.mockResolvedValue({ image: "copy" });
    Object.defineProperty(window.navigator, "onLine", { configurable: true, value: true });
    window.localStorage.clear();
  });

  it("previews, edits, groups, orders, and removes selected shapes", () => {
    const { result, store } = setup();
    act(() => result.current.previewShapes([rect("a", 10), rect("b", 40)]));
    expect(store.getState().editor.localPreviewActive).toBe(true);
    act(() => result.current.cancelPreview([rect("a", 0), rect("b", 40)]));
    expect(store.getState().editor.localPreviewActive).toBe(false);

    act(() => result.current.patchSelected({ opacity: 0.5 }));
    expect(store.getState().whiteBoard.shapes.every((shape) => shape.opacity === 0.5)).toBe(true);
    act(() => result.current.copySelected());
    expect(store.getState().editor.clipboard).toHaveLength(2);
    act(() => result.current.duplicateSelected());
    expect(store.getState().whiteBoard.shapes).toHaveLength(4);

    act(() => result.current.orderSelected("front"));
    act(() => result.current.alignSelected("left"));
    act(() => result.current.distributeSelected("horizontal"));
    act(() => result.current.nudgeSelected(3, 4));
    act(() => result.current.groupSelected());
    expect(store.getState().whiteBoard.shapes.some((shape) => shape.groupId)).toBe(true);
    act(() => result.current.ungroupSelected());
    act(() => result.current.removeSelected());
    expect(store.getState().selected.selectedShapes).toHaveLength(0);

    act(() => { result.current.undo(); result.current.redo(); });
    expect(mocks.undo).toHaveBeenCalled();
    expect(mocks.redo).toHaveBeenCalled();
  });

  it("updates geometry, background, and owner-only board settings", async () => {
    const { result, store } = setup();
    const shape = store.getState().whiteBoard.shapes[0]!;
    act(() => result.current.setShapeGeometry(shape, { x: 12, y: 14, width: 30, height: 40 }));
    expect(store.getState().whiteBoard.shapes[0]).toMatchObject({ x1: 12, y1: 14, x2: 42, y2: 54 });
    act(() => result.current.commitBoardPatch({ backGroundColor: "#fff", title: "New", type: "public" }));
    expect(mocks.storageSet).toHaveBeenCalledWith("backgroundColor", "#fff");
    expect(mocks.update).toHaveBeenCalledWith("board", { title: "New", visibility: "public" });
    await waitFor(() => expect(store.getState().editor.saveStatus).toBe("saved"));
  });

  it("clones cross-board assets before paste and reports clone failures", async () => {
    const { result, store } = setup();
    act(() => store.dispatch(setClipboard({ shapes: [rect("image", 0, "image")], boardId: "other" })));
    await act(async () => { await result.current.paste(); });
    expect(mocks.clone).toHaveBeenCalledWith("board", ["image"]);
    expect(store.getState().whiteBoard.shapes.some((shape) => shape.assetId === "copy")).toBe(true);

    mocks.clone.mockRejectedValueOnce(new Error("Clone failed"));
    act(() => store.dispatch(setClipboard({ shapes: [rect("again", 0, "image")], boardId: "other" })));
    await act(async () => { await result.current.paste(); });
    expect(store.getState().editor.saveError).toBe("Clone failed");
  });

  it("makes viewer mutations no-ops", async () => {
    const { result, store } = setup("viewer");
    const before = store.getState().whiteBoard.shapes;
    act(() => {
      result.current.patchSelected({ opacity: 0.2 });
      result.current.cutSelected();
      result.current.duplicateSelected();
      result.current.commitBoardPatch({ title: "No" });
      result.current.createComponentSelected();
      result.current.createVariantSetSelected();
      result.current.addComponentInstance("missing");
      result.current.removeSelected();
    });
    await act(async () => { await result.current.paste(); });
    expect(store.getState().whiteBoard.shapes).toEqual(before);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("executes reusable assets, compositing, and document organization commands", () => {
    const { result, store } = setup();

    act(() => result.current.createComponentSelected("Pair"));
    const component = store.getState().whiteBoard.shapes.find((shape) => shape.componentDefinition)!;
    expect(component.componentName).toBe("Pair");
    act(() => result.current.addComponentInstance(component.id, { x: 200, y: 100 }));
    const instance = store.getState().whiteBoard.shapes.find((shape) => shape.instanceOf === component.id)!;
    expect(instance).toBeDefined();
    act(() => store.dispatch(setSelectedShapes([instance.id])));
    act(() => result.current.resetSelectedInstance());
    act(() => result.current.swapSelectedVariant(component.id));
    act(() => result.current.detachSelectedInstance());
    expect(store.getState().whiteBoard.shapes.find((shape) => shape.id === instance.id)?.instanceOf).toBeUndefined();

    act(() => store.dispatch(setSelectedShapes([component.id])));
    act(() => result.current.createVariantSetSelected());
    act(() => result.current.createStyleFromSelected("fill-style", "Brand"));
    const style = store.getState().whiteBoard.shapes.find((shape) => shape.resourceKind === "fill-style")!;
    act(() => result.current.applyStyleToSelected(style.id));
    act(() => result.current.createLibraryVariable("color-variable", "Accent", "#b87a2e"));
    const variable = store.getState().whiteBoard.shapes.find((shape) => shape.resourceKind === "color-variable")!;
    act(() => result.current.bindVariableToSelected("backgroundColor", variable.id));
    expect(store.getState().whiteBoard.shapes.find((shape) => shape.id === component.id)?.backgroundColor).toBe("#b87a2e");

    act(() => store.dispatch(setSelectedShapes(["a", "b"])));
    act(() => result.current.booleanSelected("union"));
    const boolean = store.getState().whiteBoard.shapes.find((shape) => shape.type === "boolean")!;
    act(() => result.current.flattenSelectedBoolean());
    expect(store.getState().whiteBoard.shapes.some((shape) => shape.id === boolean.id)).toBe(false);

    const drawable = store.getState().whiteBoard.shapes.filter((shape) => shape.type === "rectangle").slice(0, 2);
    act(() => store.dispatch(setSelectedShapes(drawable.map((shape) => shape.id))));
    act(() => result.current.maskSelected());
    act(() => result.current.releaseSelectedMask());

    act(() => result.current.addPage());
    const page = store.getState().whiteBoard.shapes.find((shape) => shape.type === "page-resource")!;
    act(() => result.current.renameDocumentPage(page.id, "Flows"));
    act(() => result.current.duplicateDocumentPage(page.id));
    const pages = store.getState().whiteBoard.shapes.filter((shape) => shape.type === "page-resource");
    expect(pages).toHaveLength(3);
    act(() => result.current.deleteDocumentPage(pages[0]!.id));

    const sectionCandidates = store.getState().whiteBoard.shapes.filter((shape) => shape.type === "rectangle").slice(0, 2);
    act(() => store.dispatch(setSelectedShapes(sectionCandidates.map((shape) => shape.id))));
    act(() => result.current.sectionSelected());
    const section = store.getState().whiteBoard.shapes.find((shape) => shape.type === "section");
    if (section) {
      act(() => store.dispatch(setSelectedShapes([section.id])));
      act(() => result.current.collectSelectedSections());
    }
  });

  it("handles commit guards, defaults, overrides, and editor board permissions", async () => {
    const { result, store } = setup();
    const current = store.getState().whiteBoard.shapes;

    act(() => result.current.commitShapes(current));
    expect(store.getState().editor.localPreviewActive).toBe(false);

    const withModes = [{ ...current[0]!, opacity: 0.75, activeVariableModes: { theme: "dark" } }, current[1]!];
    act(() => result.current.commitShapes(withModes, current, { ...store.getState().whiteBoard, id: "override" }));
    expect(store.getState().whiteBoard.shapes[0]?.opacity).toBe(0.75);

    act(() => store.dispatch(setWhiteboardData({ id: null })));
    act(() => result.current.commitShapes([rect("new", 0)]));
    expect(store.getState().whiteBoard.shapes.some((shape) => shape.id === "new")).toBe(false);

    const editorSetup = setup("editor");
    act(() => editorSetup.result.current.commitBoardPatch({ title: "Forbidden" }));
    expect(mocks.update).not.toHaveBeenCalled();
    act(() => editorSetup.result.current.commitBoardPatch({ backGroundColor: "#fafafa" }));
    expect(mocks.storageSet).toHaveBeenCalledWith("backgroundColor", "#fafafa");

    const owner = setup();
    act(() => owner.result.current.commitBoardPatch({ backGroundColor: owner.store.getState().whiteBoard.backGroundColor, type: "team" }));
    expect(mocks.update).not.toHaveBeenCalled();
    act(() => owner.result.current.commitBoardPatch({ type: "private" }));
    await waitFor(() => expect(owner.store.getState().editor.saveStatus).toBe("saved"));

    mocks.update.mockRejectedValueOnce(new Error("Settings failed"));
    act(() => owner.result.current.commitBoardPatch({ title: "Rejected" }));
    await waitFor(() => expect(owner.store.getState().editor.saveError).toBe("Settings failed"));

    mocks.update.mockRejectedValueOnce("bad settings");
    act(() => owner.result.current.commitBoardPatch({ title: "Rejected again" }));
    await waitFor(() => expect(owner.store.getState().editor.saveError).toBe("We couldn't save board settings."));

    Object.defineProperty(window.navigator, "onLine", { configurable: true, value: false });
    mocks.update.mockRejectedValueOnce(new Error("Offline"));
    act(() => owner.result.current.commitBoardPatch({ title: "Queued" }));
    await waitFor(() => expect(window.localStorage.getItem("kumo:offline-queue")).toContain("Queued"));
    expect(owner.store.getState().editor.saveStatus).toBe("saving");
  });

  it("covers invalid selections and the no-result command paths", () => {
    const { result, store } = setup();
    act(() => store.dispatch(setSelectedShapes([])));

    act(() => {
      result.current.createComponentSelected();
      result.current.createVariantSetSelected();
      result.current.addComponentInstance("missing");
      result.current.detachSelectedInstance();
      result.current.resetSelectedInstance();
      result.current.swapSelectedVariant("missing");
      result.current.createStyleFromSelected("fill-style", "Missing");
      result.current.booleanSelected("union");
      result.current.flattenSelectedBoolean();
      result.current.releaseSelectedMask();
      result.current.sectionSelected();
      result.current.collectSelectedSections();
      result.current.copySelected();
      result.current.frameSelected();
      result.current.unframeSelected();
    });
    expect(store.getState().selected.selectedShapes).toEqual([]);

    act(() => result.current.duplicateDocumentPage("missing"));
    expect(store.getState().editor.currentPageId).toBeNull();

    const first = { ...rect("first-component", 0), componentDefinition: true, componentName: "First" };
    const second = { ...rect("second-component", 40), componentDefinition: true, componentName: "Second" };
    act(() => store.dispatch(setWhiteboardData({ shapes: [first, second] })));
    act(() => store.dispatch(setSelectedShapes([first.id, second.id])));
    act(() => result.current.createVariantSetSelected());
    expect(store.getState().whiteBoard.shapes.every((shape) => Boolean(shape.componentSetId))).toBe(true);

    act(() => result.current.cutSelected());
    expect(store.getState().whiteBoard.shapes).toEqual([]);
  });

  it("copies and pastes within frame hierarchy and releases masks from either side", async () => {
    const { result, store } = setup();
    const frame: Shape = { ...rect("frame", 100), type: "frame", x2: 300, y2: 200, width: 200, height: 200 };
    const child: Shape = { ...rect("child", 120), parentId: frame.id };
    act(() => store.dispatch(setWhiteboardData({ shapes: [frame, child] })));
    act(() => store.dispatch(setSelectedShapes([child.id])));
    act(() => result.current.copySelected());
    expect(store.getState().editor.clipboardParentBounds).not.toBeNull();
    await act(async () => { await result.current.paste({ targetFrameId: frame.id }); });
    expect(store.getState().editor.clipboard[0]?.parentId).toBe(frame.id);

    act(() => store.dispatch(setWhiteboardData({ shapes: [rect("a", 0), rect("b", 40)] })));
    act(() => store.dispatch(setSelectedShapes(["a", "b"])));
    act(() => result.current.maskSelected());
    act(() => store.dispatch(setSelectedShapes(["b"])));
    act(() => result.current.releaseSelectedMask());
    expect(store.getState().whiteBoard.shapes.find((shape) => shape.id === "b")?.maskId).toBeUndefined();

    act(() => store.dispatch(setSelectedShapes(["a", "b"])));
    act(() => result.current.maskSelected());
    act(() => store.dispatch(setSelectedShapes(["a"])));
    act(() => result.current.releaseSelectedMask());
    expect(store.getState().whiteBoard.shapes.find((shape) => shape.id === "a")?.isMask).toBe(false);
  });

  it("frames, unframes, and applies default or protected geometry", () => {
    const { result, store } = setup();
    act(() => store.dispatch(setSelectedShapes(["a", "b"])));
    act(() => result.current.frameSelected());
    const frame = store.getState().whiteBoard.shapes.find((shape) => shape.type === "frame")!;
    expect(frame).toBeDefined();

    act(() => result.current.setShapeGeometry(frame, {}));
    act(() => store.dispatch(setSelectedShapes([frame.id])));
    act(() => result.current.unframeSelected());
    expect(store.getState().whiteBoard.shapes.some((shape) => shape.id === frame.id)).toBe(false);

    const locked = { ...store.getState().whiteBoard.shapes[0]!, locked: true };
    act(() => store.dispatch(setWhiteboardData({ shapes: [locked, store.getState().whiteBoard.shapes[1]!] })));
    const before = store.getState().whiteBoard.shapes[0];
    act(() => result.current.setShapeGeometry(locked, { x: 500 }));
    expect(store.getState().whiteBoard.shapes[0]).toEqual(before);
  });

  it("short-circuits unavailable paste states and reports non-Error failures", async () => {
    const { result, store } = setup();
    act(() => store.dispatch(setClipboard({ shapes: [], boardId: "board" })));
    await act(async () => { await result.current.paste(); });

    act(() => store.dispatch(setClipboard({ shapes: [rect("copy", 0)], boardId: "board" })));
    act(() => store.dispatch(setWhiteboardData({ id: null })));
    await act(async () => { await result.current.paste(); });

    act(() => store.dispatch(setWhiteboardData({ id: "board" })));
    await act(async () => { await result.current.paste(); });
    expect(store.getState().whiteBoard.shapes.some((shape) => shape.id !== "a" && shape.id !== "b")).toBe(true);

    mocks.clone.mockRejectedValueOnce("clone failed");
    act(() => store.dispatch(setClipboard({ shapes: [rect("remote", 0, "image")], boardId: "other" })));
    await act(async () => { await result.current.paste(); });
    expect(store.getState().editor.saveError).toBe("We couldn't paste these assets.");
  });
});
