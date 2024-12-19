import { createSlice, PayloadAction } from "@reduxjs/toolkit";

interface hideSideBar {
  hideSideBar: boolean;
}

const initialState: hideSideBar = {
  hideSideBar: false,
};

const sideBarSlice = createSlice({
  name: "sideBar",
  initialState,
  reducers: {
    setHideSideBar: (state, action: PayloadAction<boolean>) => {
      state.hideSideBar = action.payload;
    },
  },
});

export const { setHideSideBar } = sideBarSlice.actions;

export default sideBarSlice.reducer;
