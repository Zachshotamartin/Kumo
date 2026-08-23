import { configureStore } from "@reduxjs/toolkit";
import { fireEvent, render, screen } from "@testing-library/react";
import { Provider } from "react-redux";
import type { Shape } from "../../classes/shape";
import type { EditorActions } from "../../editor/useEditorActions";
import actionsReducer from "../../features/actions/actionsSlice";
import authReducer from "../../features/auth/authSlice";
import editorReducer from "../../features/editor/editorSlice";
import selectedReducer, { setSelectedShapes } from "../../features/selected/selectedSlice";
import whiteBoardReducer, { setWhiteboardData } from "../../features/whiteBoard/whiteBoardSlice";
import { InspectorPanelView } from "./InspectorPanel";

vi.mock("../../services/boardRepository", () => ({ listBoards: vi.fn() }));

const textShape: Shape = {
  id: "text",
  type: "text",
  name: "Product note",
  x1: 0,
  y1: 0,
  x2: 240,
  y2: 120,
  width: 240,
  height: 120,
  level: 0,
  zIndex: 1,
  color: "#f7f7f5",
  backgroundColor: "transparent",
  borderColor: "transparent",
  borderWidth: 0,
  fontSize: 18,
  fontFamily: "Arial",
  fontWeight: "normal",
  textAlign: "left",
  alignItems: "flex-start",
  textDecoration: "none",
  lineHeight: 1.2,
  letterSpacing: 0,
};

const renderInspector = () => {
  const store = configureStore({
    reducer: {
      auth: authReducer,
      whiteBoard: whiteBoardReducer,
      actions: actionsReducer,
      selected: selectedReducer,
      editor: editorReducer,
    },
  });
  store.dispatch(setWhiteboardData({ id: "board", role: "owner", shapes: [textShape] }));
  store.dispatch(setSelectedShapes([textShape.id]));
  const patchSelected = vi.fn();
  const actions = { patchSelected } as unknown as EditorActions;
  render(<Provider store={store}><InspectorPanelView actions={actions} /></Provider>);
  return patchSelected;
};

describe("InspectorPanel typography", () => {
  it("restores the complete text formatting controls", () => {
    const patchSelected = renderInspector();

    expect(screen.getByLabelText("Text hex value")).toHaveValue("#f7f7f5");
    expect(screen.getByLabelText("Back hex value")).toHaveValue("transparent");
    fireEvent.change(screen.getByLabelText("Font weight"), { target: { value: "bold" } });
    fireEvent.change(screen.getByLabelText("Stroke style"), { target: { value: "dashed" } });
    fireEvent.click(screen.getByRole("button", { name: "Align text to bottom" }));
    fireEvent.click(screen.getByRole("button", { name: "Overline text" }));

    expect(patchSelected).toHaveBeenCalledWith({ fontWeight: "bold" });
    expect(patchSelected).toHaveBeenCalledWith({ borderStyle: "dashed" });
    expect(patchSelected).toHaveBeenCalledWith({ alignItems: "flex-end" });
    expect(patchSelected).toHaveBeenCalledWith({ textDecoration: "overline" });
  });

  it("accepts both hex colors and transparent backgrounds", () => {
    const patchSelected = renderInspector();
    const textColor = screen.getByLabelText("Text hex value");
    fireEvent.change(textColor, { target: { value: "#b87a2e" } });
    fireEvent.blur(textColor);
    const background = screen.getByLabelText("Back hex value");
    fireEvent.change(background, { target: { value: "transparent" } });
    fireEvent.blur(background);

    expect(patchSelected).toHaveBeenCalledWith({ color: "#b87a2e" });
    expect(patchSelected).toHaveBeenCalledWith({ backgroundColor: "transparent" });
  });
});
