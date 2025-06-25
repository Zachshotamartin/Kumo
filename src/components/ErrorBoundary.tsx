import React, { Component, ErrorInfo, ReactNode } from "react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
  resetKeys?: Array<string | number>;
  resetOnPropsChange?: boolean;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

/**
 * Error boundary component that catches and handles rendering errors
 * Provides fallback UI and error reporting capabilities
 */
export class ErrorBoundary extends Component<Props, State> {
  private resetTimeoutId: number | null = null;

  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      error,
      errorInfo: null,
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    this.setState({
      error,
      errorInfo,
    });

    // Call custom error handler if provided
    this.props.onError?.(error, errorInfo);

    // Log error to console in development
    if (process.env.NODE_ENV === "development") {
      console.error("ErrorBoundary caught an error:", error, errorInfo);
    }

    // TODO: In production, send to error reporting service
    // reportError(error, errorInfo);
  }

  componentDidUpdate(prevProps: Props) {
    const { resetKeys, resetOnPropsChange } = this.props;
    const { hasError } = this.state;

    if (hasError && prevProps.resetKeys !== resetKeys) {
      if (
        resetKeys?.some((key, index) => key !== prevProps.resetKeys?.[index])
      ) {
        this.resetErrorBoundary();
      }
    }

    if (
      hasError &&
      resetOnPropsChange &&
      prevProps.children !== this.props.children
    ) {
      this.resetErrorBoundary();
    }
  }

  resetErrorBoundary = () => {
    if (this.resetTimeoutId) {
      clearTimeout(this.resetTimeoutId);
    }

    this.resetTimeoutId = window.setTimeout(() => {
      this.setState({
        hasError: false,
        error: null,
        errorInfo: null,
      });
    }, 100);
  };

  render() {
    if (this.state.hasError) {
      // Custom fallback UI
      if (this.props.fallback) {
        return this.props.fallback;
      }

      // Default fallback UI
      return (
        <div
          style={{
            padding: "20px",
            border: "2px solid #ff6b6b",
            borderRadius: "8px",
            backgroundColor: "#fff5f5",
            color: "#c92a2a",
            maxWidth: "500px",
            margin: "20px auto",
          }}
        >
          <h2 style={{ margin: "0 0 10px 0", fontSize: "18px" }}>
            🚨 Something went wrong
          </h2>
          <p style={{ margin: "0 0 15px 0" }}>
            An error occurred while rendering this component. This might be due
            to:
          </p>
          <ul style={{ margin: "0 0 15px 20px", padding: 0 }}>
            <li>Invalid shape data</li>
            <li>Network connectivity issues</li>
            <li>Corrupted board state</li>
          </ul>

          <button
            onClick={this.resetErrorBoundary}
            style={{
              padding: "8px 16px",
              backgroundColor: "#c92a2a",
              color: "white",
              border: "none",
              borderRadius: "4px",
              cursor: "pointer",
              marginRight: "10px",
            }}
          >
            Try Again
          </button>

          <button
            onClick={() => window.location.reload()}
            style={{
              padding: "8px 16px",
              backgroundColor: "#868e96",
              color: "white",
              border: "none",
              borderRadius: "4px",
              cursor: "pointer",
            }}
          >
            Reload Page
          </button>

          {process.env.NODE_ENV === "development" && this.state.error && (
            <details style={{ marginTop: "15px" }}>
              <summary style={{ cursor: "pointer", fontWeight: "bold" }}>
                Technical Details (Development)
              </summary>
              <pre
                style={{
                  backgroundColor: "#f8f9fa",
                  padding: "10px",
                  borderRadius: "4px",
                  overflow: "auto",
                  fontSize: "12px",
                  marginTop: "10px",
                }}
              >
                {this.state.error.toString()}
                {this.state.errorInfo?.componentStack}
              </pre>
            </details>
          )}
        </div>
      );
    }

    return this.props.children;
  }
}

/**
 * Higher-order component for easy error boundary wrapping
 */
export function withErrorBoundary<P extends object>(
  Component: React.ComponentType<P>,
  errorBoundaryConfig?: Omit<Props, "children">
) {
  const WrappedComponent = (props: P) => (
    <ErrorBoundary {...errorBoundaryConfig}>
      <Component {...props} />
    </ErrorBoundary>
  );

  WrappedComponent.displayName = `withErrorBoundary(${
    Component.displayName || Component.name
  })`;
  return WrappedComponent;
}

/**
 * Specialized error boundary for shape rendering
 */
export const ShapeErrorBoundary: React.FC<{
  children: ReactNode;
  shapeId?: string;
}> = ({ children, shapeId }) => (
  <ErrorBoundary
    fallback={
      <div
        style={{
          padding: "10px",
          border: "1px dashed #ff6b6b",
          borderRadius: "4px",
          backgroundColor: "#fff5f5",
          color: "#c92a2a",
          fontSize: "12px",
          textAlign: "center",
        }}
      >
        ⚠️ Shape {shapeId ? `(${shapeId.slice(0, 8)}...)` : ""} failed to render
      </div>
    }
    onError={(error, _errorInfo) => {
      console.warn(
        `Shape rendering error${shapeId ? ` for shape ${shapeId}` : ""}:`,
        error
      );
    }}
    resetKeys={shapeId ? [shapeId] : []}
  >
    {children}
  </ErrorBoundary>
);
