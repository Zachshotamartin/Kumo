// store.ts
import { configureStore } from "@reduxjs/toolkit";
import authSlice from "./features/auth/authSlice";
import whiteBoardSlice from "./features/whiteBoard/whiteBoardSlice";
import windowSlice from "./features/window/windowSlice";
import sideBarSlice from "./features/hide/hide";
import boardsSlice from "./features/boards/boards";
import actionsSlice from "./features/actions/actionsSlice";

const store = configureStore({
  reducer: {
    auth: authSlice,
    whiteBoard: whiteBoardSlice,
    window: windowSlice,
    sideBar: sideBarSlice,
    boards: boardsSlice,
    actions: actionsSlice,
  },
});

export type RootState = ReturnType<typeof store.getState>;

export type AppDispatch = typeof store.dispatch;
export default store;
