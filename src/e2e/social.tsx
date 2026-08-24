import React from "react";
import ReactDOM from "react-dom/client";
import { configureStore } from "@reduxjs/toolkit";
import { Provider } from "react-redux";
import "../index.css";
import "../App.css";
import BoardDashboard from "../components/dashboard/BoardDashboard";
import actionsReducer from "../features/actions/actionsSlice";
import authReducer, { login, setAuthenticatedProfile } from "../features/auth/authSlice";
import editorReducer from "../features/editor/editorSlice";
import selectedReducer from "../features/selected/selectedSlice";
import whiteBoardReducer from "../features/whiteBoard/whiteBoardSlice";

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

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Provider store={store}>
      <BoardDashboard />
    </Provider>
  </React.StrictMode>
);
