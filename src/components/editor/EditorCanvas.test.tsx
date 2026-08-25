import { configureStore } from "@reduxjs/toolkit";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { Provider } from "react-redux";
import { Shape } from "../../classes/shape";
import actionsReducer from "../../features/actions/actionsSlice";
import { setGrid } from "../../features/actions/actionsSlice";
import authReducer, { login } from "../../features/auth/authSlice";
import editorReducer, { setEditingShapeId, setHoveredShapeId, setMeasureMode, setShowRulers, setSnapToGrid } from "../../features/editor/editorSlice";
import selectedReducer, { setSelectedShapes, setSelectedTool } from "../../features/selected/selectedSlice";
import whiteBoardReducer, { setWhiteboardData, type WhiteBoardState } from "../../features/whiteBoard/whiteBoardSlice";
import EditorCanvas, { EditorCanvasView } from "./EditorCanvas";
import { getBoard } from "../../services/boardRepository";
import { deleteBoardAsset, uploadBoardAsset } from "../../services/assetRepository";
import { recordBoardVisit } from "../../platform/recentBoards";
import type { EditorActions } from "../../editor/useEditorActions";

const editorActions = vi.hoisted(() => ({
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
  frameSelected: vi.fn(),
  unframeSelected: vi.fn(),
  nudgeSelected: vi.fn(),
  undo: vi.fn(),
  redo: vi.fn(),
  setShapeGeometry: vi.fn(),
}));

const presence = vi.hoisted(() => ({ update: vi.fn() }));

vi.mock("@liveblocks/react", () => ({
  useUpdateMyPresence: () => presence.update,
  useMutation: () => vi.fn(),
}));
vi.mock("../../comments/CommentPins", () => ({
  CommentPins: () => <div data-testid="comment-pins" />,
}));
vi.mock("../../editor/useEditorActions", () => ({
  useEditorActions: () => editorActions,
}));
vi.mock("../../services/boardRepository", () => ({
  getBoard: vi.fn(),
}));
vi.mock("../../services/assetRepository", () => ({
  deleteBoardAsset: vi.fn(),
  uploadBoardAsset: vi.fn(),
}));
vi.mock("../../platform/recentBoards", () => ({ recordBoardVisit: vi.fn() }));

const rectangle = (rotation = 0): Shape => ({
  id: "shape-1",
  type: "rectangle",
  name: "Rectangle",
  x1: 0,
  y1: 0,
  x2: 100,
  y2: 80,
  width: 100,
  height: 80,
  level: 0,
  zIndex: 1,
  rotation,
  backgroundColor: "#ffffff",
});

const textShape = (): Shape => ({
  ...rectangle(),
  id: "text-1",
  type: "text",
  name: "Text",
  text: "Select part of this text",
  backgroundColor: "transparent",
  borderWidth: 0,
  color: "#ffffff",
  fontSize: 18,
  fontFamily: "Arial",
  fontWeight: "normal",
  textAlign: "left",
  alignItems: "center",
  textDecoration: "none",
  lineHeight: 1.2,
  letterSpacing: 0,
});

const renderCanvas = (input: Shape | Shape[], options: {
  canEdit?: boolean;
  showCommentPins?: boolean;
  applyCollaborativeText?: (shapeId: string, previousText: string, nextText: string) => void;
  board?: Partial<WhiteBoardState>;
  useView?: boolean;
  authenticated?: boolean;
  rawShapes?: boolean;
} = {}) => {
  const shapes = Array.isArray(input) ? input : [input];
  editorActions.canEdit = options.canEdit ?? true;
  const rawWhiteBoard = {
    ...whiteBoardReducer(undefined, { type: "@@init" }),
    id: "board-1",
    roomId: "board:board-1",
    role: "owner" as const,
    shapes,
    ...options.board,
  };
  const store = configureStore({
    reducer: {
      auth: authReducer,
      whiteBoard: whiteBoardReducer,
      actions: actionsReducer,
      selected: selectedReducer,
      editor: editorReducer,
    },
    ...(options.rawShapes ? { preloadedState: { whiteBoard: rawWhiteBoard } } : {}),
  });
  if (!options.rawShapes) {
    store.dispatch(setWhiteboardData({
      id: "board-1",
      roomId: "board:board-1",
      role: "owner",
      shapes,
      ...options.board,
    }));
  }
  if (options.authenticated !== false) store.dispatch(login({ uid: "local-user", email: "local@example.com" }));
  store.dispatch(setSelectedShapes(shapes[0] ? [shapes[0].id] : []));
  const rendered = render(
    <Provider store={store}>
      {options.useView
        ? <EditorCanvasView
            actions={editorActions as unknown as EditorActions}
            updateMyPresence={presence.update}
            showCommentPins={options.showCommentPins}
            applyCollaborativeText={options.applyCollaborativeText}
          />
        : <EditorCanvas />}
    </Provider>
  );
  const canvas = within(rendered.container).getByRole("application", { name: "Kumo design canvas" });
  Object.defineProperties(canvas, {
    getBoundingClientRect: {
      value: () => ({
        x: 0,
        y: 0,
        left: 0,
        top: 0,
        right: 800,
        bottom: 600,
        width: 800,
        height: 600,
        toJSON: () => ({}),
      }),
    },
    setPointerCapture: { value: vi.fn(), configurable: true },
    releasePointerCapture: { value: vi.fn(), configurable: true },
    hasPointerCapture: { value: () => true, configurable: true },
  });
  return { canvas, store, rendered };
};

