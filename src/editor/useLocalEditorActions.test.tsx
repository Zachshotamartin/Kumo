import { act, renderHook } from "@testing-library/react";
import { Provider } from "react-redux";
import { createAppStore } from "../store";
import { initializeEditor, setClipboard } from "../features/editor/editorSlice";
import { setSelectedShapes } from "../features/selected/selectedSlice";
import { setWhiteboardData } from "../features/whiteBoard/whiteBoardSlice";
import { useLocalEditorActions } from "./useLocalEditorActions";
import type { ReactNode } from "react";

it("persists real editor commands locally, including preview baselines and full-document undo/redo", async () => {
  const store = createAppStore();
  const { result } = renderHook(useLocalEditorActions, { wrapper: ({ children }: { children: ReactNode }) => <Provider store={store}>{children}</Provider> });
  act(() => { result.current.undo(); result.current.redo(); });
  expect(result.current.canUndo).toBe(false);
  act(() => {
    store.dispatch(setWhiteboardData({ id: "demo", role: "owner", shapes: [
      { id: "one", type: "rectangle", x1: 10, y1: 10, x2: 60, y2: 50, width: 50, height: 40, level: 0, zIndex: 1 },
    ], backGroundColor: "#111" }));
    store.dispatch(initializeEditor({ boardId: "demo", shapes: store.getState().whiteBoard.shapes, backgroundColor: "#111" }));
    store.dispatch(setSelectedShapes(["one"]));
  });
  const original = store.getState().whiteBoard.shapes;
  act(() => result.current.previewShapes(original.map((shape) => ({ ...shape, x1: 20, x2: 70 }))));
  act(() => result.current.commitShapes(store.getState().whiteBoard.shapes, original));
  expect(result.current.canUndo).toBe(true);
  act(() => result.current.undo());
  expect(store.getState().whiteBoard.shapes).toEqual(original);
  expect(store.getState().selected.selectedShapes).toEqual(["one"]);
  expect(store.getState().editor.localPreviewActive).toBe(false);
  act(() => result.current.redo());
  expect(store.getState().whiteBoard.shapes[0]?.x1).toBe(20);
  act(() => result.current.commitBoardPatch({ backGroundColor: "#222" }));
  act(() => result.current.undo());
  expect(store.getState().whiteBoard.backGroundColor).toBe("#111");
  act(() => result.current.redo());
  expect(store.getState().whiteBoard.backGroundColor).toBe("#222");
  await act(async () => result.current.commitBoardPatch({ title: "Local title" }));
  expect(store.getState().whiteBoard.title).toBe("Local title");
  act(() => store.dispatch(setClipboard({ shapes: original, boardId: "another-local-document" })));
  await act(async () => result.current.paste());
  expect(store.getState().whiteBoard.shapes).toHaveLength(2);
  act(() => result.current.undo());
  expect(store.getState().selected.selectedShapes).toHaveLength(0);
});
