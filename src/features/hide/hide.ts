import { createSlice, PayloadAction } from "@reduxjs/toolkit";

interface hideSideBar {
  hideSideBar: boolean;
  hideOptions: boolean;
}

const initialState: hideSideBar = {
  hideSideBar: false,
  hideOptions: true,
};

const sideBarSlice = createSlice({
  name: "sideBar",
  initialState,
  reducers: {
    setHideSideBar: (state, action: PayloadAction<boolean>) => {
      state.hideSideBar = action.payload;
    },
    setHideOptions: (state, action: PayloadAction<boolean>) => {
      state.hideOptions = action.payload;
    },
  },
});

export const { setHideSideBar, setHideOptions } = sideBarSlice.actions;

export default sideBarSlice.reducer;
