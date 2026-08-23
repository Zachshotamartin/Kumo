// index.tsx
import React from "react";
import ReactDOM from "react-dom/client";
import { Provider } from "react-redux";
import store from "./store";
import "./index.css";
import App from "./App";
import ErrorBoundary from "./components/ErrorBoundary";
import { LiveblocksRoot } from "./collaboration/LiveblocksRoot";
import "./liveblocks.config";

const root = ReactDOM.createRoot(
  document.getElementById("root") as HTMLElement
);
root.render(
  <React.StrictMode>
    <ErrorBoundary>
      <Provider store={store}>
        <LiveblocksRoot>
          <App />
        </LiveblocksRoot>
      </Provider>
    </ErrorBoundary>
  </React.StrictMode>
);
