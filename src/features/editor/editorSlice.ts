import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import { Shape } from "../../classes/shape";
import {
  commitEditorHistory,
  createEditorHistory,
  redoEditorHistory,
  undoEditorHistory,
} from "../../editor/history";
import {
  Bounds,
  CommentAnchor,
  EditorDocumentSnapshot,
  EditorHistory,
  EditorRightPanel,
  Viewport,
} from "../../editor/types";

interface EditorState {
  viewport: Viewport;
  history: EditorHistory | null;
  clipboard: Shape[];
  clipboardBoardId: string | null;
  clipboardSourceBounds: Bounds | null;
  clipboardParentBounds: Bounds | null;
  hoveredShapeId: string | null;
  editingShapeId: string | null;
  snapToGrid: boolean;
  gridSize: number;
  saveStatus: "idle" | "saving" | "saved" | "error";
  saveError: string | null;
  localPreviewActive: boolean;
  rightPanel: EditorRightPanel;
  commentDraftAnchor: CommentAnchor | null;
  selectedThreadId: string | null;
  followingUserId: string | null;
  showRulers: boolean;
  measureMode: boolean;
  presentationMode: boolean;
  presentationFrameId: string | null;
  currentPageId: string | null;
  textSelection: { shapeId: string; start: number; end: number } | null;
}

const initialState: EditorState = {
  viewport: { x: 0, y: 0, zoom: 1 },
  history: null,
  clipboard: [],
  clipboardBoardId: null,
  clipboardSourceBounds: null,
  clipboardParentBounds: null,
  hoveredShapeId: null,
  editingShapeId: null,
  snapToGrid: false,
  gridSize: 8,
  saveStatus: "idle",
  saveError: null,
  localPreviewActive: false,
  rightPanel: "properties",
  commentDraftAnchor: null,
  selectedThreadId: null,
  followingUserId: null,
  showRulers: true,
  measureMode: false,
  presentationMode: false,
  presentationFrameId: null,
  currentPageId: null,
  textSelection: null,
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
      state.rightPanel = "properties";
      state.commentDraftAnchor = null;
      state.selectedThreadId = null;
      state.followingUserId = null;
      state.measureMode = false;
      state.presentationMode = false;
      state.presentationFrameId = null;
      state.textSelection = null;
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
      action: PayloadAction<{
        shapes: Shape[];
        boardId: string | null;
        sourceBounds?: Bounds | null;
        parentBounds?: Bounds | null;
      }>
    ) => {
      state.clipboard = JSON.parse(JSON.stringify(action.payload.shapes));
      state.clipboardBoardId = action.payload.boardId;
      state.clipboardSourceBounds = action.payload.sourceBounds ?? null;
      state.clipboardParentBounds = action.payload.parentBounds ?? null;
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
    setRightPanel: (state, action: PayloadAction<EditorRightPanel>) => {
      state.rightPanel = action.payload;
      if (action.payload !== "comments") state.commentDraftAnchor = null;
    },
    setCommentDraftAnchor: (state, action: PayloadAction<CommentAnchor | null>) => {
      state.commentDraftAnchor = action.payload;
      if (action.payload) state.rightPanel = "comments";
    },
    setSelectedThreadId: (state, action: PayloadAction<string | null>) => {
      state.selectedThreadId = action.payload;
      if (action.payload) state.rightPanel = "comments";
    },
    setFollowingUserId: (state, action: PayloadAction<string | null>) => {
      state.followingUserId = action.payload;
    },
    setShowRulers: (state, action: PayloadAction<boolean>) => {
      state.showRulers = action.payload;
    },
    setMeasureMode: (state, action: PayloadAction<boolean>) => {
      state.measureMode = action.payload;
    },
    setPresentationMode: (state, action: PayloadAction<boolean>) => {
      state.presentationMode = action.payload;
    },
    setPresentationFrameId: (state, action: PayloadAction<string | null>) => {
      state.presentationFrameId = action.payload;
    },
    setCurrentPageId: (state, action: PayloadAction<string | null>) => {
      state.currentPageId = action.payload;
      state.editingShapeId = null;
      state.hoveredShapeId = null;
    },
    setTextSelection: (state, action: PayloadAction<EditorState["textSelection"]>) => {
      state.textSelection = action.payload;
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
  setRightPanel,
  setCommentDraftAnchor,
  setSelectedThreadId,
  setFollowingUserId,
  setShowRulers,
  setMeasureMode,
  setPresentationMode,
  setPresentationFrameId,
  setCurrentPageId,
  setTextSelection,
} = editorSlice.actions;

export default editorSlice.reducer;
