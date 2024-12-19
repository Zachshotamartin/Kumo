// store.ts
import { configureStore } from "@reduxjs/toolkit";
import authSlice from "./features/auth/authSlice";
import whiteBoardSlice from "./features/whiteBoard/whiteBoardSlice";
import windowSlice from "./features/window/windowSlice";

const store = configureStore({
  reducer: {
    auth: authSlice,
    whiteBoard: whiteBoardSlice,
    window: windowSlice,
  },
});

export type RootState = ReturnType<typeof store.getState>;
export default store;
