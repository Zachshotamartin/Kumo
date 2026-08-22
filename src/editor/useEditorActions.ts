import { useCallback } from "react";
import { useDispatch, useSelector } from "react-redux";
import { createShapeId, Shape } from "../classes/shape";
import {
  alignShapes,
  AlignMode,
  deleteShapes,
  distributeShapes,
  duplicateShapes,
  groupShapes,
  orderShapes,
  OrderMode,
  patchShapes,
  ungroupShapes,
} from "./commands";
import { moveShapesFromBaseline, normalizeShape, shapeBounds } from "./geometry";
import { redoEditorHistory, undoEditorHistory } from "./history";
import {
  commitEditorSnapshot,
  redoEditor,
  setClipboard,
  setSaveStatus,
  undoEditor,
} from "../features/editor/editorSlice";
import {
  replaceShapes,
  setWhiteboardData,
  WhiteBoardState,
} from "../features/whiteBoard/whiteBoardSlice";
import { clearSelectedShapes, setSelectedShapes } from "../features/selected/selectedSlice";
import { saveBoardChanges } from "../firebase/services/boardRepository";
import { AppDispatch, RootState } from "../store";

const cloneShapes = (shapes: Shape[]): Shape[] => JSON.parse(JSON.stringify(shapes));

export const useEditorActions = () => {
  const dispatch = useDispatch<AppDispatch>();
  const board = useSelector((state: RootState) => state.whiteBoard);
  const selectedIds = useSelector((state: RootState) => state.selected.selectedShapes);
  const editor = useSelector((state: RootState) => state.editor);
  const user = useSelector((state: RootState) => state.auth);
  const canEdit = Boolean(
    user.uid &&
      (board.uid === user.uid ||
        board.members[user.uid] === "owner" ||
        board.members[user.uid] === "editor")
  );

  const persist = useCallback(
    async (previous: WhiteBoardState, next: WhiteBoardState) => {
      if (!user.uid || !next.id) return;
      dispatch(setSaveStatus({ status: "saving" }));
      try {
        await saveBoardChanges(previous, next, user.uid);
        dispatch(setSaveStatus({ status: "saved" }));
      } catch (error) {
        dispatch(
          setSaveStatus({
            status: "error",
            error: error instanceof Error ? error.message : "We couldn't save this change.",
          })
        );
      }
    },
    [dispatch, user.uid]
  );

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

      const previous = { ...activeBoard, shapes: cloneShapes(previousShapes) };
      const next = {
        ...activeBoard,
        shapes: normalized,
        lastChangedBy: user.uid,
      };
      dispatch(replaceShapes(normalized));
      dispatch(
        commitEditorSnapshot({
          boardId: activeBoard.id,
          shapes: normalized,
          backgroundColor: activeBoard.backGroundColor,
        })
      );
      void persist(previous, next);
    },
    [board, canEdit, dispatch, persist, user.uid]
  );

  const commitBoardPatch = useCallback(
    (patch: Partial<WhiteBoardState>) => {
      if (!board.id || !canEdit) return;
      if (patch.type !== undefined && board.uid !== user.uid) return;
      const previous = { ...board };
      const next = { ...board, ...patch, lastChangedBy: user.uid };
      dispatch(setWhiteboardData(next));
      dispatch(
        commitEditorSnapshot({
          boardId: board.id,
          shapes: next.shapes,
          backgroundColor: next.backGroundColor,
        })
      );
      void persist(previous, next);
    },
    [board, canEdit, dispatch, persist, user.uid]
  );

  const patchSelected = useCallback(
    (patch: Partial<Shape>) => commitShapes(patchShapes(board.shapes, selectedIds, patch)),
    [board.shapes, commitShapes, selectedIds]
  );

  const removeSelected = useCallback(() => {
    const next = deleteShapes(board.shapes, selectedIds);
    commitShapes(next);
    dispatch(clearSelectedShapes());
  }, [board.shapes, commitShapes, dispatch, selectedIds]);

  const copySelected = useCallback(() => {
    dispatch(setClipboard(board.shapes.filter((shape) => selectedIds.includes(shape.id))));
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
    const highestZ = board.shapes.reduce((value, shape) => Math.max(value, shape.zIndex), 0);
    const groupMap = new Map<string, string>();
    const pasted = editor.clipboard.map((shape, index) => {
      const sourceGroup = shape.groupId;
      if (sourceGroup && !groupMap.has(sourceGroup)) groupMap.set(sourceGroup, createShapeId());
      return normalizeShape({
        ...shape,
        id: createShapeId(),
        name: `${shape.name ?? shape.type} copy`,
        groupId: sourceGroup ? groupMap.get(sourceGroup) ?? null : null,
        x1: shape.x1 + 24,
        x2: shape.x2 + 24,
        y1: shape.y1 + 24,
        y2: shape.y2 + 24,
        zIndex: highestZ + index + 1,
      });
    });
    commitShapes([...board.shapes, ...pasted]);
    dispatch(setSelectedShapes(pasted.map((shape) => shape.id)));
    dispatch(setClipboard(pasted));
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
    (axis: "horizontal" | "vertical") =>
      commitShapes(distributeShapes(board.shapes, selectedIds, axis)),
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
    (x: number, y: number) =>
      commitShapes(moveShapesFromBaseline(board.shapes, selectedIds, { x, y })),
    [board.shapes, commitShapes, selectedIds]
  );

  const undo = useCallback(() => {
    if (!editor.history || editor.history.past.length === 0 || !board.id) return;
    const nextHistory = undoEditorHistory(editor.history);
    const previous = { ...board };
    const next = {
      ...board,
      shapes: cloneShapes(nextHistory.present.shapes),
      backGroundColor: nextHistory.present.backgroundColor,
      lastChangedBy: user.uid,
    };
    dispatch(undoEditor());
    dispatch(setWhiteboardData(next));
    void persist(previous, next);
  }, [board, dispatch, editor.history, persist, user.uid]);

  const redo = useCallback(() => {
    if (!editor.history || editor.history.future.length === 0 || !board.id) return;
    const nextHistory = redoEditorHistory(editor.history);
    const previous = { ...board };
    const next = {
      ...board,
      shapes: cloneShapes(nextHistory.present.shapes),
      backGroundColor: nextHistory.present.backgroundColor,
      lastChangedBy: user.uid,
    };
    dispatch(redoEditor());
    dispatch(setWhiteboardData(next));
    void persist(previous, next);
  }, [board, dispatch, editor.history, persist, user.uid]);

  const setShapeGeometry = useCallback(
    (shape: Shape, values: Partial<{ x: number; y: number; width: number; height: number }>) => {
      const bounds = shapeBounds(shape);
      const x = values.x ?? bounds.x;
      const y = values.y ?? bounds.y;
      const width = Math.max(1, values.width ?? bounds.width);
      const height = Math.max(1, values.height ?? bounds.height);
      commitShapes(
        board.shapes.map((item) =>
          item.id === shape.id
            ? normalizeShape({ ...item, x1: x, y1: y, x2: x + width, y2: y + height })
            : item
        )
      );
    },
    [board.shapes, commitShapes]
  );

  return {
    canEdit,
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
