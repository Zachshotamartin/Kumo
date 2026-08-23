import React from "react";
import ReactDOM from "react-dom/client";
import { Provider } from "react-redux";
import ErrorBoundary from "../components/ErrorBoundary";
import store from "../store";
import "../index.css";
import EditorHarness from "./EditorHarness";

const root = ReactDOM.createRoot(document.getElementById("root") as HTMLElement);

root.render(
  <React.StrictMode>
    <ErrorBoundary>
      {import.meta.env.DEV && import.meta.env.VITE_E2E === "true" ? (
        <Provider store={store}><EditorHarness /></Provider>
      ) : (
        <div role="alert">The editor regression lab is available only to the Playwright development server.</div>
      )}
    </ErrorBoundary>
  </React.StrictMode>
);
