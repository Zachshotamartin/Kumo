// authSlice.ts
import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import { Shape } from "../whiteBoard/whiteBoardSlice";


interface SelectedState {
  selectedShapes: Shape[];
  selectedTool: string;
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
  selectedTool: "pointer",
  highlightStart: [0, 0],
  highlightEnd: [0, 0],
  borderStartX: 0,
  borderStartY: 0,
  borderEndX: 0,
  borderEndY: 0,
  hoverStartX: 0,
  hoverStartY: 0,
  hoverEndX: 0,
  hoverEndY: 0,
};

const selectedSlice = createSlice({
  name: "selected",
  initialState,
  reducers: {
    setSelectedShapes: (state, action: PayloadAction<any>) => {
      state.selectedShapes = action.payload;
    },
    setSelectedTool: (state, action: PayloadAction<string>) => {
      state.selectedTool = action.payload;
    },
    addSelectedShape: (state, action: PayloadAction<any>) => {
      state.selectedShapes.push(action.payload);
    },
    clearSelectedShapes: (state) => {
      state.selectedShapes = [];
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
  },
});

export const {
  setSelectedShapes,
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
} = selectedSlice.actions;

export default selectedSlice.reducer;
