import { configureStore } from "@reduxjs/toolkit";
import { fireEvent, render, screen } from "@testing-library/react";
import { Provider } from "react-redux";
import actionsReducer from "../../features/actions/actionsSlice";
import editorReducer from "../../features/editor/editorSlice";
import selectedReducer from "../../features/selected/selectedSlice";
import whiteBoardReducer, { setWhiteboardData } from "../../features/whiteBoard/whiteBoardSlice";
import EditorMinimap from "./EditorMinimap";

const createStore = (withShapes: boolean) => {
  const store = configureStore({ reducer: { whiteBoard: whiteBoardReducer, editor: editorReducer, selected: selectedReducer, actions: actionsReducer } });
  if (withShapes) store.dispatch(setWhiteboardData({ shapes: [
    { id: "visible", type: "rectangle", name: "Visible", x1: 100, y1: 200, x2: 300, y2: 400, width: 200, height: 200, level: 0, zIndex: 1 },
    { id: "hidden", type: "rectangle", name: "Hidden", x1: 400, y1: 400, x2: 500, y2: 500, width: 100, height: 100, level: 0, zIndex: 2, hidden: true },
  ] }));
  return store;
};

describe("EditorMinimap", () => {
  it("stays absent until the board has content", () => {
    const store = createStore(false);
    const view = render(<Provider store={store}><EditorMinimap /></Provider>);
    expect(view.container).toBeEmptyDOMElement();
  });

  it("jumps the viewport and selects visible shapes without rendering hidden layers", () => {
    const store = createStore(true);
    const view = render(<Provider store={store}><EditorMinimap /></Provider>);
    const minimap = screen.getByRole("img", { name: "Board minimap" });
    vi.spyOn(minimap, "getBoundingClientRect").mockReturnValue({ x: 10, y: 20, left: 10, top: 20, right: 186, bottom: 136, width: 176, height: 116, toJSON: () => ({}) });
    fireEvent.pointerDown(minimap, { clientX: 98, clientY: 78 });
    expect(store.getState().editor.viewport).not.toEqual({ x: 0, y: 0, zoom: 1 });

    const shapeRect = view.container.querySelectorAll("rect")[1]!;
    fireEvent.pointerDown(shapeRect, { clientX: 20, clientY: 20 });
    expect(store.getState().selected.selectedShapes).toEqual(["visible"]);
    expect(view.container.querySelectorAll("rect")).toHaveLength(3);
  });
});
