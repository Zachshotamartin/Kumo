import { createSlice, PayloadAction } from "@reduxjs/toolkit";

import { Shape } from "../../classes/shape";

interface ShapeHistoryState {
  history: Shape[][];
  currentIndex: number;
}

const initialState: ShapeHistoryState = {
  history: [],
  currentIndex: 0,
};

const shapeHistorySlice = createSlice({
  name: "shapeHistory",
  initialState,
  reducers: {
    initializeHistory: (state, action: PayloadAction<Shape[]>) => {
      state.history = [action.payload];
      state.currentIndex = 0;
    },
    updateHistory: (state, action: PayloadAction<Shape[]>) => {
      // Ensure history and currentIndex are initialized
      // Validate payload
      if (!Array.isArray(action.payload) || action.payload.length === 0) {
        console.warn("Invalid action payload for updateHistory.");
        return;
      }

      // Branch history if not at the end
      if (state.currentIndex < state.history.length - 1) {
 
        state.history.splice(state.currentIndex + 1);
      }

      // Add the new payload
     
      state.history.push(action.payload);
      state.currentIndex++;

      // Enforce history limit (max 50 entries)
      if (state.history.length > 50) {
        
        state.history.shift(); // Remove the oldest entry
        state.currentIndex = Math.max(0, state.currentIndex - 1); // Adjust index
      }
    },
    undo: (state) => {
      // Move back in history if possible
      if (state.currentIndex > 0) {
        state.currentIndex--;
      }
    },
    redo: (state) => {
      // Move forward in history if possible
      if (state.currentIndex < state.history.length - 1) {
        state.currentIndex++;
      }
    },
    resetHistory: (state) => {
      // Resets the history
      state.history = [];
      state.currentIndex = 0;
    },
  },
});

export const { updateHistory, undo, redo, resetHistory, initializeHistory } =
  shapeHistorySlice.actions;
export default shapeHistorySlice.reducer;
