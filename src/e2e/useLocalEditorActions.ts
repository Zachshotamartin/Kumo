import { useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import type { Shape } from "../classes/shape";
import {
  alignShapes,
  copyShapes,
  deleteShapes,
  distributeShapes,
  duplicateShapes,
  frameShapes,
  groupShapes,
  orderShapes,
  pasteShapes,
  unframeShapes,
  ungroupShapes,
} from "../editor/commands";
import { moveShapesFromBaseline, normalizeShape, selectionBounds, shapeBounds } from "../editor/geometry";
import { applyDocumentLayout } from "../editor/layout";
import {
  applySharedStyle,
  bindVariable,
  createComponent,
  createSharedStyle,
  createVariable,
  createVariantSet,
  detachInstance,
  instantiateComponent,
  patchInstanceAware,
  resetInstance,
  resolveVariables,
  swapInstanceVariant,
  synchronizeComponentInstances,
} from "../editor/designSystem";
import { commonParentId, rootSelectionIds } from "../editor/hierarchy";
import type { EditorActions } from "../editor/useEditorActions";
import { setClipboard, setCurrentPageId } from "../features/editor/editorSlice";
import { setSelectedShapes } from "../features/selected/selectedSlice";
import { replaceShapes, setWhiteboardData } from "../features/whiteBoard/whiteBoardSlice";
import type { AppDispatch, RootState } from "../store";
import { createBooleanOperation, createMask, flattenBooleanOperation, releaseMask } from "../editor/graphics";
import { createPage, createSection, createSectionCollection, deletePage, duplicatePage, renamePage } from "../editor/workspace";

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
    const normalized = applyDocumentLayout(resolveVariables(synchronizeComponentInstances(nextShapes.map(normalizeShape))));
    if (JSON.stringify(previousShapes) === JSON.stringify(normalized)) return;
    setUndoStack((history) => [...history, cloneShapes(previousShapes)]);
    setRedoStack([]);
    dispatch(replaceShapes(normalized));
  };

  const previewShapes = (shapes: Shape[]) => dispatch(replaceShapes(shapes));
  const cancelPreview = (shapes: Shape[]) => dispatch(replaceShapes(shapes));
  const patchSelected = (patch: Partial<Shape>) =>
    commitShapes(patchInstanceAware(board.shapes, selectedIds, patch));
  const removeSelected = () => {
    const next = deleteShapes(board.shapes, selectedIds);
    commitShapes(next);
    const remaining = new Set(next.map((shape) => shape.id));
    dispatch(setSelectedShapes(selectedIds.filter((id) => remaining.has(id))));
  };
  const copySelected = () => {
    const roots = rootSelectionIds(board.shapes, selectedIds);
    const parentId = commonParentId(board.shapes, roots);
    const parent = parentId ? board.shapes.find((shape) => shape.id === parentId) : undefined;
    dispatch(setClipboard({
      shapes: copyShapes(board.shapes, roots),
      boardId: board.id,
      sourceBounds: selectionBounds(board.shapes, roots),
      parentBounds: parent ? shapeBounds(parent) : null,
    }));
  };
  const cutSelected = () => {
    copySelected();
    removeSelected();
  };
  const paste: EditorActions["paste"] = async (context) => {
    const result = pasteShapes(board.shapes, editor.clipboard, {
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
    createComponentSelected: (name) => {
      const result = createComponent(board.shapes, selectedIds, name);
      commitShapes(result.shapes);
      if (result.componentId) dispatch(setSelectedShapes([result.componentId]));
    },
    createVariantSetSelected: () => commitShapes(createVariantSet(board.shapes, selectedIds).shapes),
    addComponentInstance: (componentId, point) => {
      const result = instantiateComponent(board.shapes, componentId, point);
      commitShapes(result.shapes.map((shape) => shape.instanceRootId === result.instanceId ? { ...shape, pageId: editor.currentPageId } : shape));
      if (result.instanceId) dispatch(setSelectedShapes([result.instanceId]));
    },
    detachSelectedInstance: () => {
      const root = board.shapes.find((shape) => selectedIds.includes(shape.id) && shape.instanceRootId === shape.id);
      if (root) commitShapes(detachInstance(board.shapes, root.id));
    },
    resetSelectedInstance: () => {
      const root = board.shapes.find((shape) => selectedIds.includes(shape.id) && shape.instanceRootId === shape.id);
      if (root) commitShapes(resetInstance(board.shapes, root.id));
    },
    swapSelectedVariant: (componentId) => {
      const root = board.shapes.find((shape) => selectedIds.includes(shape.id) && shape.instanceRootId === shape.id);
      if (root) commitShapes(swapInstanceVariant(board.shapes, root.id, componentId));
    },
    createStyleFromSelected: (kind, name) => {
      const source = board.shapes.find((shape) => selectedIds.includes(shape.id));
      if (source) commitShapes(createSharedStyle(board.shapes, source, kind, name).shapes);
    },
    applyStyleToSelected: (styleId) => commitShapes(applySharedStyle(board.shapes, selectedIds, styleId)),
    createLibraryVariable: (kind, name, value) => commitShapes(createVariable(board.shapes, kind, name, value).shapes),
    bindVariableToSelected: (property, variableId) => commitShapes(bindVariable(board.shapes, selectedIds, property, variableId)),
    booleanSelected: (operation) => {
      const result = createBooleanOperation(board.shapes, selectedIds, operation);
      commitShapes(result.shapes);
      if (result.booleanId) dispatch(setSelectedShapes([result.booleanId]));
    },
    flattenSelectedBoolean: () => {
      const selected = board.shapes.find((shape) => selectedIds.includes(shape.id) && shape.type === "boolean");
      if (selected) commitShapes(flattenBooleanOperation(board.shapes, selected.id));
    },
    maskSelected: () => commitShapes(createMask(board.shapes, selectedIds)),
    releaseSelectedMask: () => {
      const mask = board.shapes.find((shape) => selectedIds.includes(shape.id) && (shape.isMask || shape.maskId));
      const id = mask?.isMask ? mask.id : mask?.maskId;
      if (id) commitShapes(releaseMask(board.shapes, id));
    },
    addPage: () => {
      const result = createPage(board.shapes);
      commitShapes(result.shapes);
      dispatch(setCurrentPageId(result.pageId));
    },
    renameDocumentPage: (pageId, name) => commitShapes(renamePage(board.shapes, pageId, name)),
    duplicateDocumentPage: (pageId) => {
      const result = duplicatePage(board.shapes, pageId);
      commitShapes(result.shapes);
      if (result.pageId) dispatch(setCurrentPageId(result.pageId));
    },
    deleteDocumentPage: (pageId) => {
      const result = deletePage(board.shapes, pageId);
      commitShapes(result.shapes);
      dispatch(setCurrentPageId(result.nextPageId));
    },
    sectionSelected: () => {
      const result = createSection(board.shapes, selectedIds, editor.currentPageId ?? "page:default");
      commitShapes(result.shapes);
      if (result.sectionId) dispatch(setSelectedShapes([result.sectionId]));
    },
    collectSelectedSections: () => commitShapes(createSectionCollection(board.shapes, selectedIds).shapes),
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
    frameSelected: () => {
      const result = frameShapes(board.shapes, selectedIds);
      if (!result.frameId) return;
      commitShapes(result.shapes);
      dispatch(setSelectedShapes([result.frameId]));
    },
    unframeSelected: () => {
      const result = unframeShapes(board.shapes, selectedIds);
      commitShapes(result.shapes);
      dispatch(setSelectedShapes(result.selectedIds));
    },
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
