import { configureStore } from "@reduxjs/toolkit";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { Provider } from "react-redux";
import actionsReducer from "../../features/actions/actionsSlice";
import authReducer from "../../features/auth/authSlice";
import editorReducer from "../../features/editor/editorSlice";
import selectedReducer from "../../features/selected/selectedSlice";
import whiteBoardReducer, { setWhiteboardData } from "../../features/whiteBoard/whiteBoardSlice";
import EditorToolbar from "./EditorToolbar";

const fit = vi.hoisted(() => ({ available: 500, count: 4 }));

vi.mock("../../editor/toolbarFit", () => ({
  toolbarAvailableWidth: () => fit.available,
  fitToolCount: ({ total }: { total: number }) => Math.min(total, fit.count),
}));

vi.mock("../../editor/useEditorActions", () => ({
  useEditorActions: () => ({
    canEdit: true, canUndo: true, canRedo: true,
    commitShapes: vi.fn(), undo: vi.fn(), redo: vi.fn(), removeSelected: vi.fn(),
  }),
}));

/** A ResizeObserver that lets the test decide when the dock "resizes". */
class DockObserver {
  static latest: DockObserver | null = null;
  observe = vi.fn();
  disconnect = vi.fn();
  constructor(public callback: () => void) { DockObserver.latest = this; }
}

const makeStore = () => {
  const store = configureStore({
    reducer: { auth: authReducer, whiteBoard: whiteBoardReducer, actions: actionsReducer, selected: selectedReducer, editor: editorReducer },
  });
  store.dispatch(setWhiteboardData({ id: "board", role: "owner", shapes: [] }));
  return store;
};

const renderInDock = () => {
  const store = makeStore();
  const view = render(<Provider store={store}><div data-testid="dock-row"><EditorToolbar /></div></Provider>);
  return { store, view };
};

const resizeDock = () => act(() => DockObserver.latest!.callback());

describe("EditorToolbar overflow", () => {
  let buttonWidth = 36;

  beforeEach(() => {
    fit.available = 500;
    fit.count = 4;
    buttonWidth = 36;
    vi.stubGlobal("ResizeObserver", DockObserver);
    vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockImplementation(function (this: HTMLElement) {
      return this.tagName === "BUTTON" ? buttonWidth : 400;
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("moves the tools that don't fit into a More tools menu and keeps Select and Hand", () => {
    const { store, view } = renderInDock();
    const toolbar = screen.getByRole("toolbar", { name: "Editor tools" });
    expect(within(toolbar).getAllByRole("button", { name: /tool \(/ })).toHaveLength(4);
    expect(screen.getByRole("button", { name: "Select tool (V)" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Hand tool (H)" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Ellipse tool (O)" })).not.toBeInTheDocument();
    expect(DockObserver.latest!.observe).toHaveBeenCalledWith(screen.getByTestId("dock-row"));

    fireEvent.click(screen.getByRole("button", { name: "More tools" }));
    const menu = screen.getByRole("menu", { name: "More tools" });
    expect(menu).toHaveAttribute("data-columns", "2");
    expect(within(menu).getAllByRole("menuitemradio")).toHaveLength(14);

    fireEvent.click(within(menu).getByRole("menuitemradio", { name: /Comment/ }));
    expect(store.getState().selected.selectedTool).toBe("comment");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    const more = screen.getByRole("button", { name: "More tools (Comment selected)" });
    expect(more).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(more);
    expect(within(screen.getByRole("menu")).getByRole("menuitemradio", { name: /Comment/ })).toHaveAttribute("aria-checked", "true");
    const picker = vi.spyOn(HTMLInputElement.prototype, "click").mockImplementation(() => undefined);
    fireEvent.click(within(screen.getByRole("menu")).getByRole("menuitemradio", { name: /Image/ }));
    expect(picker).toHaveBeenCalled();

    view.unmount();
    expect(DockObserver.latest!.disconnect).toHaveBeenCalled();
  });

  it("closes the menu on Escape or an outside press, but not a press inside it", () => {
    renderInDock();
    fireEvent.click(screen.getByRole("button", { name: "More tools" }));
    fireEvent.pointerDown(screen.getByRole("menu"));
    fireEvent.keyDown(window, { key: "Enter" });
    expect(screen.getByRole("menu")).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "More tools" }));
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("re-fits when the dock resizes and waits for a real layout before measuring", () => {
    buttonWidth = 0;
    renderInDock();
    expect(screen.getByRole("button", { name: "Comment tool (C)" })).toBeInTheDocument();

    buttonWidth = 36;
    screen.getByRole("toolbar").firstElementChild!.setAttribute("style", "column-gap: 2px");
    resizeDock();
    expect(screen.queryByRole("button", { name: "Comment tool (C)" })).not.toBeInTheDocument();

    fit.count = 12;
    resizeDock();
    fireEvent.click(screen.getByRole("button", { name: "More tools" }));
    expect(screen.getByRole("menu")).toHaveAttribute("data-columns", "1");

    fit.count = 99;
    resizeDock();
    expect(screen.queryByRole("button", { name: /More tools/ })).not.toBeInTheDocument();

    fit.available = 0;
    fit.count = 4;
    resizeDock();
    expect(screen.queryByRole("button", { name: /More tools/ })).not.toBeInTheDocument();
  });
});
