import { configureStore } from "@reduxjs/toolkit";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { Provider } from "react-redux";
import { Shape } from "../../classes/shape";
import actionsReducer from "../../features/actions/actionsSlice";
import authReducer from "../../features/auth/authSlice";
import editorReducer from "../../features/editor/editorSlice";
import selectedReducer, { setSelectedShapes, setSelectedTool } from "../../features/selected/selectedSlice";
import whiteBoardReducer, { setWhiteboardData } from "../../features/whiteBoard/whiteBoardSlice";
import EditorCanvas from "./EditorCanvas";
import { getBoard } from "../../services/boardRepository";

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
  nudgeSelected: vi.fn(),
  undo: vi.fn(),
  redo: vi.fn(),
  setShapeGeometry: vi.fn(),
}));

const presence = vi.hoisted(() => ({ update: vi.fn() }));

vi.mock("@liveblocks/react", () => ({
  useUpdateMyPresence: () => presence.update,
}));
vi.mock("../../editor/useEditorActions", () => ({
  useEditorActions: () => editorActions,
}));
vi.mock("../../services/boardRepository", () => ({
  getBoard: vi.fn(),
}));

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

const renderCanvas = (input: Shape | Shape[]) => {
  const shapes = Array.isArray(input) ? input : [input];
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
    id: "board-1",
    roomId: "board:board-1",
    role: "owner",
    shapes,
  }));
  store.dispatch(setSelectedShapes([shapes[0]!.id]));
  render(
    <Provider store={store}>
      <EditorCanvas />
    </Provider>
  );
  const canvas = screen.getByRole("application", { name: "Kumo design canvas" });
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
    setPointerCapture: { value: vi.fn() },
    releasePointerCapture: { value: vi.fn() },
    hasPointerCapture: { value: () => true },
  });
  return { canvas, store };
};

describe("EditorCanvas transform interactions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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

  it("cancels browser pinch zoom and zooms the canvas around the pointer", () => {
    const { canvas, store } = renderCanvas(rectangle());
    const event = new WheelEvent("wheel", {
      bubbles: true,
      cancelable: true,
      clientX: 400,
      clientY: 300,
      ctrlKey: true,
      deltaY: -100,
    });

    expect(canvas.dispatchEvent(event)).toBe(false);
    expect(event.defaultPrevented).toBe(true);
    expect(store.getState().editor.viewport.zoom).toBeGreaterThan(1);
    expect(store.getState().editor.viewport).toMatchObject({
      x: expect.any(Number),
      y: expect.any(Number),
    });
  });

  it("cancels page scrolling and pans the canvas for an ordinary wheel gesture", () => {
    const { canvas, store } = renderCanvas(rectangle());
    const event = new WheelEvent("wheel", {
      bubbles: true,
      cancelable: true,
      deltaX: 24,
      deltaY: 40,
    });

    canvas.dispatchEvent(event);

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
    expect(created).toMatchObject({ width: 180, height: 40, text: "Type something" });
    expect(store.getState().editor.editingShapeId).toBe(created?.id);
    expect(store.getState().selected.selectedTool).toBe("pointer");
  });
});
