// authSlice.ts
import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import { Shape } from "../whiteBoard/whiteBoardSlice";

interface SelectedState {
  selectedShapes: Shape[];
  selectedTool: string;
}

const initialState: SelectedState = {
  selectedShapes: [],
  selectedTool: "pointer",
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
  },
});

export const { setSelectedShapes, setSelectedTool, addSelectedShape } =
  selectedSlice.actions;

export default selectedSlice.reducer;
