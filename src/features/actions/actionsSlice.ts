// authSlice.ts
import { createSlice, PayloadAction } from "@reduxjs/toolkit";

interface ActionsState {
  drawing: boolean;
  dragging: boolean;
  doubleClicking: boolean;
}

const initialState: ActionsState = {
  drawing: false,
  dragging: false,
  doubleClicking: false,
};

const actionsSlice = createSlice({
  name: "auth",
  initialState,
  reducers: {
    setDrawing: (state, action: PayloadAction<boolean>) => {
      if (!action.payload) {
        state.drawing = false;
      }
      if (action.payload) {
        state.drawing = true;
      }
    },
    setDragging: (state, action: PayloadAction<boolean>) => {
      if (!action.payload) {
        state.dragging = false;
      }
      if (action.payload) {
        state.dragging = true;
      }
    },
    setDoubleClicking: (state, action: PayloadAction<boolean>) => {
      if (!action.payload) {
        state.doubleClicking = false;
      }
      if (action.payload) {
        state.doubleClicking = true;
      }
    },
  },
});

export const { setDrawing, setDragging, setDoubleClicking } = actionsSlice.actions;

export default actionsSlice.reducer;
