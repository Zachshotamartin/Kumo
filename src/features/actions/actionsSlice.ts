import { createSlice, PayloadAction } from "@reduxjs/toolkit";

interface CanvasPreferencesState {
  grid: boolean;
}

const initialState: CanvasPreferencesState = {
  grid: true,
};

const actionsSlice = createSlice({
  name: "canvasPreferences",
  initialState,
  reducers: {
    setGrid: (state, action: PayloadAction<boolean>) => {
      state.grid = action.payload;
    },
  },
});

export const { setGrid } = actionsSlice.actions;
export default actionsSlice.reducer;
