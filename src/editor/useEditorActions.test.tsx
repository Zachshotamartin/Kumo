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

const setup = (role: "owner" | "viewer" = "owner") => {
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
});
