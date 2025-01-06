// authSlice.ts
import { createSlice, PayloadAction } from "@reduxjs/toolkit";

interface ActionsState {
  drawing: boolean;
  dragging: boolean;
  doubleClicking: boolean;
  highlighting: boolean;
  moving: boolean;
  pasting: boolean;
  sharing: boolean;
  deleting: boolean;
  grid: boolean;
  settingsOpen: boolean;
  userOpen: boolean;
  resizing: boolean;
  resizingLeft: boolean;
  resizingRight: boolean;
  resizingTop: boolean;
  resizingBottom: boolean;
  hoverEdge: boolean;
  inWhiteBoard: boolean;
  searchTerm: string;
  mouseDown: boolean;
}

const initialState: ActionsState = {
  drawing: false,
  dragging: false,
  doubleClicking: false,
  highlighting: false,
  moving: false,
  pasting: false,
  sharing: false,
  deleting: false,
  grid: true,
  settingsOpen: false,
  userOpen: false,
  resizing: false,
  resizingLeft: false,
  resizingRight: false,
  resizingTop: false,
  resizingBottom: false,
  hoverEdge: false,
  inWhiteBoard: false,
  searchTerm: "",
  mouseDown: false,
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
    setSharing: (state, action: PayloadAction<boolean>) => {
      if (!action.payload) {
        state.sharing = false;
      }
      if (action.payload) {
        state.sharing = true;
      }
    },
    setDeleting: (state, action: PayloadAction<boolean>) => {
      if (!action.payload) {
        state.deleting = false;
      }
      if (action.payload) {
        state.deleting = true;
      }
    },
    setGrid: (state, action: PayloadAction<boolean>) => {
      if (!action.payload) {
        state.grid = false;
      }
      if (action.payload) {
        state.grid = true;
      }
    },
    setSettingsOpen: (state, action: PayloadAction<boolean>) => {
      if (!action.payload) {
        state.settingsOpen = false;
      }
      if (action.payload) {
        state.settingsOpen = true;
      }
    },
    setUserOpen: (state, action: PayloadAction<boolean>) => {
      if (!action.payload) {
        state.userOpen = false;
      }
      if (action.payload) {
        state.userOpen = true;
      }
    },
    setResizing: (state, action: PayloadAction<boolean>) => {
      if (!action.payload) {
        state.resizing = false;
      }
      if (action.payload) {
        state.resizing = true;
      }
    },
    setResizingLeft: (state, action: PayloadAction<boolean>) => {
      if (!action.payload) {
        state.resizingLeft = false;
      }
      if (action.payload) {
        state.resizingLeft = true;
      }
    },
    setResizingRight: (state, action: PayloadAction<boolean>) => {
      if (!action.payload) {
        state.resizingRight = false;
      }
      if (action.payload) {
        state.resizingRight = true;
      }
    },
    setResizingTop: (state, action: PayloadAction<boolean>) => {
      if (!action.payload) {
        state.resizingTop = false;
      }
      if (action.payload) {
        state.resizingTop = true;
      }
    },
    setResizingBottom: (state, action: PayloadAction<boolean>) => {
      if (!action.payload) {
        state.resizingBottom = false;
      }
      if (action.payload) {
        state.resizingBottom = true;
      }
    },
    setHoverEdge: (state, action: PayloadAction<boolean>) => {
      if (!action.payload) {
        state.hoverEdge = false;
      }
      if (action.payload) {
        state.hoverEdge = true;
      }
    },
    setInWhiteBoard: (state, action: PayloadAction<boolean>) => {
      if (!action.payload) {
        state.inWhiteBoard = false;
      }
      if (action.payload) {
        state.inWhiteBoard = true;
      }
    },
    setSearchTerm: (state, action: PayloadAction<string>) => {
      state.searchTerm = action.payload;
    },
    setMouseDown: (state, action: PayloadAction<boolean>) => {
      if (!action.payload) {
        state.mouseDown = false;
      }
      if (action.payload) {
        state.mouseDown = true;
      }
    }
  },
});

export const {
  setDrawing,
  setDragging,
  setDoubleClicking,
  setMoving,
  setHighlighting,
  setPasting,
  setSharing,
  setDeleting,
  setGrid,
  setSettingsOpen,
  setUserOpen,
  setResizing,
  setResizingLeft,
  setResizingRight,
  setResizingTop,
  setResizingBottom,
  setHoverEdge,
  setInWhiteBoard,
  setSearchTerm,
  setMouseDown,
} = actionsSlice.actions;

export default actionsSlice.reducer;
