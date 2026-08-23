import { LiveObject, LsonObject } from "@liveblocks/client";
import { useCanRedo, useCanUndo, useHistory, useMutation } from "@liveblocks/react";
import { useCallback } from "react";
import { useDispatch, useSelector } from "react-redux";
import { Shape } from "../classes/shape";
import {
  alignShapes,
  AlignMode,
  copyShapes,
  deleteShapes,
  distributeShapes,
  duplicateShapes,
  groupShapes,
  orderShapes,
  OrderMode,
  pasteShapes,
  patchShapes,
  ungroupShapes,
} from "./commands";
import { moveShapesFromBaseline, normalizeShape, shapeBounds } from "./geometry";
import { commitEditorSnapshot, setClipboard, setSaveStatus } from "../features/editor/editorSlice";
import { replaceShapes, setWhiteboardData, WhiteBoardState } from "../features/whiteBoard/whiteBoardSlice";
import { clearSelectedShapes, setSelectedShapes } from "../features/selected/selectedSlice";
import { updateBoardSettings } from "../services/boardRepository";
import { AppDispatch, RootState } from "../store";
import { shapePatch, storedShape } from "../collaboration/shapes";

export const useEditorActions = () => {
  const dispatch = useDispatch<AppDispatch>();
  const board = useSelector((state: RootState) => state.whiteBoard);
  const selectedIds = useSelector((state: RootState) => state.selected.selectedShapes);
  const editor = useSelector((state: RootState) => state.editor);
  const history = useHistory();
  const canUndo = useCanUndo();
  const canRedo = useCanRedo();
  const canEdit = board.role === "owner" || board.role === "editor";

  const mutateShapes = useMutation(
    ({ storage }, nextShapes: Shape[], previousShapes: Shape[]) => {
      const nodes = storage.get("nodes");
      const previousById = new Map(previousShapes.map((shape) => [shape.id, shape]));
      const nextById = new Map(nextShapes.map((shape) => [shape.id, shape]));

      previousById.forEach((_shape, id) => {
        if (!nextById.has(id)) nodes.delete(id);
      });
      nextById.forEach((shape, id) => {
        const previous = previousById.get(id);
        const existing = nodes.get(id);
        if (!previous || !existing) {
          nodes.set(id, new LiveObject(storedShape(shape) as LsonObject));
          return;
        }
        const patch = shapePatch(previous, shape);
        if (Object.keys(patch.update).length) existing.update(patch.update);
        patch.remove.forEach((key) => existing.delete(key));
      });
    },
    []
  );

  const mutateBackground = useMutation(({ storage }, color: string) => {
    storage.set("backgroundColor", color);
  }, []);

  const previewShapes = useCallback(
    (shapes: Shape[]) => dispatch(replaceShapes(shapes)),
    [dispatch]
  );

  const commitShapes = useCallback(
    (
      nextShapes: Shape[],
      previousShapes = board.shapes,
      boardOverride?: WhiteBoardState
    ) => {
      const activeBoard = boardOverride ?? board;
      if (!activeBoard.id || !canEdit) return;
      const normalized = nextShapes.map(normalizeShape);
      if (JSON.stringify(previousShapes) === JSON.stringify(normalized)) return;
      dispatch(replaceShapes(normalized));
      dispatch(commitEditorSnapshot({
        boardId: activeBoard.id,
        shapes: normalized,
        backgroundColor: activeBoard.backGroundColor,
      }));
      mutateShapes(normalized, previousShapes);
    },
    [board, canEdit, dispatch, mutateShapes]
  );

  const commitBoardPatch = useCallback(
    (patch: Partial<WhiteBoardState>) => {
      if (!board.id || !canEdit) return;
      if ((patch.type !== undefined || patch.title !== undefined) && board.role !== "owner") return;

      if (patch.backGroundColor !== undefined && patch.backGroundColor !== board.backGroundColor) {
        dispatch(setWhiteboardData({ backGroundColor: patch.backGroundColor }));
        mutateBackground(patch.backGroundColor);
      }

      const settings: { title?: string; visibility?: "private" | "public" } = {
        ...(typeof patch.title === "string" ? { title: patch.title } : {}),
        ...(patch.type === "private" || patch.type === "public"
          ? { visibility: patch.type }
          : {}),
      };
      if (Object.keys(settings).length) {
        const previous = { title: board.title, type: board.type };
        dispatch(setWhiteboardData(patch));
        dispatch(setSaveStatus({ status: "saving" }));
        void updateBoardSettings(board.id, settings)
          .then(() => dispatch(setSaveStatus({ status: "saved" })))
          .catch((error) => {
            dispatch(setWhiteboardData(previous));
            dispatch(setSaveStatus({
              status: "error",
              error: error instanceof Error ? error.message : "We couldn't save board settings.",
            }));
          });
      }
    },
    [board, canEdit, dispatch, mutateBackground]
  );

  const patchSelected = useCallback(
    (patch: Partial<Shape>) => commitShapes(patchShapes(board.shapes, selectedIds, patch)),
    [board.shapes, commitShapes, selectedIds]
  );

  const removeSelected = useCallback(() => {
    commitShapes(deleteShapes(board.shapes, selectedIds));
    dispatch(clearSelectedShapes());
  }, [board.shapes, commitShapes, dispatch, selectedIds]);

  const copySelected = useCallback(() => {
    if (selectedIds.length === 0) return;
    dispatch(setClipboard(copyShapes(board.shapes, selectedIds)));
  }, [board.shapes, dispatch, selectedIds]);

  const cutSelected = useCallback(() => {
    copySelected();
    removeSelected();
  }, [copySelected, removeSelected]);

  const duplicateSelected = useCallback(() => {
    const result = duplicateShapes(board.shapes, selectedIds);
    commitShapes(result.shapes);
    dispatch(setSelectedShapes(result.duplicatedIds));
  }, [board.shapes, commitShapes, dispatch, selectedIds]);

  const paste = useCallback(() => {
    if (editor.clipboard.length === 0) return;
    const result = pasteShapes(board.shapes, editor.clipboard);
    commitShapes(result.shapes);
    dispatch(setSelectedShapes(result.pastedIds));
    dispatch(setClipboard(result.pasted));
  }, [board.shapes, commitShapes, dispatch, editor.clipboard]);

  const orderSelected = useCallback(
    (mode: OrderMode) => commitShapes(orderShapes(board.shapes, selectedIds, mode)),
    [board.shapes, commitShapes, selectedIds]
  );
  const alignSelected = useCallback(
    (mode: AlignMode) => commitShapes(alignShapes(board.shapes, selectedIds, mode)),
    [board.shapes, commitShapes, selectedIds]
  );
  const distributeSelected = useCallback(
    (axis: "horizontal" | "vertical") => commitShapes(distributeShapes(board.shapes, selectedIds, axis)),
    [board.shapes, commitShapes, selectedIds]
  );
  const groupSelected = useCallback(
    () => commitShapes(groupShapes(board.shapes, selectedIds)),
    [board.shapes, commitShapes, selectedIds]
  );
  const ungroupSelected = useCallback(
    () => commitShapes(ungroupShapes(board.shapes, selectedIds)),
    [board.shapes, commitShapes, selectedIds]
  );
  const nudgeSelected = useCallback(
    (x: number, y: number) => commitShapes(moveShapesFromBaseline(board.shapes, selectedIds, { x, y })),
    [board.shapes, commitShapes, selectedIds]
  );
  const undo = useCallback(() => history.undo(), [history]);
  const redo = useCallback(() => history.redo(), [history]);

  const setShapeGeometry = useCallback(
    (shape: Shape, values: Partial<{ x: number; y: number; width: number; height: number }>) => {
      const bounds = shapeBounds(shape);
      const x = values.x ?? bounds.x;
      const y = values.y ?? bounds.y;
      const width = Math.max(1, values.width ?? bounds.width);
      const height = Math.max(1, values.height ?? bounds.height);
      commitShapes(board.shapes.map((item) => item.id === shape.id
        ? normalizeShape({ ...item, x1: x, y1: y, x2: x + width, y2: y + height })
        : item));
    },
    [board.shapes, commitShapes]
  );

  return {
    canEdit,
    canUndo,
    canRedo,
    previewShapes,
    commitShapes,
    commitBoardPatch,
    patchSelected,
    removeSelected,
    copySelected,
    cutSelected,
    paste,
    duplicateSelected,
    orderSelected,
    alignSelected,
    distributeSelected,
    groupSelected,
    ungroupSelected,
    nudgeSelected,
    undo,
    redo,
    setShapeGeometry,
  };
};
