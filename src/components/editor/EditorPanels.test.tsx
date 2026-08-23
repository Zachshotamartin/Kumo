import { configureStore } from "@reduxjs/toolkit";
import { fireEvent, render, screen } from "@testing-library/react";
import { Provider } from "react-redux";
import type { Shape } from "../../classes/shape";
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
};

describe("editor property panels", () => {
  beforeEach(() => vi.clearAllMocks());

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
});
