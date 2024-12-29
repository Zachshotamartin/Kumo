// authSlice.ts
import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import { Shape } from "../whiteBoard/whiteBoardSlice";

interface SelectedState {
  selectedShapes: Shape[];
  selectedTool: string;
  highlightStart: number[];
  highlightEnd: number[];
  borderStart: number[];
  borderEnd: number[];
}

const initialState: SelectedState = {
  selectedShapes: [],
  selectedTool: "pointer",
  highlightStart: [0, 0],
  highlightEnd: [0, 0],
  borderStart: [0, 0],
  borderEnd: [0, 0],
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
      state.borderStart = [0, 0];
      state.borderEnd = [0, 0];
    },
    setHighlightStart: (state, action: PayloadAction<number[]>) => {
      state.highlightStart = action.payload;
    },
    setHighlightEnd: (state, action: PayloadAction<number[]>) => {
      state.highlightEnd = action.payload;
    },
    setBorderStart: (state, action: PayloadAction<number[]>) => {
      state.borderStart = action.payload;
    },
    setBorderEnd: (state, action: PayloadAction<number[]>) => {
      state.borderEnd = action.payload;
    },
  },
});

export const { setSelectedShapes, setSelectedTool, addSelectedShape, clearSelectedShapes, setHighlightStart, setHighlightEnd, setBorderStart, setBorderEnd } =
  selectedSlice.actions;

export default selectedSlice.reducer;
