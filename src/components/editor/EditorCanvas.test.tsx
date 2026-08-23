import { configureStore } from "@reduxjs/toolkit";
import { fireEvent, render, screen } from "@testing-library/react";
import { Provider } from "react-redux";
import { Shape } from "../../classes/shape";
import actionsReducer from "../../features/actions/actionsSlice";
import authReducer from "../../features/auth/authSlice";
import editorReducer from "../../features/editor/editorSlice";
import selectedReducer, { setSelectedShapes } from "../../features/selected/selectedSlice";
import whiteBoardReducer, { setWhiteboardData } from "../../features/whiteBoard/whiteBoardSlice";
import EditorCanvas from "./EditorCanvas";

const editorActions = vi.hoisted(() => ({
  canEdit: true,
  canUndo: false,
  canRedo: false,
  previewShapes: vi.fn(),
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

vi.mock("@liveblocks/react", () => ({
  useUpdateMyPresence: () => vi.fn(),
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

const renderCanvas = (shape: Shape) => {
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
    shapes: [shape],
  }));
  store.dispatch(setSelectedShapes([shape.id]));
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
  return canvas;
};

describe("EditorCanvas transform interactions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("commits a two-axis flip when a corner crosses its opposite anchor", () => {
    const canvas = renderCanvas(rectangle());
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
    const canvas = renderCanvas(rectangle());
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
});
