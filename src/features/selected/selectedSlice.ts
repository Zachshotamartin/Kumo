// authSlice.ts
import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import { EditorTool } from "../../editor/types";

interface SelectedState {
  selectedShapes: string[];
  /** Rotation retained while a multi-selection remains active. */
  selectionRotation: number;
  selectedTool: EditorTool;
  highlightStart: number[];
  highlightEnd: number[];
  borderStartX: number;
  borderStartY: number;
  borderEndX: number;
  borderEndY: number;
  hoverStartX: number;
  hoverStartY: number;
  hoverEndX: number;
  hoverEndY: number;
}

const initialState: SelectedState = {
  selectedShapes: [],
  selectionRotation: 0,
  selectedTool: "pointer",
  highlightStart: [-100000, -100000],
  highlightEnd: [-100000, -100000],
  borderStartX: -100000,
  borderStartY: -100000,
  borderEndX: -100000,
  borderEndY: -100000,
  hoverStartX: -100000,
  hoverStartY: -100000,
  hoverEndX: -100000,
  hoverEndY: -100000,
};

const selectedSlice = createSlice({
  name: "selected",
  initialState,
  reducers: {
    setSelectedShapes: (state, action: PayloadAction<string[]>) => {
      const next = [...new Set(action.payload)];
      if (
        next.length !== state.selectedShapes.length ||
        next.some((id) => !state.selectedShapes.includes(id))
      ) {
        state.selectionRotation = 0;
      }
      state.selectedShapes = next;
    },
    setSelectionRotation: (state, action: PayloadAction<number>) => {
      state.selectionRotation = action.payload;
    },
    setSelectedTool: (state, action: PayloadAction<EditorTool>) => {
      state.selectedTool = action.payload;
    },
    addSelectedShape: (state, action: PayloadAction<string>) => {
      if (!state.selectedShapes.includes(action.payload)) {
        state.selectedShapes.push(action.payload);
      }
    },
    clearSelectedShapes: (state) => {
      state.selectedShapes = [];
      state.selectionRotation = 0;
      state.borderStartX = -100000;
      state.borderStartY = -100000;
      state.borderEndX = -100000;
      state.borderEndY = -100000;
    },
    setHighlightStart: (state, action: PayloadAction<number[]>) => {
      state.highlightStart = action.payload;
    },
    setHighlightEnd: (state, action: PayloadAction<number[]>) => {
      state.highlightEnd = action.payload;
    },
    setBorderStartX: (state, action: PayloadAction<number>) => {
      state.borderStartX = action.payload;
    },
    setBorderStartY: (state, action: PayloadAction<number>) => {
      state.borderStartY = action.payload;
    },
    setBorderEndX: (state, action: PayloadAction<number>) => {
      state.borderEndX = action.payload;
    },
    setBorderEndY: (state, action: PayloadAction<number>) => {
      state.borderEndY = action.payload;
    },
    setHoverStartX: (state, action: PayloadAction<number>) => {
      state.hoverStartX = action.payload;
    },
    setHoverStartY: (state, action: PayloadAction<number>) => {
      state.hoverStartY = action.payload;
    },
    setHoverEndX: (state, action: PayloadAction<number>) => {
      state.hoverEndX = action.payload;
    },
    setHoverEndY: (state, action: PayloadAction<number>) => {
      state.hoverEndY = action.payload;
    },
    clearHover: (state) => {
      state.hoverStartX = -100000;
      state.hoverStartY = -100000;
      state.hoverEndX = -100000;
      state.hoverEndY = -100000;
    }
  },
});

export const {
  setSelectedShapes,
  setSelectionRotation,
  setSelectedTool,
  addSelectedShape,
  clearSelectedShapes,
  setHighlightStart,
  setHighlightEnd,
  setBorderStartX,
  setBorderEndX,
  setBorderStartY,
  setBorderEndY,
  setHoverStartX,
  setHoverStartY,
  setHoverEndX,
  setHoverEndY,
  clearHover,
} = selectedSlice.actions;

export default selectedSlice.reducer;
