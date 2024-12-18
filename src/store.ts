// store.ts
import { configureStore } from "@reduxjs/toolkit";
import authSlice from "./features/auth/authSlice";
import sideBarSlice from "./features/sideBar/sideBarSlice";
import whiteBoardSlice from "./features/whiteBoard/whiteBoardSlice";

const store = configureStore({
  reducer: {
    auth: authSlice,
    sideBar: sideBarSlice,
    whiteBoard: whiteBoardSlice,
  },
});

export default store;