describe("EditorCanvas transform interactions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    editorActions.canEdit = true;
    vi.mocked(deleteBoardAsset).mockResolvedValue(undefined);
  });

  it("commits a two-axis flip when a corner crosses its opposite anchor", () => {
    const { canvas } = renderCanvas(rectangle());
    const handle = screen.getByRole("button", { name: "Resize from bottom right" });
    fireEvent.pointerDown(handle, { pointerId: 7, button: 0, clientX: 100, clientY: 80 });
    fireEvent.pointerMove(canvas, { pointerId: 7, clientX: -50, clientY: -40 });
    expect(screen.getByRole("group", { name: "Selection transform controls" }))
      .toHaveStyle({ transform: "rotate(0deg) scaleX(-1) scaleY(-1)" });
    fireEvent.pointerUp(canvas, { pointerId: 7, clientX: -50, clientY: -40 });

    const committed = editorActions.commitShapes.mock.calls.at(-1)?.[0] as Shape[];
    expect(committed[0]).toMatchObject({
      x1: -50,
      y1: -40,
      x2: 0,
      y2: 0,
      flipX: true,
      flipY: true,
    });
  });

  it("commits rotation from the canvas rotation handle", () => {
    const { canvas } = renderCanvas(rectangle());
    const handle = screen.getByRole("button", { name: "Rotate selection" });
    fireEvent.pointerDown(handle, { pointerId: 9, button: 0, clientX: 50, clientY: -32 });
    fireEvent.pointerMove(canvas, { pointerId: 9, clientX: 150, clientY: 40, shiftKey: true });
    fireEvent.pointerUp(canvas, { pointerId: 9, clientX: 150, clientY: 40 });

    const committed = editorActions.commitShapes.mock.calls.at(-1)?.[0] as Shape[];
    expect(committed[0]!.rotation).toBe(90);
  });

  it("renders transform controls in the local frame of a rotated shape", () => {
    renderCanvas(rectangle(35));
    const controls = screen.getByRole("group", { name: "Selection transform controls" });
    expect(controls).toHaveStyle({ transform: "rotate(35deg) scaleX(1) scaleY(1)" });
  });

  it("publishes the latest pointer coordinate in each animation frame", () => {
    let frame: FrameRequestCallback | undefined;
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      frame = callback;
      return 1;
    });
    const { canvas } = renderCanvas(rectangle());
    fireEvent.pointerMove(canvas, { pointerId: 1, clientX: 10, clientY: 20 });
    fireEvent.pointerMove(canvas, { pointerId: 1, clientX: 30, clientY: 40 });
    frame?.(0);
    expect(presence.update).toHaveBeenLastCalledWith({ cursor: { x: 30, y: 40 } });
  });

  it("opens ephemeral cursor chat with slash and publishes text through presence", () => {
    renderCanvas(rectangle());
    fireEvent.keyDown(window, { key: "/" });
    const chat = screen.getByRole("textbox", { name: "Cursor chat" });
    fireEvent.change(chat, { target: { value: "Move this left?" } });
    expect(presence.update).toHaveBeenLastCalledWith({ cursorChat: "Move this left?" });
    fireEvent.keyDown(chat, { key: "Enter" });
    expect(presence.update).toHaveBeenLastCalledWith({ cursorChat: "" });
    fireEvent.keyDown(chat, { key: "Escape" });
    expect(screen.queryByRole("textbox", { name: "Cursor chat" })).not.toBeInTheDocument();
  });

  it("blocks a second transform while another collaborator owns the same shape", () => {
    const { canvas, store } = renderCanvas(rectangle());
    act(() => {
      store.dispatch(setWhiteboardData({
        currentUsers: [{
          uid: "remote", label: "Ada", cursorX: 20, cursorY: 20,
          activeShapeIds: ["shape-1"], activity: "moving", cursorChat: "",
        }],
      }));
    });
    fireEvent.pointerDown(canvas, { pointerId: 22, button: 0, clientX: 10, clientY: 10 });
    expect(screen.getByRole("status")).toHaveTextContent("Ada is moving this selection");
    fireEvent.pointerMove(canvas, { pointerId: 22, clientX: 80, clientY: 80 });
    fireEvent.pointerUp(canvas, { pointerId: 22, clientX: 80, clientY: 80 });
    expect(editorActions.commitShapes).not.toHaveBeenCalled();
  });

  it("blocks destructive and geometry keyboard commands during a remote edit", () => {
    const { store } = renderCanvas(rectangle());
    act(() => {
      store.dispatch(setWhiteboardData({
        currentUsers: [{
          uid: "remote", label: "Ada", cursorX: 20, cursorY: 20,
          activeShapeIds: ["shape-1"], activity: "resizing", cursorChat: "",
        }],
      }));
    });

    fireEvent.keyDown(window, { key: "Delete" });
    fireEvent.keyDown(window, { key: "ArrowRight" });
    fireEvent.keyDown(window, { key: "x", metaKey: true });
    fireEvent.keyDown(window, { key: "g", metaKey: true });
    fireEvent.keyDown(window, { key: "]" });

    expect(screen.getByRole("status")).toHaveTextContent("Ada is resizing this selection");
    expect(editorActions.removeSelected).not.toHaveBeenCalled();
    expect(editorActions.nudgeSelected).not.toHaveBeenCalled();
    expect(editorActions.cutSelected).not.toHaveBeenCalled();
    expect(editorActions.groupSelected).not.toHaveBeenCalled();
    expect(editorActions.orderSelected).not.toHaveBeenCalled();
  });

  it("deterministically yields a simultaneous transform to the same winning collaborator", () => {
    const { canvas, store } = renderCanvas(rectangle());
    fireEvent.pointerDown(canvas, { pointerId: 24, button: 0, clientX: 10, clientY: 10 });
    fireEvent.pointerMove(canvas, { pointerId: 24, clientX: 40, clientY: 40 });
    expect(editorActions.previewShapes).toHaveBeenCalled();

    act(() => {
      store.dispatch(setWhiteboardData({
        currentUsers: [{
          uid: "a-remote-user", label: "Ada", cursorX: 20, cursorY: 20,
          activeShapeIds: ["shape-1"], activity: "moving", cursorChat: "",
        }],
      }));
    });

    expect(editorActions.cancelPreview).toHaveBeenCalled();
    expect(screen.getByRole("status")).toHaveTextContent("Ada took control");
    fireEvent.pointerUp(canvas, { pointerId: 24, clientX: 40, clientY: 40 });
    expect(editorActions.commitShapes).not.toHaveBeenCalled();
  });

  it("cancels browser pinch zoom and applies a strong, symmetric canvas zoom", () => {
    const { canvas, store } = renderCanvas(rectangle());
    const event = new WheelEvent("wheel", {
      bubbles: true,
      cancelable: true,
      clientX: 400,
      clientY: 300,
      ctrlKey: true,
      deltaY: -100,
    });

    act(() => { expect(canvas.dispatchEvent(event)).toBe(false); });
    expect(event.defaultPrevented).toBe(true);
    expect(store.getState().editor.viewport.zoom).toBeCloseTo(1.5);
    expect(store.getState().editor.viewport).toMatchObject({
      x: expect.any(Number),
      y: expect.any(Number),
    });

    act(() => {
      canvas.dispatchEvent(new WheelEvent("wheel", {
        bubbles: true,
        cancelable: true,
        clientX: 400,
        clientY: 300,
        ctrlKey: true,
        deltaY: 100,
      }));
    });
    expect(store.getState().editor.viewport.zoom).toBeCloseTo(1);
  });

  it("cancels page scrolling and pans the canvas for an ordinary wheel gesture", () => {
    const { canvas, store } = renderCanvas(rectangle());
    const event = new WheelEvent("wheel", {
      bubbles: true,
      cancelable: true,
      deltaX: 24,
      deltaY: 40,
    });

    act(() => { canvas.dispatchEvent(event); });

    expect(event.defaultPrevented).toBe(true);
    expect(store.getState().editor.viewport).toMatchObject({ x: 24, y: 40, zoom: 1 });
  });

  it("ignores a stale linked-board response after a newer navigation", async () => {
    const first = { ...rectangle(), id: "first", type: "board", boardId: "board-a" };
    const second = {
      ...rectangle(),
      id: "second",
      type: "board",
      boardId: "board-b",
      x1: 200,
      x2: 300,
      zIndex: 2,
    };
    let resolveFirst: (value: Awaited<ReturnType<typeof getBoard>>) => void = () => undefined;
    let resolveSecond: (value: Awaited<ReturnType<typeof getBoard>>) => void = () => undefined;
    vi.mocked(getBoard)
      .mockImplementationOnce(() => new Promise((resolve) => { resolveFirst = resolve; }))
      .mockImplementationOnce(() => new Promise((resolve) => { resolveSecond = resolve; }));
    const { canvas, store } = renderCanvas([first, second]);
    fireEvent.doubleClick(canvas, { clientX: 10, clientY: 10 });
    fireEvent.doubleClick(canvas, { clientX: 210, clientY: 10 });
    const boardState = (id: string) => ({
      ...store.getState().whiteBoard,
      id,
      roomId: `board:${id}`,
      shapes: [],
    });
    await act(async () => { resolveSecond(boardState("board-b")); });
    expect(store.getState().whiteBoard.id).toBe("board-b");
    await act(async () => { resolveFirst(boardState("board-a")); });
    expect(store.getState().whiteBoard.id).toBe("board-b");
  });

  it("renders and blocks a linked board whose destination is private", () => {
    const linked = { ...rectangle(), id: "link", type: "board", boardId: "private", title: "Private roadmap" };
    const { canvas, store } = renderCanvas(linked);
    act(() => {
      store.dispatch(setWhiteboardData({
        linkedBoards: {
          private: { id: "private", title: "Private roadmap", visibility: "private", accessible: false, role: null },
        },
      }));
    });
    expect(screen.getByText("Access required")).toBeInTheDocument();
    fireEvent.doubleClick(canvas, { clientX: 10, clientY: 10 });
    expect(screen.getByRole("alert")).toHaveTextContent("owner needs to share");
    expect(getBoard).not.toHaveBeenCalled();
  });

  it("supports native text ranges and commits the exact edited value", () => {
    const { canvas } = renderCanvas(textShape());
    fireEvent.doubleClick(canvas, { clientX: 10, clientY: 10 });
    const editor = screen.getByRole("textbox", { name: "Edit text" }) as HTMLTextAreaElement;

    editor.setSelectionRange(7, 11);
    expect({ start: editor.selectionStart, end: editor.selectionEnd }).toEqual({ start: 7, end: 11 });
    fireEvent.change(editor, { target: { value: "Select a section of this text" } });
    expect(editorActions.previewShapes).toHaveBeenLastCalledWith([
      expect.objectContaining({ id: "text-1", text: "Select a section of this text" }),
    ]);
    fireEvent.blur(editor);
    expect(editorActions.commitShapes).toHaveBeenLastCalledWith(
      [expect.objectContaining({ id: "text-1", text: "Select a section of this text" })],
      [expect.objectContaining({ id: "text-1", text: "Select part of this text" })]
    );
  });

  it("grows auto-height text live while preserving its wrapping width", () => {
    const autoHeightText: Shape = {
      ...textShape(),
      x2: 100,
      y2: 24,
      width: 100,
      height: 24,
      textAutoResize: "auto-height",
    };
    const { canvas } = renderCanvas(autoHeightText);
    fireEvent.doubleClick(canvas, { clientX: 10, clientY: 10 });
    const editor = screen.getByRole("textbox", { name: "Edit text" });
    fireEvent.change(editor, {
      target: { value: "This paragraph is long enough to wrap over several lines without scrolling." },
    });

    const preview = editorActions.previewShapes.mock.calls.at(-1)?.[0] as Shape[];
    expect(preview[0]!.width).toBe(100);
    expect(preview[0]!.height).toBeGreaterThan(24);
    expect(editor).toHaveAttribute("wrap", "soft");
  });

  it("enters text editing from the keyboard", () => {
    renderCanvas(textShape());
    fireEvent.keyDown(window, { key: "Enter" });
    expect(screen.getByRole("textbox", { name: "Edit text" })).toBeInTheDocument();
  });

  it("exposes the complete ordering and grouping context actions", () => {
    const first = rectangle();
    const second = { ...rectangle(), id: "shape-2", x1: 150, x2: 250, zIndex: 2 };
    const { canvas, store } = renderCanvas([first, second]);
    act(() => { store.dispatch(setSelectedShapes([first.id, second.id])); });
    fireEvent.contextMenu(canvas, { clientX: 10, clientY: 10 });

    expect(screen.getByRole("menuitem", { name: "Group" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Bring forward" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Send backward" })).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "Ungroup" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("menuitem", { name: "Group" }));
    expect(editorActions.groupSelected).toHaveBeenCalledOnce();
  });

  it("offers ungroup instead of regrouping an existing group", () => {
    const first = { ...rectangle(), groupId: "group" };
    const second = { ...rectangle(), id: "shape-2", x1: 150, x2: 250, zIndex: 2, groupId: "group" };
    const { canvas, store } = renderCanvas([first, second]);
    act(() => { store.dispatch(setSelectedShapes([first.id, second.id])); });
    fireEvent.contextMenu(canvas, { clientX: 10, clientY: 10 });

    expect(screen.getByRole("menuitem", { name: "Ungroup" })).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "Group" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("menuitem", { name: "Ungroup" }));
    expect(editorActions.ungroupSelected).toHaveBeenCalledOnce();
  });

  it("opens a newly drawn text box for typing immediately", () => {
    const { canvas, store } = renderCanvas(rectangle());
    act(() => { store.dispatch(setSelectedTool("text")); });
    fireEvent.pointerDown(canvas, { pointerId: 12, button: 0, clientX: 240, clientY: 180 });
    fireEvent.pointerUp(canvas, { pointerId: 12, button: 0, clientX: 240, clientY: 180 });

    const committed = editorActions.commitShapes.mock.calls.at(-1)?.[0] as Shape[];
    const created = committed.find((shape) => shape.type === "text");
    expect(created).toMatchObject({
      width: 180,
      height: 40,
      text: "Type something",
      textAutoResize: "auto-width",
    });
    expect(store.getState().editor.editingShapeId).toBe(created?.id);
    expect(store.getState().selected.selectedTool).toBe("pointer");
  });

  it("creates dragged text as fixed-width, auto-height area text", () => {
    const { canvas, store } = renderCanvas(rectangle());
    act(() => { store.dispatch(setSelectedTool("text")); });
    fireEvent.pointerDown(canvas, { pointerId: 13, button: 0, clientX: 240, clientY: 180 });
    fireEvent.pointerMove(canvas, { pointerId: 13, clientX: 440, clientY: 280 });
    fireEvent.pointerUp(canvas, { pointerId: 13, clientX: 440, clientY: 280 });

    const committed = editorActions.commitShapes.mock.calls.at(-1)?.[0] as Shape[];
    const created = committed.find((shape) => shape.type === "text");
    expect(created).toMatchObject({
      width: 200,
      textAutoResize: "auto-height",
    });
    expect(created!.height).toBeLessThan(100);
  });

  it("selects a frame first, deep-selects its child, and traverses hierarchy with Enter", () => {
    const parent: Shape = {
      ...rectangle(),
      id: "frame-1",
      type: "frame",
      name: "Frame",
      x2: 240,
      y2: 200,
      width: 240,
      height: 200,
      clipContent: true,
    };
    const child: Shape = {
      ...rectangle(),
      id: "child-1",
      name: "Child",
      parentId: parent.id,
      x1: 20,
      y1: 20,
      x2: 80,
      y2: 80,
      width: 60,
      height: 60,
      zIndex: 2,
    };
    const { canvas, store } = renderCanvas([parent, child]);
    act(() => { store.dispatch(setSelectedShapes([])); });

    fireEvent.pointerDown(canvas, { pointerId: 31, button: 0, clientX: 30, clientY: 30 });
    fireEvent.pointerUp(canvas, { pointerId: 31, clientX: 30, clientY: 30 });
    expect(store.getState().selected.selectedShapes).toEqual([parent.id]);

    fireEvent.keyDown(window, { key: "Enter" });
    expect(store.getState().selected.selectedShapes).toEqual([child.id]);
    fireEvent.keyDown(window, { key: "Enter", shiftKey: true });
    expect(store.getState().selected.selectedShapes).toEqual([parent.id]);

    fireEvent.pointerDown(canvas, { pointerId: 32, button: 0, clientX: 30, clientY: 30, metaKey: true });
    fireEvent.pointerUp(canvas, { pointerId: 32, clientX: 30, clientY: 30, metaKey: true });
    expect(store.getState().selected.selectedShapes).toEqual([child.id]);

    act(() => { store.dispatch(setSelectedShapes([])); });
    fireEvent.doubleClick(canvas, { clientX: 30, clientY: 30 });
    expect(store.getState().selected.selectedShapes).toEqual([child.id]);
  });

  it("double-clicks through a logical group to select only the pointed object", () => {
    const first = { ...rectangle(), groupId: "group-1", name: "First" };
    const second = {
      ...rectangle(),
      id: "shape-2",
      groupId: "group-1",
      name: "Second",
      x1: 140,
      x2: 240,
      zIndex: 2,
    };
    const { canvas, store } = renderCanvas([first, second]);
    act(() => { store.dispatch(setSelectedShapes([])); });

    fireEvent.pointerDown(canvas, { pointerId: 42, button: 0, clientX: 20, clientY: 20 });
    fireEvent.pointerUp(canvas, { pointerId: 42, clientX: 20, clientY: 20 });
    expect(store.getState().selected.selectedShapes).toEqual([first.id, second.id]);

    fireEvent.doubleClick(canvas, { clientX: 20, clientY: 20 });
    expect(store.getState().selected.selectedShapes).toEqual([first.id]);
  });

  it("draws a frame around objects and adopts them without moving their coordinates", () => {
    const existing = { ...rectangle(), x1: 20, y1: 20, x2: 80, y2: 70, width: 60, height: 50 };
    const { canvas, store } = renderCanvas(existing);
    act(() => { store.dispatch(setSelectedTool("frame")); });
    fireEvent.pointerDown(canvas, { pointerId: 33, button: 0, clientX: 0, clientY: 0 });
    fireEvent.pointerMove(canvas, { pointerId: 33, clientX: 120, clientY: 100 });
    fireEvent.pointerUp(canvas, { pointerId: 33, clientX: 120, clientY: 100 });

    const committed = editorActions.commitShapes.mock.calls.at(-1)?.[0] as Shape[];
    const created = committed.find((shape) => shape.type === "frame")!;
    expect(created).toMatchObject({ backgroundColor: "#ffffff" });
    expect(committed.find((shape) => shape.id === existing.id)).toMatchObject({
      parentId: created.id,
      x1: 20,
      y1: 20,
    });
    expect(created.zIndex).toBeLessThan(committed.find((shape) => shape.id === existing.id)!.zIndex);
  });

  it("reparents a dragged object into a frame and raises it above existing children", () => {
    const parent: Shape = { ...rectangle(), id: "frame", type: "frame", name: "Frame", x2: 220, y2: 180, width: 220, height: 180, zIndex: 1 };
    const existing: Shape = { ...rectangle(), id: "existing", parentId: parent.id, x1: 20, y1: 20, x2: 60, y2: 60, width: 40, height: 40, zIndex: 3 };
    const moving: Shape = { ...rectangle(), id: "moving", x1: 300, y1: 40, x2: 360, y2: 100, width: 60, height: 60, zIndex: 2 };
    const { canvas, store } = renderCanvas([parent, existing, moving]);
    act(() => { store.dispatch(setSelectedShapes([moving.id])); });
    fireEvent.pointerDown(canvas, { pointerId: 34, button: 0, clientX: 320, clientY: 60 });
    fireEvent.pointerMove(canvas, { pointerId: 34, clientX: 100, clientY: 80, ctrlKey: true });
    fireEvent.pointerUp(canvas, { pointerId: 34, clientX: 100, clientY: 80, ctrlKey: true });

    const committed = editorActions.commitShapes.mock.calls.at(-1)?.[0] as Shape[];
    const result = committed.find((shape) => shape.id === moving.id)!;
    expect(result.parentId).toBe(parent.id);
    expect(result.zIndex).toBeGreaterThan(existing.zIndex);
  });

  it("commits and reparents when pointer capture is lost before release", () => {
    const parent: Shape = { ...rectangle(), id: "frame", type: "frame", name: "Frame", x2: 220, y2: 180, width: 220, height: 180, zIndex: 1 };
    const moving: Shape = { ...rectangle(), id: "moving", x1: 300, y1: 40, x2: 360, y2: 100, width: 60, height: 60, zIndex: 2 };
    const { canvas, store } = renderCanvas([parent, moving]);
    act(() => { store.dispatch(setSelectedShapes([moving.id])); });

    fireEvent.pointerDown(canvas, { pointerId: 44, button: 0, clientX: 320, clientY: 60 });
    fireEvent.pointerMove(canvas, { pointerId: 44, clientX: 100, clientY: 80, ctrlKey: true });
    fireEvent.pointerUp(window, { pointerId: 44, clientX: 100, clientY: 80, ctrlKey: true });

    const committed = editorActions.commitShapes.mock.calls.at(-1)?.[0] as Shape[];
    expect(committed.find((shape) => shape.id === moving.id)).toMatchObject({
      parentId: parent.id,
      x1: 80,
      y1: 60,
    });
  });

  it("shows smart alignment guides during drag and disables them with Control", () => {
    const first = rectangle();
    const target = { ...rectangle(), id: "shape-2", x1: 200, x2: 300, y1: 0, y2: 80, zIndex: 2 };
    const { canvas } = renderCanvas([first, target]);
    fireEvent.pointerDown(canvas, { pointerId: 35, button: 0, clientX: 10, clientY: 10 });
    fireEvent.pointerMove(canvas, { pointerId: 35, clientX: 109, clientY: 10 });
    expect(document.querySelector('[data-guide-axis="x"]')).toBeInTheDocument();
    fireEvent.pointerMove(canvas, { pointerId: 35, clientX: 109, clientY: 10, ctrlKey: true });
    expect(document.querySelector('[data-guide-axis="x"]')).not.toBeInTheDocument();
    fireEvent.pointerCancel(canvas, { pointerId: 35 });
  });

  it("uses the selected frame and viewport for keyboard paste and the cursor for Paste here", () => {
    const parent: Shape = { ...rectangle(), id: "frame", type: "frame", name: "Frame", x2: 240, y2: 200, width: 240, height: 200 };
    const { canvas } = renderCanvas(parent);
    fireEvent.keyDown(window, { key: "v", metaKey: true });
    expect(editorActions.paste).toHaveBeenLastCalledWith(expect.objectContaining({
      targetFrameId: parent.id,
      viewport: { x: 0, y: 0, width: 800, height: 600 },
    }));

    fireEvent.contextMenu(canvas, { clientX: 125, clientY: 145 });
    fireEvent.click(screen.getByRole("menuitem", { name: "Paste here" }));
    expect(editorActions.paste).toHaveBeenLastCalledWith({ point: { x: 125, y: 145 } });
  });

  it("duplicates before an Alt drag and keeps the originals unchanged", () => {
    const { canvas } = renderCanvas(rectangle());
    fireEvent.pointerDown(canvas, { pointerId: 36, button: 0, clientX: 10, clientY: 10, altKey: true });
    fireEvent.pointerMove(canvas, { pointerId: 36, clientX: 50, clientY: 60, ctrlKey: true });
    fireEvent.pointerUp(canvas, { pointerId: 36, clientX: 50, clientY: 60, ctrlKey: true });
    const committed = editorActions.commitShapes.mock.calls.at(-1)?.[0] as Shape[];
    expect(committed).toHaveLength(2);
    expect(committed.find((shape) => shape.id === "shape-1")).toMatchObject({ x1: 0, y1: 0 });
    expect(committed.find((shape) => shape.id !== "shape-1")).toMatchObject({ x1: 40, y1: 50 });
  });

  it("renders locked frame selections without transform handles", () => {
    renderCanvas({ ...rectangle(), type: "frame", locked: true });
    expect(screen.getByRole("group", { name: "Selection transform controls" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Resize from bottom right" })).not.toBeInTheDocument();
  });

  it("executes the complete keyboard command and tool-selection matrix", () => {
    const { store } = renderCanvas(rectangle());
    const command = (key: string, extra: Record<string, boolean> = {}) => fireEvent.keyDown(window, { key, metaKey: true, ...extra });

    command("z");
    command("z", { shiftKey: true });
    command("y");
    command("c");
    command("x");
    command("v");
    command("d");
    command("g");
    command("g", { shiftKey: true });
    command("g", { altKey: true });
    command("+");
    command("-");
    command("=");
    command("0");
    command("1");
    fireEvent.keyDown(window, { key: "Delete" });
    fireEvent.keyDown(window, { key: "Backspace" });
    for (const key of ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"]) {
      fireEvent.keyDown(window, { key, shiftKey: key === "ArrowDown" });
    }
    for (const key of ["v", "h", "f", "r", "o", "p", "l", "m", "k", "e", "s", "a", "d", "u", "t", "i", "b", "c"]) {
      fireEvent.keyDown(window, { key });
    }
    fireEvent.keyDown(window, { key: "]" });
    fireEvent.keyDown(window, { key: "]", ctrlKey: true });
    fireEvent.keyDown(window, { key: "[" });
    fireEvent.keyDown(window, { key: "[", metaKey: true });

    expect(editorActions.undo).toHaveBeenCalledOnce();
    expect(editorActions.redo).toHaveBeenCalledTimes(2);
    expect(editorActions.copySelected).toHaveBeenCalled();
    expect(editorActions.cutSelected).toHaveBeenCalled();
    expect(editorActions.paste).toHaveBeenCalled();
    expect(editorActions.duplicateSelected).toHaveBeenCalled();
    expect(editorActions.groupSelected).toHaveBeenCalled();
    expect(editorActions.ungroupSelected).toHaveBeenCalled();
    expect(editorActions.frameSelected).toHaveBeenCalled();
    expect(editorActions.removeSelected).toHaveBeenCalledTimes(2);
    expect(editorActions.nudgeSelected).toHaveBeenCalledTimes(4);
    expect(editorActions.orderSelected.mock.calls.map(([order]) => order)).toEqual(["forward", "front", "backward", "back"]);
    expect(store.getState().editor.viewport.zoom).toBeGreaterThan(0);

    const input = document.createElement("input");
    document.body.append(input);
    const blur = vi.spyOn(input, "blur");
    fireEvent.keyDown(input, { key: "Escape" });
    fireEvent.keyDown(input, { key: "Delete" });
    expect(blur).toHaveBeenCalledOnce();
    input.remove();

    fireEvent.keyDown(window, { key: "Alt" });
    expect(store.getState().editor.measureMode).toBe(true);
    fireEvent.keyUp(window, { key: "Alt" });
    expect(store.getState().editor.measureMode).toBe(false);
    fireEvent.keyDown(window, { code: "Space" });
    fireEvent.keyUp(window, { code: "Space" });
    fireEvent.keyDown(window, { key: "Escape" });
    expect(store.getState().selected.selectedShapes).toEqual([]);
  });

  it("fits empty and populated documents and renders grid and ruler preferences", () => {
    const empty = renderCanvas([]);
    fireEvent.keyDown(window, { key: "0", metaKey: true });
    expect(empty.store.getState().editor.viewport).toEqual({ x: 0, y: 0, zoom: 1 });

    const populated = renderCanvas({ ...rectangle(), x1: 200, y1: 100, x2: 600, y2: 400, width: 400, height: 300 });
    fireEvent.keyDown(window, { key: "0", ctrlKey: true });
    expect(populated.store.getState().editor.viewport.zoom).toBeGreaterThan(1);
    act(() => {
      populated.store.dispatch(setGrid(false));
      populated.store.dispatch(setShowRulers(false));
    });
    expect(populated.canvas.style.backgroundImage).toBe("");
    expect(within(populated.canvas).queryByRole("button", { name: /Horizontal ruler/ })).not.toBeInTheDocument();
  });

  it("supports comments, erasing, read-only selection, panning, and marquee selection", () => {
    const first = rectangle();
    const second = { ...rectangle(), id: "shape-2", x1: 180, x2: 280, zIndex: 2 };
    const { canvas, store } = renderCanvas([first, second]);

    act(() => { store.dispatch(setSelectedTool("comment")); });
    fireEvent.pointerDown(canvas, { pointerId: 50, button: 0, clientX: 20, clientY: 20 });
    expect(store.getState().editor.commentDraftAnchor).toMatchObject({ shapeId: first.id, x: 20, y: 20 });

    act(() => { store.dispatch(setSelectedTool("eraser")); });
    fireEvent.pointerDown(canvas, { pointerId: 51, button: 0, clientX: 20, clientY: 20 });
    expect(editorActions.commitShapes).toHaveBeenCalled();
    fireEvent.pointerDown(canvas, { pointerId: 52, button: 0, clientX: 500, clientY: 500 });

    act(() => { store.dispatch(setSelectedTool("hand")); });
    fireEvent.pointerDown(canvas, { pointerId: 53, button: 0, clientX: 10, clientY: 10 });
    fireEvent.pointerMove(canvas, { pointerId: 53, clientX: 40, clientY: 55 });
    fireEvent.pointerUp(canvas, { pointerId: 53, clientX: 40, clientY: 55 });
    expect(store.getState().editor.viewport).toMatchObject({ x: -30, y: -45 });

    act(() => {
      store.dispatch(setSelectedTool("pointer"));
      store.dispatch(setSelectedShapes([]));
    });
    fireEvent.pointerDown(canvas, { pointerId: 54, button: 0, clientX: 320, clientY: 200, shiftKey: true, metaKey: true });
    fireEvent.pointerMove(canvas, { pointerId: 54, clientX: -10, clientY: -10 });
    expect(document.querySelector("[aria-hidden='true']")).toBeInTheDocument();
    fireEvent.pointerUp(canvas, { pointerId: 54, clientX: -10, clientY: -10 });

    const readOnly = renderCanvas(first, { canEdit: false });
    fireEvent.pointerDown(readOnly.canvas, { pointerId: 55, button: 0, clientX: 10, clientY: 10, metaKey: true });
    expect(readOnly.store.getState().selected.selectedShapes).toContain(first.id);
    fireEvent.pointerDown(readOnly.canvas, { pointerId: 56, button: 0, clientX: 500, clientY: 500 });
  });

  it("edits vector points, Bézier handles, and every gradient control", () => {
    const vector: Shape = {
      ...rectangle(), id: "vector", type: "vector", vectorClosed: false,
      vectorPoints: [
        { id: "a", x: 0, y: 0, handleOut: { x: 25, y: 10 } },
        { id: "b", x: 100, y: 80, handleIn: { x: 75, y: 70 } },
      ],
    };
    const vectorView = renderCanvas(vector);
    const point = screen.getByRole("button", { name: "Move vector point a" });
    fireEvent.pointerDown(point, { pointerId: 60, button: 0, clientX: 0, clientY: 0 });
    fireEvent.pointerMove(vectorView.canvas, { pointerId: 60, clientX: 20, clientY: 30 });
    fireEvent.pointerUp(vectorView.canvas, { pointerId: 60, clientX: 20, clientY: 30 });
    const handle = screen.getByRole("button", { name: "Move outgoing Bézier handle" });
    fireEvent.pointerDown(handle, { pointerId: 61, button: 0, clientX: 25, clientY: 10 });
    fireEvent.pointerMove(vectorView.canvas, { pointerId: 61, clientX: 35, clientY: 20, altKey: true });
    fireEvent.pointerUp(vectorView.canvas, { pointerId: 61, clientX: 35, clientY: 20 });
    expect(editorActions.commitShapes).toHaveBeenCalledTimes(2);

    const gradient: Shape = {
      ...rectangle(), id: "gradient", fills: [{
        id: "gradient-fill", type: "linear-gradient", visible: true, opacity: 1, gradientAngle: 0,
        gradientStops: [{ id: "start-stop", position: 0.2, color: "#f00", opacity: 1 }],
      }],
    };
    const gradientView = renderCanvas(gradient);
    for (const [name, pointerId, x, y] of [
      ["Move gradient start", 62, 0, 40],
      ["Move gradient stop 20 percent", 63, 40, 40],
      ["Move gradient end", 64, 100, 40],
    ] as const) {
      const control = screen.getByRole("button", { name });
      fireEvent.pointerDown(control, { pointerId, button: 0, clientX: x, clientY: y });
      fireEvent.pointerMove(gradientView.canvas, { pointerId, clientX: x + 15, clientY: y + 10 });
      fireEvent.pointerUp(gradientView.canvas, { pointerId, clientX: x + 15, clientY: y + 10 });
    }
    expect(editorActions.previewShapes).toHaveBeenCalled();
  });

  it("renders masks, portals, rich text, remote activity, guides, and measurements", () => {
    const mask = { ...rectangle(), id: "mask", type: "ellipse", isMask: true, x1: 10, y1: 10, x2: 90, y2: 70 } as Shape;
    const text: Shape = {
      ...textShape(), id: "rich", text: "Rich text", textRuns: [{ id: "run", start: 0, end: 4, color: "#f00", fontWeight: "bold" }],
      fontAxes: { wght: 600 }, openTypeFeatures: { liga: true }, paragraphSpacing: 4,
    };
    const portal: Shape = { ...rectangle(), id: "portal", type: "board", boardId: "linked", title: "Linked", portalPinnedAt: new Date(0).toISOString(), x1: 120, x2: 220 };
    const calendar: Shape = { ...rectangle(), id: "calendar", type: "calendar", x1: 240, x2: 340 };
    const section: Shape = { ...rectangle(), id: "section", type: "section", name: undefined, x1: 360, x2: 460 };
    const masked: Shape = { ...rectangle(), id: "masked", maskId: mask.id, x1: 480, x2: 580 };
    const guide: Shape = { ...rectangle(), id: "guide", type: "guide", guideAxis: "vertical", x1: 40, x2: 40 };
    const hidden: Shape = { ...rectangle(), id: "hidden", hidden: true };
    const { canvas, store } = renderCanvas([text, portal, calendar, section, mask, masked, guide, hidden], {
      board: {
        linkedBoards: { linked: { id: "linked", title: "Linked", visibility: "private", accessible: true, role: "viewer", updatedAt: Date.now(), thumbnailUrl: "https://assets.test/thumb.png" } },
        currentUsers: [
          { uid: "remote", label: "ada", cursorX: 50, cursorY: 60, activeShapeIds: [text.id], activity: "editing", cursorChat: "Hello", textSelection: { shapeId: text.id, start: 0, end: 2 } },
          { uid: "anonymous", cursorX: 70, cursorY: 80, activeShapeIds: [], activity: null, cursorChat: "" },
        ],
      },
    });
    expect(screen.getByText("31")).toBeInTheDocument();
    expect(screen.getByText("Updated · open connected board")).toBeInTheDocument();
    expect(screen.getByText("ada · editing")).toBeInTheDocument();
    expect(screen.getByLabelText("ada editing text")).toBeInTheDocument();
    expect(screen.getByText("Hello")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Vertical guide at 40/ })).toBeInTheDocument();
    fireEvent.doubleClick(screen.getByRole("button", { name: /Vertical guide at 40/ }));
    expect(editorActions.commitShapes).toHaveBeenCalled();

    act(() => {
      store.dispatch(setSelectedShapes([text.id]));
      store.dispatch(setMeasureMode(true));
      store.dispatch(setHoveredShapeId(portal.id));
    });
    expect(screen.getAllByLabelText(/distance/).length).toBeGreaterThan(0);
    fireEvent.pointerLeave(canvas);
    expect(presence.update).toHaveBeenCalledWith({ cursor: null });
  });

  it("navigates linked boards successfully and reports non-Error failures", async () => {
    const linked: Shape = { ...rectangle(), id: "link", type: "board", boardId: "destination", title: "Destination" };
    vi.mocked(getBoard).mockResolvedValue({
      id: "destination", roomId: "board:destination", role: "viewer", title: "Opened", shapes: [],
    } as unknown as Awaited<ReturnType<typeof getBoard>>);
    const success = renderCanvas(linked, { board: { linkedBoards: { destination: { id: "destination", title: "Destination", visibility: "public", accessible: true, role: "viewer" } } } });
    fireEvent.doubleClick(success.canvas, { clientX: 10, clientY: 10 });
    await waitFor(() => expect(success.store.getState().whiteBoard.id).toBe("destination"));
    expect(recordBoardVisit).toHaveBeenCalledWith("local-user", "destination");

    vi.mocked(getBoard).mockRejectedValue("offline");
    const failure = renderCanvas(linked);
    fireEvent.doubleClick(failure.canvas, { clientX: 10, clientY: 10 });
    expect(await screen.findByText("We couldn't open the linked board.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Dismiss navigation error" }));
  });

  it("uploads pasted images, cleans up partial assets, and rejects unsupported drops", async () => {
    vi.stubGlobal("createImageBitmap", vi.fn().mockResolvedValue({ width: 800, height: 400, close: vi.fn() }));
    vi.mocked(uploadBoardAsset).mockResolvedValue({
      id: "asset-1", board_id: "board-1", storage_key: "asset-1", mime_type: "image/png", byte_size: 5,
      width: 800, height: 400, url: "https://assets.test/image.png",
    });
    const { canvas } = renderCanvas(rectangle());
    fireEvent.pointerMove(canvas, { pointerId: 70, clientX: 300, clientY: 200 });
    const file = new File(["image"], "image.png", { type: "image/png" });
    const paste = new Event("paste", { bubbles: true, cancelable: true });
    Object.defineProperty(paste, "clipboardData", { value: { files: [file] } });
    await act(async () => { window.dispatchEvent(paste); });
    expect(uploadBoardAsset).toHaveBeenCalledWith("board-1", file, { width: 800, height: 400 });
    expect(editorActions.commitShapes).toHaveBeenCalledWith(expect.arrayContaining([expect.objectContaining({ assetId: "asset-1", mediaType: "image" })]));

    editorActions.commitShapes.mockImplementationOnce(() => { throw new Error("commit failed"); });
    const secondPaste = new Event("paste", { bubbles: true, cancelable: true });
    Object.defineProperty(secondPaste, "clipboardData", { value: { files: [file] } });
    await act(async () => { window.dispatchEvent(secondPaste); });
    await waitFor(() => expect(deleteBoardAsset).toHaveBeenCalledWith("asset-1"));
    expect(screen.getByRole("alert")).toHaveTextContent("commit failed");

    const unsupported = new File(["text"], "notes.txt", { type: "text/plain" });
    fireEvent.drop(canvas, { dataTransfer: { files: [unsupported], types: ["Files"] }, clientX: 1, clientY: 1 });
    fireEvent.dragOver(canvas, { dataTransfer: { files: [unsupported], types: ["Files"] } });
    expect(vi.mocked(uploadBoardAsset).mock.calls.filter(([, candidate]) => candidate === unsupported)).toHaveLength(0);
    vi.unstubAllGlobals();
  });

  it("uses direct view props for collaborative text and optional comment pins", () => {
    const applyCollaborativeText = vi.fn();
    const { canvas } = renderCanvas(textShape(), { useView: true, showCommentPins: false, applyCollaborativeText });
    expect(screen.queryByTestId("comment-pins")).not.toBeInTheDocument();
    fireEvent.doubleClick(canvas, { clientX: 10, clientY: 10 });
    const editor = screen.getByRole("textbox", { name: "Edit text" });
    fireEvent.change(editor, { target: { value: "Collaborative value" } });
    fireEvent.change(editor, { target: { value: "Collaborative value 2" } });
    expect(applyCollaborativeText).toHaveBeenNthCalledWith(1, "text-1", "Select part of this text", "Collaborative value");
    expect(applyCollaborativeText).toHaveBeenNthCalledWith(2, "text-1", "Collaborative value", "Collaborative value 2");
  });

  it("observes canvas resizing and creates both ruler guide orientations", () => {
    const observe = vi.fn();
    const disconnect = vi.fn();
    vi.stubGlobal("ResizeObserver", class {
      observe = observe;
      disconnect = disconnect;
    });
    const view = renderCanvas(rectangle());
    expect(observe).toHaveBeenCalledWith(view.canvas);
    fireEvent.pointerDown(within(view.canvas).getByRole("button", { name: /Horizontal ruler/ }), { pointerId: 80, button: 0, clientX: 125, clientY: 0 });
    fireEvent.pointerDown(within(view.canvas).getByRole("button", { name: /Vertical ruler/ }), { pointerId: 81, button: 0, clientX: 0, clientY: 145 });
    expect(editorActions.commitShapes.mock.calls.slice(-2).map(([shapes]) => (shapes as Shape[]).at(-1))).toEqual([
      expect.objectContaining({ type: "guide", guideAxis: "vertical", x1: 125, name: "Vertical guide" }),
      expect.objectContaining({ type: "guide", guideAxis: "horizontal", y1: 145, name: "Horizontal guide" }),
    ]);
    view.rendered.unmount();
    expect(disconnect).toHaveBeenCalledOnce();
    vi.unstubAllGlobals();

    const readOnly = renderCanvas(rectangle(), { canEdit: false });
    fireEvent.pointerDown(within(readOnly.canvas).getByRole("button", { name: /Horizontal ruler/ }), { pointerId: 82, button: 0, clientX: 10, clientY: 0 });
  });

  it("covers wheel units, pointer-capture failure, outside release, and cancellation", () => {
    const view = renderCanvas(rectangle());
    for (const [deltaMode, deltaY] of [[WheelEvent.DOM_DELTA_LINE, 1], [WheelEvent.DOM_DELTA_PAGE, 1]] as const) {
      act(() => {
        view.canvas.dispatchEvent(new WheelEvent("wheel", { bubbles: true, cancelable: true, deltaMode, deltaY }));
      });
    }
    Object.defineProperty(view.canvas, "setPointerCapture", { value: vi.fn(() => { throw new Error("capture unavailable"); }), configurable: true });
    fireEvent.pointerDown(view.canvas, { pointerId: 83, button: 0, clientX: 10, clientY: 10 });
    fireEvent.pointerMove(view.canvas, { pointerId: 999, clientX: 20, clientY: 20 });
    fireEvent.pointerUp(view.canvas, { pointerId: 999, clientX: 20, clientY: 20 });
    fireEvent.pointerUp(window, { pointerId: 83, clientX: 40, clientY: 40, shiftKey: true });
    expect(editorActions.commitShapes).toHaveBeenCalled();

    fireEvent.pointerDown(view.canvas, { pointerId: 84, button: 0, clientX: 10, clientY: 10 });
    fireEvent.pointerCancel(window, { pointerId: 84 });
    expect(editorActions.cancelPreview).toHaveBeenCalled();

    const rotate = screen.getByRole("button", { name: "Rotate selection" });
    fireEvent.pointerDown(rotate, { pointerId: 85, button: 0, clientX: 50, clientY: -20 });
    fireEvent.keyDown(window, { key: "Escape" });
    expect(view.store.getState().selected.selectionRotation).toBe(0);
  });

  it("supports two-finger touch pinch, touch release, and touch cancellation", () => {
    const { canvas, store } = renderCanvas(rectangle());
    fireEvent.pointerDown(canvas, { pointerId: 90, pointerType: "touch", button: 0, clientX: 100, clientY: 100 });
    fireEvent.pointerDown(canvas, { pointerId: 91, pointerType: "touch", button: 0, clientX: 200, clientY: 100 });
    fireEvent.pointerMove(canvas, { pointerId: 91, pointerType: "touch", clientX: 300, clientY: 100 });
    expect(store.getState().editor.viewport.zoom).toBeGreaterThan(1);
    fireEvent.pointerUp(canvas, { pointerId: 91, pointerType: "touch", clientX: 300, clientY: 100 });
    fireEvent.pointerUp(canvas, { pointerId: 90, pointerType: "touch", clientX: 100, clientY: 100 });
    fireEvent.pointerDown(canvas, { pointerId: 92, pointerType: "touch", button: 0, clientX: 20, clientY: 20 });
    fireEvent.pointerCancel(canvas, { pointerId: 92, pointerType: "touch" });
  });

  it("draws snapped primitives, freehand paths, tiny vectors, and finalized connectors", () => {
    const frame: Shape = { ...rectangle(), id: "frame", type: "frame", x2: 500, y2: 400, width: 500, height: 400 };
    const { canvas, store } = renderCanvas(frame);
    act(() => { store.dispatch(setSnapToGrid(true)); });
    for (const [tool, pointerId, drag] of [
      ["rectangle", 100, true],
      ["ellipse", 101, true],
      ["marker", 102, true],
      ["highlighter", 103, true],
      ["pen", 104, false],
    ] as const) {
      act(() => { store.dispatch(setSelectedTool(tool)); });
      fireEvent.pointerDown(canvas, { pointerId, button: 0, clientX: 13, clientY: 11 });
      if (drag) fireEvent.pointerMove(canvas, { pointerId, clientX: 93, clientY: 67, shiftKey: true });
      fireEvent.pointerUp(canvas, { pointerId, clientX: drag ? 93 : 13, clientY: drag ? 67 : 11 });
    }
    const connectorView = renderCanvas([]);
    act(() => { connectorView.store.dispatch(setSelectedTool("connector")); });
    fireEvent.pointerDown(connectorView.canvas, { pointerId: 105, button: 0, clientX: 600, clientY: 500 });
    fireEvent.pointerUp(connectorView.canvas, { pointerId: 105, clientX: 600, clientY: 500 });
    const commits = editorActions.commitShapes.mock.calls.map(([shapes]) => shapes as Shape[]);
    expect(commits.some((shapes) => shapes.some((shape) => shape.type === "vector" && shape.width >= 120))).toBe(true);
    expect(commits.some((shapes) => shapes.some((shape) => shape.type === "connector" && Math.hypot(shape.x2 - shape.x1, shape.y2 - shape.y1) >= 120))).toBe(true);
  });

  it("blocks locked and remote erasing, vector editing, resizing, and rotating", () => {
    const locked = renderCanvas({ ...rectangle(), locked: true });
    act(() => { locked.store.dispatch(setSelectedTool("eraser")); });
    fireEvent.pointerDown(locked.canvas, { pointerId: 110, button: 0, clientX: 10, clientY: 10 });
    expect(editorActions.commitShapes).not.toHaveBeenCalled();

    const vector: Shape = { ...rectangle(), id: "vector", type: "vector", vectorPoints: [{ id: "a", x: 0, y: 0 }, { id: "b", x: 100, y: 80 }] };
    const remote = { uid: "remote", cursorX: 0, cursorY: 0, activeShapeIds: [vector.id], activity: "editing" as const };
    const vectorView = renderCanvas(vector, { board: { currentUsers: [remote] } });
    fireEvent.pointerDown(screen.getByRole("button", { name: "Move vector point a" }), { pointerId: 111, button: 0, clientX: 0, clientY: 0 });
    expect(vectorView.canvas.releasePointerCapture).toHaveBeenCalledWith(111);

    const textView = renderCanvas(textShape(), { board: { currentUsers: [{ ...remote, activeShapeIds: ["text-1"] }] } });
    fireEvent.doubleClick(textView.canvas, { clientX: 10, clientY: 10 });
    expect(textView.store.getState().editor.editingShapeId).toBe("text-1");
    expect(presence.update).toHaveBeenCalledWith({ activeShapeIds: ["text-1"], activity: "editing" });

    const resizeView = renderCanvas(rectangle(), { board: { currentUsers: [{ ...remote, activeShapeIds: ["shape-1"], activity: "resizing" }] } });
    fireEvent.pointerDown(screen.getAllByRole("button", { name: "Resize from bottom right" }).at(-1)!, { pointerId: 112, button: 0, clientX: 100, clientY: 80 });
    fireEvent.pointerDown(screen.getAllByRole("button", { name: "Rotate selection" }).at(-1)!, { pointerId: 113, button: 0, clientX: 50, clientY: -20 });
    expect(resizeView.canvas.releasePointerCapture).toHaveBeenCalledTimes(2);
    fireEvent.click(screen.getAllByRole("button", { name: "Dismiss collaboration notice" }).at(-1)!);
  });

  it("updates text selection, exits editing without changes, and covers default collaborative text", () => {
    const view = renderCanvas(textShape(), { useView: true });
    fireEvent.doubleClick(view.canvas, { clientX: 10, clientY: 10 });
    const editor = screen.getByRole("textbox", { name: "Edit text" }) as HTMLTextAreaElement;
    editor.setSelectionRange(2, 6);
    fireEvent.select(editor);
    expect(view.store.getState().editor.textSelection).toEqual({ shapeId: "text-1", start: 2, end: 6 });
    expect(presence.update).toHaveBeenCalledWith({ textSelection: { shapeId: "text-1", start: 2, end: 6 } });
    fireEvent.pointerDown(editor);
    fireEvent.pointerMove(editor);
    fireEvent.pointerUp(editor);
    fireEvent.click(editor);
    fireEvent.doubleClick(editor);
    fireEvent.change(editor, { target: { value: "Default collaborative callback" } });
    fireEvent.blur(editor);
    expect(view.store.getState().editor.editingShapeId).toBeNull();
  });

  it("runs every context-menu action and blocks destructive remote actions", () => {
    const open = (canvas: HTMLElement) => fireEvent.contextMenu(canvas, { clientX: 10, clientY: 10 });
    const click = (name: string) => fireEvent.click(screen.getByRole("menuitem", { name }));
    const selected = renderCanvas(rectangle());
    open(selected.canvas);
    fireEvent.pointerDown(screen.getByRole("menu"));
    for (const action of ["Copy", "Duplicate", "Frame selection", "Bring to front", "Bring forward", "Send backward", "Send to back", "Delete"]) {
      open(selected.canvas);
      click(action);
    }

    const frame = renderCanvas({ ...rectangle(), type: "frame" });
    open(frame.canvas);
    click("Remove frame");

    act(() => { frame.store.dispatch(setSelectedShapes([])); });
    open(frame.canvas);
    click("Paste here");

    const blocked = renderCanvas(rectangle(), { board: { currentUsers: [{ uid: "remote", label: "Ada", cursorX: 0, cursorY: 0, activeShapeIds: ["shape-1"], activity: "moving" }] } });
    open(blocked.canvas);
    click("Delete");
    expect(editorActions.removeSelected).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("status")).toHaveTextContent("Ada is moving");
    fireEvent.click(screen.getByRole("button", { name: "Dismiss collaboration notice" }));
  });

  it("loads video metadata and reports unreadable video failures", async () => {
    const realCreate = document.createElement.bind(document);
    let video: HTMLVideoElement | null = null;
    vi.spyOn(document, "createElement").mockImplementation(((tagName: string, options?: ElementCreationOptions) => {
      const element = realCreate(tagName, options);
      if (tagName === "video") video = element as HTMLVideoElement;
      return element;
    }) as typeof document.createElement);
    vi.stubGlobal("URL", { ...URL, createObjectURL: vi.fn(() => "blob:video"), revokeObjectURL: vi.fn() });
    vi.mocked(uploadBoardAsset).mockResolvedValue({
      id: "video", board_id: "board-1", storage_key: "video", mime_type: "video/mp4", byte_size: 5,
      width: 320, height: 180, url: "https://assets.test/video.mp4",
    });
    renderCanvas(rectangle());
    const file = new File(["video"], "clip.mp4", { type: "video/mp4" });
    const dispatchPaste = () => {
      const event = new Event("paste", { bubbles: true, cancelable: true });
      Object.defineProperty(event, "clipboardData", { value: { files: [file] } });
      window.dispatchEvent(event);
    };
    act(dispatchPaste);
    expect(video).not.toBeNull();
    Object.defineProperties(video!, { videoWidth: { value: 320 }, videoHeight: { value: 180 } });
    await act(async () => { video!.onloadedmetadata?.(new Event("loadedmetadata")); });
    expect(editorActions.commitShapes).toHaveBeenCalledWith(expect.arrayContaining([expect.objectContaining({ mediaType: "video", mediaMuted: true })]));

    act(dispatchPaste);
    await act(async () => { video!.onerror?.(new Event("error")); });
    expect(screen.getByRole("alert")).toHaveTextContent("This video could not be read.");
    expect(URL.revokeObjectURL).toHaveBeenCalled();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("covers guarded paste, boardless, read-only, and empty-drop paths", async () => {
    renderCanvas([], { board: { id: null, roomId: null }, canEdit: false });
    const input = document.createElement("input");
    document.body.append(input);
    const file = new File(["image"], "image.png", { type: "image/png" });
    const targeted = new Event("paste", { bubbles: true, cancelable: true });
    Object.defineProperty(targeted, "target", { value: input });
    Object.defineProperty(targeted, "clipboardData", { value: { files: [file] } });
    window.dispatchEvent(targeted);
    window.dispatchEvent(new Event("paste", { bubbles: true, cancelable: true }));
    expect(uploadBoardAsset).not.toHaveBeenCalled();
    input.remove();

    const readOnly = renderCanvas(rectangle(), { canEdit: false });
    act(() => { readOnly.store.dispatch(setSelectedTool("eraser")); });
    fireEvent.pointerDown(readOnly.canvas, { pointerId: 120, button: 0, clientX: 10, clientY: 10 });
    fireEvent.drop(readOnly.canvas, { dataTransfer: { files: [], types: [] }, clientX: 1, clientY: 1 });
  });

  it("covers selection toggling, blocked Alt duplication, vertical movement, and parent-aware paste", () => {
    const first = rectangle();
    const second = { ...rectangle(), id: "shape-2", x1: 200, x2: 300, zIndex: 2 };
    const selection = renderCanvas([first, second]);
    fireEvent.pointerDown(selection.canvas, { pointerId: 121, button: 0, clientX: 210, clientY: 10, shiftKey: true });
    fireEvent.pointerUp(selection.canvas, { pointerId: 121, clientX: 210, clientY: 10, shiftKey: true });
    expect(selection.store.getState().selected.selectedShapes).toEqual([first.id, second.id]);
    fireEvent.pointerDown(selection.canvas, { pointerId: 122, button: 0, clientX: 210, clientY: 10, shiftKey: true });
    fireEvent.pointerUp(selection.canvas, { pointerId: 122, clientX: 210, clientY: 10, shiftKey: true });
    expect(selection.store.getState().selected.selectedShapes).toEqual([first.id]);
    fireEvent.pointerDown(selection.canvas, { pointerId: 123, button: 0, clientX: 10, clientY: 10 });
    fireEvent.pointerMove(selection.canvas, { pointerId: 123, clientX: 12, clientY: 70, shiftKey: true });
    fireEvent.pointerUp(selection.canvas, { pointerId: 123, clientX: 12, clientY: 70, shiftKey: true });

    editorActions.previewShapes.mockClear();
    const blocked = renderCanvas(first, { board: { currentUsers: [{ uid: "remote", cursorX: 0, cursorY: 0, activeShapeIds: [first.id], activity: "moving" }] } });
    fireEvent.pointerDown(blocked.canvas, { pointerId: 124, button: 0, clientX: 10, clientY: 10, altKey: true });
    expect(editorActions.previewShapes).not.toHaveBeenCalled();
    expect(blocked.canvas.releasePointerCapture).toHaveBeenCalledWith(124);

    const frame: Shape = { ...rectangle(), id: "frame", type: "frame", x2: 300, y2: 300, width: 300, height: 300 };
    const child: Shape = { ...rectangle(), id: "child", parentId: frame.id, x1: 20, x2: 120, zIndex: 2 };
    const nested = renderCanvas([frame, child]);
    act(() => { nested.store.dispatch(setSelectedShapes([child.id])); });
    fireEvent.keyDown(window, { key: "v", metaKey: true });
    expect(editorActions.paste).toHaveBeenLastCalledWith(expect.objectContaining({ targetFrameId: frame.id }));
  });

  it("covers cursor-chat pointer behavior, timeout, keyboard switching, and editing escape", () => {
    vi.useFakeTimers();
    const view = renderCanvas(textShape());
    fireEvent.keyDown(window, { key: "/" });
    const chat = screen.getByRole("textbox", { name: "Cursor chat" });
    fireEvent.pointerDown(chat);
    fireEvent.pointerMove(view.canvas, { pointerId: 125, clientX: 120, clientY: 130 });
    fireEvent.keyDown(window, { key: "r" });
    expect(view.store.getState().selected.selectedTool).toBe("rectangle");
    fireEvent.keyDown(window, { key: "/" });
    fireEvent.pointerDown(view.canvas, { pointerId: 126, button: 0, clientX: 400, clientY: 400 });
    expect(screen.queryByRole("textbox", { name: "Cursor chat" })).not.toBeInTheDocument();
    fireEvent.keyDown(window, { key: "/" });
    act(() => { vi.advanceTimersByTime(5000); });
    expect(screen.queryByRole("textbox", { name: "Cursor chat" })).not.toBeInTheDocument();
    fireEvent.keyDown(window, { key: "/" });
    fireEvent.keyDown(window, { key: "Escape" });
    act(() => { view.store.dispatch(setEditingShapeId("text-1")); });
    fireEvent.keyDown(window, { key: "Escape" });
    expect(presence.update).toHaveBeenCalledWith({ activeShapeIds: [], activity: null, textSelection: null });
    vi.useRealTimers();
  });

  it("covers measurement guard states, text-content guards, and horizontal guide events", () => {
    const text = textShape();
    const guide: Shape = { ...rectangle(), id: "horizontal", type: "guide", guideAxis: "horizontal", y1: 70, y2: 70 };
    const view = renderCanvas([text, guide]);
    act(() => {
      view.store.dispatch(setMeasureMode(true));
      view.store.dispatch(setHoveredShapeId(text.id));
    });
    act(() => { view.store.dispatch(setHoveredShapeId(guide.id)); });
    act(() => { view.store.dispatch(setHoveredShapeId("missing")); });
    const guideButton = screen.getByRole("button", { name: /Horizontal guide at 70/ });
    fireEvent.pointerDown(guideButton);

    const content = screen.getByText("Select part of this text").closest("div")!;
    fireEvent.doubleClick(content);
    expect(view.store.getState().editor.editingShapeId).toBe(text.id);

    const locked = renderCanvas({ ...text, locked: true });
    fireEvent.doubleClick(screen.getAllByText("Select part of this text").at(-1)!.closest("div")!);
    expect(locked.store.getState().editor.editingShapeId).toBeNull();

    const remote = renderCanvas(text, { board: { currentUsers: [{ uid: "remote", cursorX: 0, cursorY: 0, activeShapeIds: [text.id], activity: "moving" }] } });
    fireEvent.doubleClick(screen.getAllByText("Select part of this text").at(-1)!.closest("div")!);
    expect(remote.store.getState().editor.editingShapeId).toBeNull();
  });

  it("covers missing gradient targets, other baseline shapes, and rejected cleanup", async () => {
    const gradient: Shape = { ...rectangle(), id: "gradient", fills: [{
      id: "gradient-fill", type: "linear-gradient", visible: true, opacity: 1,
      gradientStops: [{ id: "stop", position: 0.5, color: "#fff", opacity: 1 }],
    }] };
    const other = { ...rectangle(), id: "other", x1: 200, x2: 300, zIndex: 2 };
    const view = renderCanvas([gradient, other]);
    const fake = document.createElement("button");
    fake.dataset.gradientFillId = "missing";
    view.canvas.append(fake);
    fireEvent.pointerDown(fake, { pointerId: 127, button: 0, clientX: 10, clientY: 10 });
    fireEvent.pointerMove(view.canvas, { pointerId: 127, clientX: 30, clientY: 30 });
    fireEvent.pointerUp(view.canvas, { pointerId: 127, clientX: 30, clientY: 30 });

    vi.stubGlobal("createImageBitmap", vi.fn().mockResolvedValue({ width: 10, height: 10, close: vi.fn() }));
    vi.mocked(uploadBoardAsset).mockResolvedValue({ id: "partial", board_id: "board-1", storage_key: "partial", mime_type: "image/png", byte_size: 1, width: 10, height: 10, url: "asset" });
    vi.mocked(deleteBoardAsset).mockRejectedValue(new Error("cleanup failed"));
    editorActions.commitShapes.mockImplementationOnce(() => { throw new Error("commit failed"); });
    const paste = new Event("paste", { bubbles: true, cancelable: true });
    Object.defineProperty(paste, "clipboardData", { value: { files: [new File(["x"], "x.png", { type: "image/png" })] } });
    await act(async () => { window.dispatchEvent(paste); });
    await waitFor(() => expect(deleteBoardAsset).toHaveBeenCalledWith("partial"));
    vi.unstubAllGlobals();
  });

  it("covers collaborator ordering outcomes and multi-child frame traversal", () => {
    const view = renderCanvas(rectangle());
    fireEvent.pointerDown(view.canvas, { pointerId: 128, button: 0, clientX: 10, clientY: 10 });
    fireEvent.pointerDown(view.canvas, { pointerId: 999, button: 2, clientX: 10, clientY: 10 });
    act(() => { view.store.dispatch(setWhiteboardData({ currentUsers: [{ uid: "z-remote", cursorX: 0, cursorY: 0, activeShapeIds: ["shape-1"], activity: "moving" }] })); });
    expect(editorActions.cancelPreview).not.toHaveBeenCalled();
    act(() => { view.store.dispatch(setWhiteboardData({ currentUsers: [{ uid: "irrelevant", cursorX: 0, cursorY: 0, activeShapeIds: ["other"], activity: "moving" }] })); });

    const guest = renderCanvas(rectangle(), { authenticated: false });
    fireEvent.pointerDown(guest.canvas, { pointerId: 129, button: 0, clientX: 10, clientY: 10 });
    act(() => { guest.store.dispatch(setWhiteboardData({ currentUsers: [
      { uid: "z", cursorX: 0, cursorY: 0, activeShapeIds: ["shape-1"], activity: "moving" },
      { uid: "a", cursorX: 0, cursorY: 0, activeShapeIds: ["shape-1"], activity: "moving" },
    ] })); });
    expect(editorActions.cancelPreview).toHaveBeenCalled();

    const frame: Shape = { ...rectangle(), id: "frame", type: "frame", x2: 300, y2: 300, width: 300, height: 300 };
    const children = [1, 2].map((index): Shape => ({ ...rectangle(), id: `child-${index}`, parentId: frame.id, zIndex: index + 1 }));
    const hierarchy = renderCanvas([frame, ...children]);
    fireEvent.keyDown(window, { key: "Enter" });
    expect(hierarchy.store.getState().selected.selectedShapes).toEqual(["child-2"]);
  });

  it("covers media fallbacks, GIF classification, and non-Error upload failures", async () => {
    const realCreate = document.createElement.bind(document);
    let video: HTMLVideoElement | null = null;
    vi.spyOn(document, "createElement").mockImplementation(((tagName: string, options?: ElementCreationOptions) => {
      const element = realCreate(tagName, options);
      if (tagName === "video") video = element as HTMLVideoElement;
      return element;
    }) as typeof document.createElement);
    vi.stubGlobal("URL", { ...URL, createObjectURL: vi.fn(() => "blob:fallback"), revokeObjectURL: vi.fn() });
    vi.mocked(uploadBoardAsset).mockResolvedValue({ id: "media", board_id: "board-1", storage_key: "media", mime_type: "video/webm", byte_size: 1, width: null, height: null, url: "asset" });
    renderCanvas(rectangle());
    const pasteFile = (file: File) => {
      const event = new Event("paste", { bubbles: true, cancelable: true });
      Object.defineProperty(event, "clipboardData", { value: { files: [file] } });
      window.dispatchEvent(event);
    };
    act(() => pasteFile(new File(["v"], "clip.webm", { type: "video/webm" })));
    await act(async () => { video!.onloadedmetadata?.(new Event("loadedmetadata")); });
    expect(uploadBoardAsset).toHaveBeenCalledWith("board-1", expect.any(File), { width: 640, height: 360 });

    vi.stubGlobal("createImageBitmap", vi.fn().mockResolvedValue({ width: 20, height: 10, close: vi.fn() }));
    vi.mocked(uploadBoardAsset).mockResolvedValue({ id: "gif", board_id: "board-1", storage_key: "gif", mime_type: "image/gif", byte_size: 1, width: 20, height: 10, url: "gif" });
    await act(async () => pasteFile(new File(["g"], "motion.gif", { type: "image/gif" })));
    expect(editorActions.commitShapes).toHaveBeenLastCalledWith(expect.arrayContaining([expect.objectContaining({ mediaType: "gif", mediaMuted: undefined })]));

    vi.mocked(uploadBoardAsset).mockRejectedValue("storage unavailable");
    await act(async () => pasteFile(new File(["p"], "photo.webp", { type: "image/webp" })));
    expect(screen.getByRole("alert")).toHaveTextContent("This media could not be added.");
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("covers snapped vector editing, centered frame resizing, unsnapped rotation, and touch edge states", () => {
    const vector: Shape = {
      ...rectangle(), id: "vector", type: "vector",
      vectorPoints: [{ id: "a", x: 0, y: 0, handleOut: { x: 20, y: 20 } }, { id: "b", x: 100, y: 80 }],
    };
    const vectorView = renderCanvas(vector);
    act(() => { vectorView.store.dispatch(setSnapToGrid(true)); });
    const point = screen.getByRole("button", { name: "Move vector point a" });
    fireEvent.pointerDown(point, { pointerId: 130, button: 0, clientX: 0, clientY: 0 });
    fireEvent.pointerMove(vectorView.canvas, { pointerId: 130, clientX: 17, clientY: 19 });
    fireEvent.pointerUp(vectorView.canvas, { pointerId: 130, clientX: 17, clientY: 19 });
    const handle = screen.getByRole("button", { name: "Move outgoing Bézier handle" });
    fireEvent.pointerDown(handle, { pointerId: 131, button: 0, clientX: 20, clientY: 20 });
    fireEvent.pointerMove(vectorView.canvas, { pointerId: 131, clientX: 31, clientY: 33 });
    fireEvent.pointerUp(vectorView.canvas, { pointerId: 131, clientX: 31, clientY: 33 });

    const child: Shape = { ...rectangle(), id: "child", parentId: "frame", x1: 10, y1: 10, x2: 40, y2: 40 };
    const frame: Shape = { ...rectangle(), id: "frame", type: "frame", x2: 200, y2: 160, width: 200, height: 160 };
    const frameView = renderCanvas([frame, child]);
    const resize = screen.getAllByRole("button", { name: "Resize from bottom right" }).at(-1)!;
    fireEvent.pointerDown(resize, { pointerId: 132, button: 0, clientX: 200, clientY: 160 });
    fireEvent.pointerMove(frameView.canvas, { pointerId: 132, clientX: 220, clientY: 180, ctrlKey: true, altKey: true, shiftKey: true });
    fireEvent.pointerMove(frameView.canvas, { pointerId: 132, clientX: -10, clientY: -10, ctrlKey: true });
    fireEvent.pointerUp(frameView.canvas, { pointerId: 132, clientX: -10, clientY: -10, ctrlKey: true });

    const rotate = screen.getAllByRole("button", { name: "Rotate selection" }).at(-1)!;
    fireEvent.pointerDown(rotate, { pointerId: 133, button: 0, clientX: 100, clientY: -20 });
    fireEvent.pointerMove(frameView.canvas, { pointerId: 133, clientX: 220, clientY: 80 });
    fireEvent.pointerUp(frameView.canvas, { pointerId: 133, clientX: 220, clientY: 80 });

    Object.defineProperty(frameView.canvas, "hasPointerCapture", { value: () => false, configurable: true });
    fireEvent.pointerDown(frameView.canvas, { pointerId: 134, pointerType: "touch", button: 0, clientX: 10, clientY: 10 });
    fireEvent.pointerMove(frameView.canvas, { pointerId: 134, pointerType: "touch", clientX: 20, clientY: 20 });
    fireEvent.pointerUp(frameView.canvas, { pointerId: 134, pointerType: "touch", clientX: 20, clientY: 20 });
    for (const pointerId of [135, 136, 137]) fireEvent.pointerDown(frameView.canvas, { pointerId, pointerType: "touch", button: 0, clientX: pointerId, clientY: 10 });
    fireEvent.pointerUp(frameView.canvas, { pointerId: 137, pointerType: "touch", clientX: 137, clientY: 10 });
    fireEvent.pointerCancel(frameView.canvas, { pointerId: 136, pointerType: "touch" });
  });

  it("renders legacy sparse shapes through every defensive presentation fallback", () => {
    const rich: Shape = {
      ...textShape(), id: "rich", name: undefined, rotation: undefined, flipX: undefined, flipY: undefined,
      fills: undefined, text: "Big\n\nSmall", alignItems: undefined, fontFamily: undefined, fontSize: undefined,
      fontWeight: undefined, textAlign: undefined, lineHeight: undefined, letterSpacing: undefined,
      textDecoration: undefined, textIndent: undefined, textAutoResize: "auto-width",
      textRuns: [
        { id: "big", start: 0, end: 3, fontSize: 24 },
        { id: "rest", start: 3, end: 10 },
      ],
    };
    const paragraph: Shape = { ...textShape(), id: "paragraph", x1: 120, x2: 220, text: "One\n\nThree", paragraphSpacing: undefined, textAutoResize: "fixed" };
    const frame: Shape = { ...rectangle(), id: "raw-frame", type: "frame", name: undefined, x1: 240, x2: 340 };
    const mask: Shape = { ...rectangle(), id: "rect-mask", isMask: true, x1: 360, x2: 460 };
    const masked: Shape = { ...rectangle(), id: "rect-masked", maskId: mask.id, x1: 370, x2: 450 };
    const connector: Shape = { ...rectangle(), id: "connector", type: "connector", connectorStart: { anchor: "auto", x: 40, y: 110 }, connectorEnd: { anchor: "auto", x: 140, y: 170 }, x1: 40, x2: 140, y1: 110, y2: 170 };
    const boolean: Shape = { ...rectangle(), id: "boolean", type: "boolean", x1: 160, x2: 260, y1: 110, y2: 190, booleanChildren: [rectangle()] };
    const portal: Shape = { ...rectangle(), id: "portal-default", type: "board", boardId: "portal", title: undefined, portalVersionId: "version", x1: 280, x2: 380, y1: 110, y2: 190 };
    const view = renderCanvas([rich, paragraph, frame, mask, masked, connector, boolean, portal], {
      rawShapes: true,
      board: { currentUsers: [{ uid: "remote", cursorX: 10, cursorY: 10, activeShapeIds: [rich.id], activity: null, textSelection: { shapeId: rich.id, start: 0, end: 1 } }] },
    });
    expect(screen.getByText("Pinned board version")).toBeInTheDocument();
    expect(screen.getByText("Open board")).toBeInTheDocument();
    expect(screen.getByText("Frame")).toBeInTheDocument();
    expect(screen.getByLabelText("Collaborator editing text")).toHaveTextContent("C");
    expect(document.querySelector("[data-shape-id='connector']")).toBeInTheDocument();
    act(() => {
      view.store.dispatch(setSelectedShapes([rich.id]));
      view.store.dispatch(setEditingShapeId(rich.id));
      view.store.dispatch(setHoveredShapeId(paragraph.id));
    });
    expect(screen.getByRole("textbox", { name: "Edit text" })).toHaveValue("Big\n\nSmall");
  });

  it("covers empty context menus, vertical measurement, pointer leave during interaction, and no-child frames", () => {
    const selected = rectangle();
    const target = { ...rectangle(), id: "target", x1: 0, x2: 100, y1: 200, y2: 280, zIndex: 2 };
    const view = renderCanvas([selected, target]);
    act(() => {
      view.store.dispatch(setMeasureMode(true));
      view.store.dispatch(setHoveredShapeId(target.id));
    });
    expect(screen.getByLabelText(/vertical distance/)).toBeInTheDocument();
    fireEvent.pointerDown(view.canvas, { pointerId: 138, button: 0, clientX: 10, clientY: 10 });
    fireEvent.pointerLeave(view.canvas);
    fireEvent.pointerUp(view.canvas, { pointerId: 138, clientX: 10, clientY: 10 });

    act(() => { view.store.dispatch(setSelectedShapes([])); });
    fireEvent.contextMenu(view.canvas, { clientX: 500, clientY: 500 });
    expect(screen.getAllByRole("menuitem")).toHaveLength(1);
    expect(screen.getByRole("menuitem", { name: "Paste here" })).toBeInTheDocument();
    fireEvent.dragOver(view.canvas, { dataTransfer: { files: [], types: ["text/plain"] } });

    const frame = renderCanvas({ ...rectangle(), type: "frame" });
    fireEvent.keyDown(window, { key: "Enter" });
    expect(frame.store.getState().selected.selectedShapes).toEqual(["shape-1"]);

    const remoteText = renderCanvas(textShape(), { board: { currentUsers: [{ uid: "remote", cursorX: 0, cursorY: 0, activeShapeIds: ["text-1"], activity: "moving" }] } });
    fireEvent.keyDown(window, { key: "Enter" });
    expect(remoteText.store.getState().editor.editingShapeId).toBeNull();
  });

  it("uses every connected-board navigation title fallback and stale rejection guard", async () => {
    const portal: Shape = { ...rectangle(), id: "portal", type: "board", boardId: "destination" };
    const navigations: Array<Record<string, unknown>> = [];
    const listener = (event: Event) => navigations.push((event as CustomEvent<Record<string, unknown>>).detail);
    window.addEventListener("kumo:board-navigate", listener);
    vi.mocked(getBoard).mockResolvedValue({ id: "destination", roomId: "board:destination", role: "viewer", title: null, shapes: [] } as unknown as Awaited<ReturnType<typeof getBoard>>);
    const linked = renderCanvas(portal, { board: { linkedBoards: { destination: { id: "destination", title: "Linked fallback", visibility: "public", accessible: true, role: "viewer" } } } });
    fireEvent.doubleClick(linked.canvas, { clientX: 10, clientY: 10 });
    await waitFor(() => expect(navigations.at(-1)?.title).toBe("Linked fallback"));

    const generic = renderCanvas(portal, { board: { id: null } });
    fireEvent.doubleClick(generic.canvas, { clientX: 10, clientY: 10 });
    await waitFor(() => expect(navigations.at(-1)?.title).toBe("Connected board"));
    expect(navigations.at(-1)?.sourceBoardId).toBeUndefined();

    let rejectFirst: (reason: unknown) => void = () => undefined;
    vi.mocked(getBoard)
      .mockImplementationOnce(() => new Promise((_resolve, reject) => { rejectFirst = reject; }))
      .mockResolvedValueOnce({ id: "new", roomId: "board:new", role: "viewer", title: "New", shapes: [] } as unknown as Awaited<ReturnType<typeof getBoard>>);
    const first = { ...portal, boardId: "first" };
    const second = { ...portal, id: "second", boardId: "second", x1: 200, x2: 300, zIndex: 2 };
    const stale = renderCanvas([first, second]);
    fireEvent.doubleClick(stale.canvas, { clientX: 10, clientY: 10 });
    fireEvent.doubleClick(stale.canvas, { clientX: 210, clientY: 10 });
    await act(async () => { rejectFirst(new Error("stale")); });
    expect(within(stale.canvas).queryByRole("alert")).not.toBeInTheDocument();
    window.removeEventListener("kumo:board-navigate", listener);
  });

  it("covers default collaborator notices, empty comments, deselection, and a cleared cursor frame", () => {
    const remote = renderCanvas(rectangle(), {
      rawShapes: true,
      board: { currentUsers: [{ uid: "remote", cursorX: 10, cursorY: 10, activeShapeIds: ["shape-1"], activity: null }] },
    });
    fireEvent.pointerDown(remote.canvas, { pointerId: 140, button: 0, clientX: 10, clientY: 10 });
    expect(within(remote.rendered.container).getByRole("status")).toHaveTextContent("A collaborator is editing this selection");
    fireEvent.keyDown(window, { key: "x", metaKey: true });
    expect(within(remote.rendered.container).getByRole("status")).toHaveTextContent("A collaborator is editing this selection");

    const comment = renderCanvas(rectangle());
    act(() => { comment.store.dispatch(setSelectedTool("comment")); });
    fireEvent.pointerDown(comment.canvas, { pointerId: 141, button: 0, clientX: 700, clientY: 500 });
    expect(comment.store.getState().editor.commentDraftAnchor).toEqual({ x: 700, y: 500, shapeId: "" });

    act(() => { comment.store.dispatch(setSelectedTool("pointer")); });
    fireEvent.pointerDown(comment.canvas, { pointerId: 142, button: 0, clientX: 10, clientY: 10, shiftKey: true });
    expect(comment.store.getState().selected.selectedShapes).toEqual([]);

    let frame: FrameRequestCallback | undefined;
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      frame = callback;
      return 77;
    });
    fireEvent.pointerMove(comment.canvas, { pointerId: 143, clientX: 300, clientY: 300 });
    fireEvent.pointerLeave(comment.canvas);
    act(() => { frame?.(0); });
    expect(presence.update).toHaveBeenLastCalledWith({ cursor: null });
  });

  it("covers radial and sparse gradient paints plus horizontal constrained movement", () => {
    const radial: Shape = {
      ...rectangle(), id: "radial", fills: [
        { id: "solid", type: "solid", visible: true, opacity: 1, color: "#fff" },
        {
          id: "radial-fill", type: "radial-gradient", visible: true, opacity: 1,
          gradientStops: [
            { id: "first", position: 0.1, color: "#f00", opacity: 1 },
            { id: "second", position: 0.9, color: "#00f", opacity: 1 },
          ],
        },
      ],
    };
    const radialView = renderCanvas(radial);
    const stop = within(radialView.rendered.container).getByRole("button", { name: "Move gradient stop 10 percent" });
    fireEvent.pointerDown(stop, { pointerId: 144, button: 0, clientX: 10, clientY: 40 });
    fireEvent.pointerMove(radialView.canvas, { pointerId: 144, clientX: 30, clientY: 40 });
    fireEvent.pointerUp(radialView.canvas, { pointerId: 144, clientX: 30, clientY: 40 });

    const sparse: Shape = {
      ...rectangle(), id: "sparse-gradient",
      fills: [{ id: "empty-gradient", type: "radial-gradient", visible: true, opacity: 1 }],
    };
    const sparseView = renderCanvas(sparse, { rawShapes: true });
    expect(within(sparseView.rendered.container).getByLabelText("Gradient controls")).toBeInTheDocument();

    const moving = renderCanvas(rectangle());
    fireEvent.pointerDown(moving.canvas, { pointerId: 145, button: 0, clientX: 10, clientY: 10 });
    fireEvent.pointerMove(moving.canvas, { pointerId: 145, clientX: 80, clientY: 20, shiftKey: true });
    fireEvent.pointerUp(moving.canvas, { pointerId: 145, clientX: 80, clientY: 20, shiftKey: true });
    expect(editorActions.commitShapes).toHaveBeenCalled();
  });

  it("covers ordinary click-sized drawing, multi-touch cancellation, and paste without a single target", () => {
    const drawing = renderCanvas(rectangle());
    act(() => { drawing.store.dispatch(setSelectedTool("ellipse")); });
    fireEvent.pointerDown(drawing.canvas, { pointerId: 146, button: 0, clientX: 600, clientY: 400 });
    fireEvent.pointerUp(drawing.canvas, { pointerId: 146, clientX: 600, clientY: 400 });
    expect(editorActions.commitShapes).toHaveBeenLastCalledWith(expect.arrayContaining([
      expect.objectContaining({ type: "ellipse", width: 120, height: 88 }),
    ]), expect.any(Array));

    const touch = renderCanvas(rectangle());
    for (const pointerId of [147, 148, 149]) {
      fireEvent.pointerDown(touch.canvas, { pointerId, pointerType: "touch", button: 0, clientX: pointerId, clientY: 20 });
    }
    fireEvent.pointerCancel(touch.canvas, { pointerId: 149, pointerType: "touch" });

    act(() => { touch.store.dispatch(setSelectedShapes([])); });
    fireEvent.keyDown(window, { key: "v", metaKey: true });
    expect(editorActions.paste).toHaveBeenLastCalledWith(expect.objectContaining({ targetFrameId: null }));
  });

  it("covers sparse editable text, unchanged blur, flipped rendering, and locked or empty double-clicks", () => {
    const sparseText: Shape = {
      ...textShape(), id: "sparse-text", text: undefined, textAutoResize: undefined,
      rotation: 15, flipX: true, flipY: true,
    };
    const sibling = { ...rectangle(), id: "sibling", x1: 180, x2: 280 };
    const edited = renderCanvas([sparseText, sibling], { rawShapes: true });
    act(() => {
      edited.store.dispatch(setSelectedShapes([sparseText.id]));
      edited.store.dispatch(setEditingShapeId(sparseText.id));
    });
    const editor = within(edited.rendered.container).getByRole("textbox", { name: "Edit text" });
    expect(editor).toHaveValue("");
    expect(document.querySelector("[data-shape-id='sparse-text']")).toHaveAttribute("data-flip-x", "true");
    expect(document.querySelector("[data-shape-id='sparse-text']")).toHaveAttribute("data-flip-y", "true");
    fireEvent.change(editor, { target: { value: "Added" } });
    fireEvent.blur(editor);

    const unchanged = renderCanvas(sparseText, { rawShapes: true });
    act(() => { unchanged.store.dispatch(setEditingShapeId(sparseText.id)); });
    fireEvent.blur(within(unchanged.rendered.container).getByRole("textbox", { name: "Edit text" }));

    const locked = renderCanvas({ ...textShape(), locked: true });
    fireEvent.doubleClick(locked.canvas, { clientX: 10, clientY: 10 });
    expect(locked.store.getState().editor.editingShapeId).toBeNull();
    fireEvent.doubleClick(locked.canvas, { clientX: 700, clientY: 500 });
    expect(locked.store.getState().selected.selectedShapes).toEqual(["text-1"]);
  });

  it("surfaces Error instances from connected-board navigation", async () => {
    vi.mocked(getBoard).mockRejectedValue(new Error("Destination unavailable"));
    const portal: Shape = { ...rectangle(), id: "portal-error", type: "board", boardId: "unavailable" };
    const view = renderCanvas(portal);
    fireEvent.doubleClick(view.canvas, { clientX: 10, clientY: 10 });
    expect(await within(view.rendered.container).findByRole("alert")).toHaveTextContent("Destination unavailable");
  });
});
