// authSlice.ts
import { createSlice, PayloadAction } from "@reduxjs/toolkit";

interface ActionsState {
  drawing: boolean;
  dragging: boolean;
  doubleClicking: boolean;
  highlighting: boolean;
  moving: boolean;
  pasting: boolean;
}

const initialState: ActionsState = {
  drawing: false,
  dragging: false,
  doubleClicking: false,
  highlighting: false,
  moving: false,
  pasting: false,
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
    setMoving: (state, action: PayloadAction<boolean>) => {
      if (!action.payload) {
        state.moving = false;
      }
      if (action.payload) {
        state.moving = true;
      }
    },
    setHighlighting: (state, action: PayloadAction<boolean>) => {
      if (!action.payload) {
        state.highlighting = false;
      }
      if (action.payload) {
        state.highlighting = true;
      }
    },
    setPasting: (state, action: PayloadAction<boolean>) => {
      if (!action.payload) {
        state.pasting = false;
      }
      if (action.payload) {
        state.pasting = true;
      }
    },
  },
});

export const {
  setDrawing,
  setDragging,
  setDoubleClicking,
  setMoving,
  setHighlighting,
  setPasting,
} = actionsSlice.actions;

export default actionsSlice.reducer;
