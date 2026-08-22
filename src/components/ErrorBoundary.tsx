import { Component, ErrorInfo, ReactNode } from "react";

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
        <span className="app-loading-mark" aria-hidden="true">K</span>
        <p>Something interrupted this workspace.</p>
        <button type="button" onClick={() => window.location.reload()}>Reload Kumo</button>
      </main>
    );
  }
}

export default ErrorBoundary;
