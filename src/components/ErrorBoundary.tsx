import { Component, ErrorInfo, ReactNode } from "react";
import KumoLogo from "./brand/KumoLogo";

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  failed: boolean;
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { failed: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Kumo encountered an unrecoverable render error.", error, info);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <main className="fatal-error">
        <KumoLogo className="app-loading-logo" context="error" decorative />
        <p>Something interrupted this workspace.</p>
        <button type="button" onClick={() => window.location.reload()}>Reload Kumo</button>
      </main>
    );
  }
}

export default ErrorBoundary;
