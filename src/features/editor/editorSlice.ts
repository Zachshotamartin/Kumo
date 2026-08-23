import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import { Shape } from "../../classes/shape";
import {
  commitEditorHistory,
  createEditorHistory,
  redoEditorHistory,
  undoEditorHistory,
} from "../../editor/history";
import { EditorDocumentSnapshot, EditorHistory, Viewport } from "../../editor/types";

interface EditorState {
  viewport: Viewport;
  history: EditorHistory | null;
  clipboard: Shape[];
  clipboardBoardId: string | null;
  hoveredShapeId: string | null;
  editingShapeId: string | null;
  snapToGrid: boolean;
  gridSize: number;
  saveStatus: "idle" | "saving" | "saved" | "error";
  saveError: string | null;
  localPreviewActive: boolean;
}

const initialState: EditorState = {
  viewport: { x: 0, y: 0, zoom: 1 },
  history: null,
  clipboard: [],
  clipboardBoardId: null,
  hoveredShapeId: null,
  editingShapeId: null,
  snapToGrid: false,
  gridSize: 8,
  saveStatus: "idle",
  saveError: null,
  localPreviewActive: false,
};

const editorSlice = createSlice({
  name: "editor",
  initialState,
  reducers: {
    setViewport: (state, action: PayloadAction<Viewport>) => {
      state.viewport = action.payload;
    },
    initializeEditor: (state, action: PayloadAction<EditorDocumentSnapshot>) => {
      state.history = createEditorHistory(action.payload);
      state.hoveredShapeId = null;
      state.editingShapeId = null;
      state.saveStatus = "idle";
      state.saveError = null;
      state.localPreviewActive = false;
    },
    commitEditorSnapshot: (
      state,
      action: PayloadAction<EditorDocumentSnapshot>
    ) => {
      state.history = state.history
        ? commitEditorHistory(state.history, action.payload)
        : createEditorHistory(action.payload);
    },
    undoEditor: (state) => {
      if (state.history) state.history = undoEditorHistory(state.history);
    },
    redoEditor: (state) => {
      if (state.history) state.history = redoEditorHistory(state.history);
    },
    setClipboard: (
      state,
      action: PayloadAction<{ shapes: Shape[]; boardId: string | null }>
    ) => {
      state.clipboard = JSON.parse(JSON.stringify(action.payload.shapes));
      state.clipboardBoardId = action.payload.boardId;
    },
    setHoveredShapeId: (state, action: PayloadAction<string | null>) => {
      state.hoveredShapeId = action.payload;
    },
    setEditingShapeId: (state, action: PayloadAction<string | null>) => {
      state.editingShapeId = action.payload;
    },
    setLocalPreviewActive: (state, action: PayloadAction<boolean>) => {
      state.localPreviewActive = action.payload;
    },
    setSnapToGrid: (state, action: PayloadAction<boolean>) => {
      state.snapToGrid = action.payload;
    },
    setGridSize: (state, action: PayloadAction<number>) => {
      state.gridSize = Math.max(1, action.payload);
    },
    setSaveStatus: (
      state,
      action: PayloadAction<{
        status: EditorState["saveStatus"];
        error?: string | null;
      }>
    ) => {
      state.saveStatus = action.payload.status;
      state.saveError = action.payload.error ?? null;
    },
  },
});

export const {
  setViewport,
  initializeEditor,
  commitEditorSnapshot,
  undoEditor,
  redoEditor,
  setClipboard,
  setHoveredShapeId,
  setEditingShapeId,
  setLocalPreviewActive,
  setSnapToGrid,
  setGridSize,
  setSaveStatus,
} = editorSlice.actions;

export default editorSlice.reducer;
