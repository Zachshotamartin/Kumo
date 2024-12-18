// sideBarSlice.ts
import { createSlice, PayloadAction } from '@reduxjs/toolkit';

interface SideBarState {
  width: number;
  dragging: boolean;
  cursor: string;
}

const initialState: SideBarState = {
  width: 15,
  dragging: false,
  cursor: "auto",
};

const sideBarSlice = createSlice({
  name: 'sidebar',
  initialState,
  reducers: {
    setWidth: (state, action: PayloadAction<number>) => {
      state.width = action.payload;
    },
    setDragging: (state, action: PayloadAction<boolean>) => {
      state.dragging = action.payload;
    },
    setCursor: (state, action: PayloadAction<string>) => {
      state.cursor = action.payload;
    },
  },
});

export const { setWidth, setDragging, setCursor } = sideBarSlice.actions;

export default sideBarSlice.reducer;