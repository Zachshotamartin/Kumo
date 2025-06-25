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
      state.history = [action.payload || []];
      state.currentIndex = 0;
    },
    updateHistory: (state, action: PayloadAction<Shape[]>) => {
      // Validate payload - empty arrays are valid (cleared canvas)
      if (!Array.isArray(action.payload)) {
        console.warn(
          "Invalid action payload for updateHistory - not an array."
        );
        return;
      }

      // Don't add duplicate entries
      const currentShapes = state.history[state.currentIndex] || [];
      if (JSON.stringify(currentShapes) === JSON.stringify(action.payload)) {
        return; // No change, skip adding to history
      }

      // Branch history if not at the end (user made changes after undo)
      if (state.currentIndex < state.history.length - 1) {
        state.history.splice(state.currentIndex + 1);
      }

      // Add the new state
      state.history.push([...action.payload]); // Deep copy to prevent mutations
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
