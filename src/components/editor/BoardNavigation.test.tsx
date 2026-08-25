import { configureStore } from "@reduxjs/toolkit";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Provider } from "react-redux";
import actionsReducer from "../../features/actions/actionsSlice";
import authReducer from "../../features/auth/authSlice";
import editorReducer from "../../features/editor/editorSlice";
import selectedReducer from "../../features/selected/selectedSlice";
import whiteBoardReducer, { setWhiteboardData } from "../../features/whiteBoard/whiteBoardSlice";
import { getBoard } from "../../services/boardRepository";
import { BoardNavigation } from "./BoardNavigation";

vi.mock("../../services/boardRepository", () => ({ getBoard: vi.fn() }));
const mockedGetBoard = vi.mocked(getBoard);
const storageKey = "kumo:board-navigation:v1";

const renderNavigation = (board: { id: string; title?: string | null } | null = { id: "board-b", title: "Board B" }) => {
  const store = configureStore({ reducer: { auth: authReducer, whiteBoard: whiteBoardReducer, actions: actionsReducer, selected: selectedReducer, editor: editorReducer } });
  if (board) store.dispatch(setWhiteboardData({ id: board.id, title: board.title, roomId: `board:${board.id}`, role: "owner", shapes: [] }));
  render(<Provider store={store}><BoardNavigation /></Provider>);
  return store;
};

describe("connected board navigation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    window.history.replaceState({}, "", "/?board=board-b");
    sessionStorage.setItem(storageKey, JSON.stringify({
      entries: [{ boardId: "board-a", title: "Board A", sourceShapeId: "portal-a" }, { boardId: "board-b", title: "Board B" }],
      index: 1,
    }));
    mockedGetBoard.mockResolvedValue({ id: "board-a", title: "Board A", roomId: "board:board-a", role: "owner", shapes: [] } as unknown as Awaited<ReturnType<typeof getBoard>>);
  });

  it("moves backward and restores the portal selection and URL", async () => {
    const store = renderNavigation();
    fireEvent.click(screen.getByRole("button", { name: "Previous connected board" }));
    await waitFor(() => expect(mockedGetBoard).toHaveBeenCalledWith("board-a"));
    expect(store.getState().whiteBoard.id).toBe("board-a");
    expect(store.getState().selected.selectedShapes).toEqual(["portal-a"]);
    expect(new URL(window.location.href).searchParams.get("board")).toBe("board-a");
    expect(new URL(window.location.href).searchParams.get("selection")).toBe("portal-a");
  });

  it("adds linked-board navigation events and exposes forward history", async () => {
    renderNavigation();
    await waitFor(() => expect(screen.getByRole("button", { name: "Board B" })).toBeInTheDocument());
    act(() => window.dispatchEvent(new CustomEvent("kumo:board-navigate", { detail: { boardId: "board-c", title: "Board C", sourceShapeId: "portal-b" } })));
    expect(screen.getByRole("button", { name: "Board C" })).toBeInTheDocument();
    const stored = JSON.parse(sessionStorage.getItem(storageKey) ?? "{}") as { entries: Array<Record<string, unknown>>; index: number };
    expect(stored.entries).toEqual([
      expect.objectContaining({ boardId: "board-a" }),
      expect.objectContaining({ boardId: "board-b", sourceShapeId: "portal-b" }),
      expect.objectContaining({ boardId: "board-c" }),
    ]);
    expect(stored.index).toBe(2);
  });

  it("keeps the active board intact and reports navigation failures", async () => {
    mockedGetBoard.mockRejectedValueOnce(new Error("Board access is required."));
    const store = renderNavigation();
    fireEvent.click(screen.getByRole("button", { name: "Previous connected board" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Board access is required");
    expect(store.getState().whiteBoard.id).toBe("board-b");
  });

  it("recovers malformed persisted history and ignores invalid navigation events", async () => {
    sessionStorage.setItem(storageKey, "not-json");
    renderNavigation(null);
    expect(screen.getByRole("button", { name: "Previous connected board" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Next connected board" })).toBeDisabled();
    act(() => window.dispatchEvent(new CustomEvent("kumo:board-navigate", { detail: {} })));
    expect(sessionStorage.getItem(storageKey)).toBe("not-json");
  });

  it("filters malformed entries and clamps persisted indexes", async () => {
    sessionStorage.setItem(storageKey, JSON.stringify({ entries: [null, {}, { boardId: "board-a", title: "Board A" }], index: 99 }));
    renderNavigation({ id: "board-a", title: "Board A" });
    expect(await screen.findByRole("button", { name: "Board A" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Previous connected board" })).toBeDisabled();

    cleanup();
    sessionStorage.setItem(storageKey, JSON.stringify({ entries: [{ boardId: "board-a", title: "Board A" }], index: -4 }));
    renderNavigation({ id: "board-a", title: "Board A" });
    expect(screen.getByRole("button", { name: "Board A" })).toBeInTheDocument();
  });

  it("opens forward history without a source selection and supports trail buttons", async () => {
    sessionStorage.setItem(storageKey, JSON.stringify({
      entries: [{ boardId: "board-a", title: "Board A" }, { boardId: "board-b", title: "Board B" }],
      index: 0,
    }));
    mockedGetBoard.mockResolvedValue({ id: "board-b", title: "Board B", roomId: "board:board-b", role: "owner", shapes: [] } as unknown as Awaited<ReturnType<typeof getBoard>>);
    const store = renderNavigation({ id: "board-a", title: "Board A" });
    fireEvent.click(screen.getByRole("button", { name: "Next connected board" }));
    await waitFor(() => expect(store.getState().whiteBoard.id).toBe("board-b"));
    expect(new URL(window.location.href).searchParams.get("selection")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Board B" }));
    await waitFor(() => expect(mockedGetBoard).toHaveBeenCalledTimes(2));
  });

  it("uses an untitled fallback, handles storage failures, and reports non-Error failures", async () => {
    sessionStorage.clear();
    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("storage denied"); });
    const store = renderNavigation({ id: "untitled", title: null });
    expect(await screen.findByRole("button", { name: "Untitled board" })).toBeInTheDocument();
    setItem.mockRestore();
    act(() => window.dispatchEvent(new CustomEvent("kumo:board-navigate", { detail: { boardId: "board-c", title: "Board C" } })));
    mockedGetBoard.mockRejectedValueOnce("offline");
    fireEvent.click(screen.getByRole("button", { name: "Previous connected board" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("We couldn't open this board");
    expect(store.getState().whiteBoard.id).toBe("untitled");
  });

  it("drops forward history when navigating through a new linked board", async () => {
    sessionStorage.setItem(storageKey, JSON.stringify({
      entries: [{ boardId: "board-a", title: "Board A" }, { boardId: "board-b", title: "Board B" }],
      index: 0,
    }));
    renderNavigation({ id: "board-a", title: "Board A" });
    act(() => window.dispatchEvent(new CustomEvent("kumo:board-navigate", { detail: { boardId: "board-c", title: "Board C" } })));
    const stored = JSON.parse(sessionStorage.getItem(storageKey) ?? "{}") as { entries: Array<{ boardId: string }> };
    expect(stored.entries.map((entry) => entry.boardId)).toEqual(["board-a", "board-c"]);
  });
});
