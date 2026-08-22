// store.ts
import { configureStore } from "@reduxjs/toolkit";
import authSlice from "./features/auth/authSlice";
import whiteBoardSlice from "./features/whiteBoard/whiteBoardSlice";
import actionsSlice from "./features/actions/actionsSlice";
import selectedSlice from "./features/selected/selectedSlice";
import editorSlice from "./features/editor/editorSlice";

const store = configureStore({
  reducer: {
    auth: authSlice,
    whiteBoard: whiteBoardSlice,
    actions: actionsSlice,
    selected: selectedSlice,
    editor: editorSlice,
  },
});

export type RootState = ReturnType<typeof store.getState>;

export type AppDispatch = typeof store.dispatch;
export default store;
