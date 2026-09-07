import { useMemo } from "react";
import { useSelector, useStore } from "react-redux";
import { commitEditorSnapshot, redoEditor, setLocalPreviewActive, undoEditor } from "../features/editor/editorSlice";
import { setSelectedShapes } from "../features/selected/selectedSlice";
import { setWhiteboardData } from "../features/whiteBoard/whiteBoardSlice";
import type { RootState } from "../store";
import { useEditorActionsCore, type EditorRuntime } from "./useEditorActionsCore";

/** Local persistence only. Every editing command still comes from the production editor. */
export const useLocalEditorActions = () => {
  const localStore = useStore<RootState>();
  const history = useSelector((state: RootState) => state.editor.history);
  const runtime = useMemo((): Omit<EditorRuntime, "canUndo" | "canRedo"> => {
    const restore = (direction: "undo" | "redo") => {
      localStore.dispatch(direction === "undo" ? undoEditor() : redoEditor());
      const snapshot = localStore.getState().editor.history?.present;
      if (!snapshot) return;
      localStore.dispatch(setWhiteboardData({ shapes: snapshot.shapes, backGroundColor: snapshot.backgroundColor }));
      localStore.dispatch(setLocalPreviewActive(false));
      localStore.dispatch(setSelectedShapes(localStore.getState().selected.selectedShapes.filter(
        (id) => snapshot.shapes.some((shape) => shape.id === id)
      )));
    };
    return {
      // Shape commits already write the Redux document and history in the core.
      mutateShapes: () => undefined,
      mutateBackground: (color) => {
        const board = localStore.getState().whiteBoard;
        localStore.dispatch(commitEditorSnapshot({ boardId: board.id!, shapes: board.shapes, backgroundColor: color }));
      },
      updateBoardSettings: async () => undefined,
      cloneBoardAssets: async () => ({}),
      history: { undo: () => restore("undo"), redo: () => restore("redo") },
    };
  }, [localStore]);
  return useEditorActionsCore({
    ...runtime,
    canUndo: Boolean(history?.past.length),
    canRedo: Boolean(history?.future.length),
  });
};
