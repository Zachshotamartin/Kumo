// whiteBoardSlice.ts
import { createSlice, PayloadAction } from "@reduxjs/toolkit";

interface WindowState {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color?: string;
  width?: number;
  height?: number;
  percentZoomed?: number;
  initialWidth?: number;
  initialHeight?: number;
  sideBarWidth?: number;
}

const initialState: WindowState = {
  initialHeight: window.innerHeight,
  initialWidth: window.innerWidth,
  percentZoomed: 1,
  x1: 0,
  y1: 0,
  x2: window.innerWidth,
  y2: window.innerHeight,
  color: "black",
  height: window.innerHeight - 0,
  width: window.innerWidth - 0,
  sideBarWidth: 15,
};

const windowSlice = createSlice({
  name: "window",
  initialState,
  reducers: {
    setWindow: (state, action: PayloadAction<WindowState>) => {
      state.x1 = action.payload.x1;
      state.y1 = action.payload.y1;
      state.x2 = action.payload.x2;
      state.y2 = action.payload.y2;
      state.color = action.payload.color ?? initialState.color;
      state.width = Math.abs(action.payload.x2 - action.payload.x1);
      state.height = Math.abs(action.payload.y2 - action.payload.y1);
      state.percentZoomed =
        Math.abs(action.payload.x2 - action.payload.x1) / window.innerWidth;
      state.initialWidth =
        action.payload.initialWidth ?? initialState.initialWidth;
      state.initialHeight =
        action.payload.initialHeight ?? initialState.initialHeight;
    },
    setSideBarWidth: (state, action: PayloadAction<number>) => {
      state.sideBarWidth = action.payload;
    },
  },
});

export const { setWindow, setSideBarWidth } = windowSlice.actions;

export default windowSlice.reducer;

export type { WindowState };
