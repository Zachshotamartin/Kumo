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
  frameShapes,
  groupShapes,
  orderShapes,
  OrderMode,
  pasteShapes,
  patchShapes,
  unframeShapes,
  ungroupShapes,
} from "./commands";
import { moveShapesFromBaseline, normalizeShape, selectionBounds, shapeBounds } from "./geometry";
import { commonParentId, isEffectivelyLocked, rootSelectionIds } from "./hierarchy";
import type { PasteContext } from "./types";
import {
  commitEditorSnapshot,
  setClipboard,
  setLocalPreviewActive,
  setSaveStatus,
} from "../features/editor/editorSlice";
import { replaceShapes, setWhiteboardData, WhiteBoardState } from "../features/whiteBoard/whiteBoardSlice";
import { setSelectedShapes } from "../features/selected/selectedSlice";
import { updateBoardSettings } from "../services/boardRepository";
import {
  cloneBoardAssets,
  collectShapeAssetIds,
  rewriteShapeAssetIds,
} from "../services/assetRepository";
import { AppDispatch, RootState } from "../store";
import { applyShapeMutation } from "../collaboration/mutations";

export const useEditorActions = () => {
  const dispatch = useDispatch<AppDispatch>();
  const board = useSelector((state: RootState) => state.whiteBoard);
  const selectedIds = useSelector((state: RootState) => state.selected.selectedShapes);
  const selectionRotation = useSelector((state: RootState) => state.selected.selectionRotation);
  const editor = useSelector((state: RootState) => state.editor);
  const history = useHistory();
  const canUndo = useCanUndo();
  const canRedo = useCanRedo();
  const canEdit = board.role === "owner" || board.role === "editor";

  const mutateShapes = useMutation(
    ({ storage }, nextShapes: Shape[], previousShapes: Shape[]) => {
      applyShapeMutation(storage.get("nodes"), nextShapes, previousShapes);
    },
    []
  );

  const mutateBackground = useMutation(({ storage }, color: string) => {
    storage.set("backgroundColor", color);
  }, []);

  const previewShapes = useCallback(
    (shapes: Shape[]) => {
      dispatch(setLocalPreviewActive(true));
      dispatch(replaceShapes(shapes));
    },
    [dispatch]
  );

  const cancelPreview = useCallback((shapes: Shape[]) => {
    dispatch(replaceShapes(shapes));
    dispatch(setLocalPreviewActive(false));
  }, [dispatch]);

  const commitShapes = useCallback(
    (
      nextShapes: Shape[],
      previousShapes = board.shapes,
      boardOverride?: WhiteBoardState
    ) => {
      const activeBoard = boardOverride ?? board;
      if (!activeBoard.id || !canEdit) {
        dispatch(setLocalPreviewActive(false));
        return;
      }
      const normalized = nextShapes.map(normalizeShape);
      if (JSON.stringify(previousShapes) === JSON.stringify(normalized)) {
        dispatch(setLocalPreviewActive(false));
        return;
      }
      mutateShapes(normalized, previousShapes);
      dispatch(replaceShapes(normalized));
      dispatch(setLocalPreviewActive(false));
      dispatch(commitEditorSnapshot({
        boardId: activeBoard.id,
        shapes: normalized,
        backgroundColor: activeBoard.backGroundColor,
      }));
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
    if (!canEdit) return;
    const next = deleteShapes(board.shapes, selectedIds);
    commitShapes(next);
    const remaining = new Set(next.map((shape) => shape.id));
    dispatch(setSelectedShapes(selectedIds.filter((id) => remaining.has(id))));
  }, [board.shapes, canEdit, commitShapes, dispatch, selectedIds]);

  const copySelected = useCallback(() => {
    if (selectedIds.length === 0) return;
    const roots = rootSelectionIds(board.shapes, selectedIds);
    const copied = copyShapes(board.shapes, roots);
    const parentId = commonParentId(board.shapes, roots);
    const parent = parentId ? board.shapes.find((shape) => shape.id === parentId) : undefined;
    dispatch(setClipboard({
      shapes: copied,
      boardId: board.id,
      sourceBounds: selectionBounds(board.shapes, roots),
      parentBounds: parent ? shapeBounds(parent) : null,
    }));
  }, [board.id, board.shapes, dispatch, selectedIds]);

  const cutSelected = useCallback(() => {
    if (!canEdit) return;
    copySelected();
    removeSelected();
  }, [canEdit, copySelected, removeSelected]);

  const duplicateSelected = useCallback(() => {
    if (!canEdit) return;
    const result = duplicateShapes(board.shapes, selectedIds);
    commitShapes(result.shapes);
    dispatch(setSelectedShapes(result.duplicatedIds));
  }, [board.shapes, canEdit, commitShapes, dispatch, selectedIds]);

  const paste = useCallback(async (context?: PasteContext) => {
    if (!canEdit || !board.id || editor.clipboard.length === 0) return;
    try {
      let clipboard = editor.clipboard;
      if (editor.clipboardBoardId && editor.clipboardBoardId !== board.id) {
        const assetIds = collectShapeAssetIds(clipboard);
        const replacements = await cloneBoardAssets(board.id, assetIds);
        clipboard = rewriteShapeAssetIds(clipboard, replacements);
      }
      const result = pasteShapes(board.shapes, clipboard, {
        context,
        sourceParentBounds: editor.clipboardParentBounds,
      });
      commitShapes(result.shapes);
      dispatch(setSelectedShapes(result.pastedIds));
      const parentId = commonParentId(result.shapes, result.pastedIds);
      const parent = parentId ? result.shapes.find((shape) => shape.id === parentId) : undefined;
      dispatch(setClipboard({
        shapes: result.pasted,
        boardId: board.id,
        sourceBounds: selectionBounds(result.shapes, result.pastedIds),
        parentBounds: parent ? shapeBounds(parent) : null,
      }));
    } catch (error) {
      dispatch(setSaveStatus({
        status: "error",
        error: error instanceof Error ? error.message : "We couldn't paste these assets.",
      }));
    }
  }, [board.id, board.shapes, canEdit, commitShapes, dispatch, editor.clipboard, editor.clipboardBoardId, editor.clipboardParentBounds]);

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
    () => commitShapes(groupShapes(board.shapes, selectedIds, undefined, selectionRotation)),
    [board.shapes, commitShapes, selectedIds, selectionRotation]
  );
  const ungroupSelected = useCallback(
    () => commitShapes(ungroupShapes(board.shapes, selectedIds)),
    [board.shapes, commitShapes, selectedIds]
  );
  const frameSelected = useCallback(() => {
    const result = frameShapes(board.shapes, selectedIds);
    if (!result.frameId) return;
    commitShapes(result.shapes);
    dispatch(setSelectedShapes([result.frameId]));
  }, [board.shapes, commitShapes, dispatch, selectedIds]);
  const unframeSelected = useCallback(() => {
    const result = unframeShapes(board.shapes, selectedIds);
    commitShapes(result.shapes);
    dispatch(setSelectedShapes(result.selectedIds));
  }, [board.shapes, commitShapes, dispatch, selectedIds]);
  const nudgeSelected = useCallback(
    (x: number, y: number) => commitShapes(moveShapesFromBaseline(board.shapes, selectedIds, { x, y })),
    [board.shapes, commitShapes, selectedIds]
  );
  const undo = useCallback(() => history.undo(), [history]);
  const redo = useCallback(() => history.redo(), [history]);

  const setShapeGeometry = useCallback(
    (shape: Shape, values: Partial<{ x: number; y: number; width: number; height: number }>) => {
      if (isEffectivelyLocked(board.shapes, shape)) return;
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
    cancelPreview,
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
    frameSelected,
    unframeSelected,
    nudgeSelected,
    undo,
    redo,
    setShapeGeometry,
  };
};

export type EditorActions = ReturnType<typeof useEditorActions>;
