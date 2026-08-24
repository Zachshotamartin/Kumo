import React from "react";
import ReactDOM from "react-dom/client";
import { configureStore } from "@reduxjs/toolkit";
import { Provider } from "react-redux";
import "../index.css";
import "../App.css";
import ShareDialog from "../components/editor/ShareDialog";
import actionsReducer from "../features/actions/actionsSlice";
import authReducer, { login, setAuthenticatedProfile } from "../features/auth/authSlice";
import editorReducer from "../features/editor/editorSlice";
import selectedReducer from "../features/selected/selectedSlice";
import whiteBoardReducer, { setWhiteboardData } from "../features/whiteBoard/whiteBoardSlice";

const store = configureStore({
  reducer: {
    auth: authReducer,
    whiteBoard: whiteBoardReducer,
    actions: actionsReducer,
    selected: selectedReducer,
    editor: editorReducer,
  },
});

store.dispatch(login({ uid: "e2e-user", email: "avery@example.com" }));
store.dispatch(setAuthenticatedProfile({ displayName: "Avery Morgan", username: "avery", avatarUrl: null }));
store.dispatch(setWhiteboardData({
  id: "board",
  roomId: "board:board",
  title: "Product map",
  uid: "e2e-user",
  role: "owner",
  sharedWith: [],
  members: { "e2e-user": "owner" },
}));

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Provider store={store}>
      <ShareDialog onClose={() => undefined} />
    </Provider>
  </React.StrictMode>
);
