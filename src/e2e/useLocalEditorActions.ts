import { useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import type { Shape } from "../classes/shape";
import {
  alignShapes,
  copyShapes,
  deleteShapes,
  distributeShapes,
  duplicateShapes,
  groupShapes,
  orderShapes,
  pasteShapes,
  patchShapes,
  ungroupShapes,
} from "../editor/commands";
import { moveShapesFromBaseline, normalizeShape, shapeBounds } from "../editor/geometry";
import type { EditorActions } from "../editor/useEditorActions";
import { setClipboard } from "../features/editor/editorSlice";
import { setSelectedShapes } from "../features/selected/selectedSlice";
import { replaceShapes, setWhiteboardData } from "../features/whiteBoard/whiteBoardSlice";
import type { AppDispatch, RootState } from "../store";

const cloneShapes = (shapes: Shape[]) => JSON.parse(JSON.stringify(shapes)) as Shape[];

/**
 * A browser-test adapter for the real editor views. It keeps persistence local
 * while exercising the same reducers, geometry, and command algorithms used by
 * a collaborative board.
 */
export const useLocalEditorActions = (): EditorActions => {
  const dispatch = useDispatch<AppDispatch>();
  const board = useSelector((state: RootState) => state.whiteBoard);
  const selectedIds = useSelector((state: RootState) => state.selected.selectedShapes);
  const selectionRotation = useSelector((state: RootState) => state.selected.selectionRotation);
  const editor = useSelector((state: RootState) => state.editor);
  const [undoStack, setUndoStack] = useState<Shape[][]>([]);
  const [redoStack, setRedoStack] = useState<Shape[][]>([]);

  const commitShapes = (nextShapes: Shape[], previousShapes = board.shapes) => {
    const normalized = nextShapes.map(normalizeShape);
    if (JSON.stringify(previousShapes) === JSON.stringify(normalized)) return;
    setUndoStack((history) => [...history, cloneShapes(previousShapes)]);
    setRedoStack([]);
    dispatch(replaceShapes(normalized));
  };

  const previewShapes = (shapes: Shape[]) => dispatch(replaceShapes(shapes));
  const cancelPreview = (shapes: Shape[]) => dispatch(replaceShapes(shapes));
  const patchSelected = (patch: Partial<Shape>) =>
    commitShapes(patchShapes(board.shapes, selectedIds, patch));
  const removeSelected = () => {
    const next = deleteShapes(board.shapes, selectedIds);
    commitShapes(next);
    const remaining = new Set(next.map((shape) => shape.id));
    dispatch(setSelectedShapes(selectedIds.filter((id) => remaining.has(id))));
  };
  const copySelected = () =>
    dispatch(setClipboard({ shapes: copyShapes(board.shapes, selectedIds), boardId: board.id }));
  const cutSelected = () => {
    copySelected();
    removeSelected();
  };
  const paste = async () => {
    const result = pasteShapes(board.shapes, editor.clipboard);
    commitShapes(result.shapes);
    dispatch(setSelectedShapes(result.pastedIds));
    dispatch(setClipboard({ shapes: result.pasted, boardId: board.id }));
  };
  const duplicateSelected = () => {
    const result = duplicateShapes(board.shapes, selectedIds);
    commitShapes(result.shapes);
    dispatch(setSelectedShapes(result.duplicatedIds));
  };
  const undo = () => {
    const previous = undoStack.at(-1);
    if (!previous) return;
    setUndoStack((history) => history.slice(0, -1));
    setRedoStack((history) => [...history, cloneShapes(board.shapes)]);
    dispatch(replaceShapes(previous));
  };
  const redo = () => {
    const next = redoStack.at(-1);
    if (!next) return;
    setRedoStack((history) => history.slice(0, -1));
    setUndoStack((history) => [...history, cloneShapes(board.shapes)]);
    dispatch(replaceShapes(next));
  };

  return {
    canEdit: true,
    canUndo: undoStack.length > 0,
    canRedo: redoStack.length > 0,
    previewShapes,
    cancelPreview,
    commitShapes,
    commitBoardPatch: (patch) => dispatch(setWhiteboardData(patch)),
    patchSelected,
    removeSelected,
    copySelected,
    cutSelected,
    paste,
    duplicateSelected,
    orderSelected: (mode) => commitShapes(orderShapes(board.shapes, selectedIds, mode)),
    alignSelected: (mode) => commitShapes(alignShapes(board.shapes, selectedIds, mode)),
    distributeSelected: (axis) => commitShapes(distributeShapes(board.shapes, selectedIds, axis)),
    groupSelected: () => commitShapes(groupShapes(board.shapes, selectedIds, undefined, selectionRotation)),
    ungroupSelected: () => commitShapes(ungroupShapes(board.shapes, selectedIds)),
    nudgeSelected: (x, y) => commitShapes(moveShapesFromBaseline(board.shapes, selectedIds, { x, y })),
    undo,
    redo,
    setShapeGeometry: (shape, values) => {
      const bounds = shapeBounds(shape);
      const x = values.x ?? bounds.x;
      const y = values.y ?? bounds.y;
      const width = Math.max(1, values.width ?? bounds.width);
      const height = Math.max(1, values.height ?? bounds.height);
      commitShapes(board.shapes.map((item) => item.id === shape.id
        ? normalizeShape({ ...item, x1: x, y1: y, x2: x + width, y2: y + height })
        : item));
    },
  };
};
