import React from "react";
import {
  useAppState,
  useWhiteboard,
  useInteractions,
  useViewport,
  useShapeSelection,
  usePerformance,
  useStateDebug,
} from "../../state/hooks/useAppState";

/**
 * Example component demonstrating the new simplified state management
 *
 * Shows how to:
 * - Use state machine hooks instead of boolean flags
 * - Handle interactions with proper state transitions
 * - Access computed state
 * - Maintain backward compatibility
 */
const SimplifiedStateExample: React.FC = () => {
  // ===================
  // NEW SIMPLIFIED HOOKS
  // ===================

  // Main application state with state machine
  const {
    mode,
    tool,
    selectedShapes,
    hasSelection,
    isDrawing,
    isDragging,
    isResizing,
    canUndo,
    canRedo,
    computed,
    actions,
  } = useAppState();

  // Whiteboard data management
  const {
    shapes,
    title,
    settings,
    actions: whiteboardActions,
  } = useWhiteboard();

  // Interaction handling
  const { handleMouseDown, handleMouseMove, handleMouseUp, handleKeyDown } =
    useInteractions();

  // Viewport controls
  const { viewport, actions: viewportActions } = useViewport();

  // Shape selection management
  const {
    selectedShapeObjects,
    selectionBounds,
    isMultiSelection,
    actions: selectionActions,
  } = useShapeSelection();

  // Performance monitoring
  const { fps, memoryUsage, shapesVisible, shapesTotal, warnings } =
    usePerformance();

  // Debug information (development only)
  const debugInfo = useStateDebug();

  // ===================
  // EVENT HANDLERS
  // ===================

  const handleToolChange = (newTool: string) => {
    actions.selectTool(newTool as any);
  };

  const handleCanvasClick = (event: React.MouseEvent) => {
    handleMouseDown(event);
  };

  const handleShapeClick = (shapeId: string, event: React.MouseEvent) => {
    event.stopPropagation();
    const addToSelection = event.shiftKey;
    selectionActions.selectShape(shapeId, addToSelection);
  };

  const handleUndo = () => {
    if (canUndo) {
      whiteboardActions.undo();
    }
  };

  const handleRedo = () => {
    if (canRedo) {
      whiteboardActions.redo();
    }
  };

  const handleZoomIn = () => {
    viewportActions.zoomIn();
  };

  const handleZoomOut = () => {
    viewportActions.zoomOut();
  };

  const handleDeleteSelected = () => {
    if (hasSelection) {
      whiteboardActions.deleteShapes(selectedShapes);
      selectionActions.clearSelection();
    }
  };

  // ===================
  // RENDER UI
  // ===================

  return (
    <div style={{ padding: "20px", fontFamily: "Arial, sans-serif" }}>
      <h2>Simplified State Management Example</h2>

      {/* State Information */}
      <div
        style={{
          marginBottom: "20px",
          padding: "10px",
          background: "#f5f5f5",
          borderRadius: "5px",
        }}
      >
        <h3>Current State</h3>
        <p>
          <strong>Mode:</strong> {mode}
        </p>
        <p>
          <strong>Tool:</strong> {tool}
        </p>
        <p>
          <strong>Selected Shapes:</strong> {selectedShapes.length}
        </p>
        <p>
          <strong>Total Shapes:</strong> {shapes.length}
        </p>
        <p>
          <strong>FPS:</strong> {fps}
        </p>

        {/* State Machine Status */}
        <div style={{ marginTop: "10px" }}>
          <strong>State Machine Status:</strong>
          <ul>
            <li>Drawing: {isDrawing ? "✅" : "❌"}</li>
            <li>Dragging: {isDragging ? "✅" : "❌"}</li>
            <li>Resizing: {isResizing ? "✅" : "❌"}</li>
            <li>Has Selection: {hasSelection ? "✅" : "❌"}</li>
            <li>Can Undo: {canUndo ? "✅" : "❌"}</li>
            <li>Can Redo: {canRedo ? "✅" : "❌"}</li>
          </ul>
        </div>
      </div>

      {/* Tool Selection */}
      <div style={{ marginBottom: "20px" }}>
        <h3>Tools</h3>
        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
          {["pointer", "rectangle", "ellipse", "text", "hand"].map(
            (toolName) => (
              <button
                key={toolName}
                onClick={() => handleToolChange(toolName)}
                style={{
                  padding: "8px 16px",
                  backgroundColor: tool === toolName ? "#007bff" : "#f8f9fa",
                  color: tool === toolName ? "white" : "black",
                  border: "1px solid #ccc",
                  borderRadius: "4px",
                  cursor: "pointer",
                }}
              >
                {toolName.charAt(0).toUpperCase() + toolName.slice(1)}
              </button>
            )
          )}
        </div>
      </div>

      {/* Action Buttons */}
      <div style={{ marginBottom: "20px" }}>
        <h3>Actions</h3>
        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
          <button
            onClick={handleUndo}
            disabled={!canUndo}
            style={{
              padding: "8px 16px",
              backgroundColor: canUndo ? "#28a745" : "#6c757d",
              color: "white",
              border: "none",
              borderRadius: "4px",
              cursor: canUndo ? "pointer" : "not-allowed",
            }}
          >
            Undo
          </button>

          <button
            onClick={handleRedo}
            disabled={!canRedo}
            style={{
              padding: "8px 16px",
              backgroundColor: canRedo ? "#28a745" : "#6c757d",
              color: "white",
              border: "none",
              borderRadius: "4px",
              cursor: canRedo ? "pointer" : "not-allowed",
            }}
          >
            Redo
          </button>

          <button
            onClick={handleDeleteSelected}
            disabled={!hasSelection}
            style={{
              padding: "8px 16px",
              backgroundColor: hasSelection ? "#dc3545" : "#6c757d",
              color: "white",
              border: "none",
              borderRadius: "4px",
              cursor: hasSelection ? "pointer" : "not-allowed",
            }}
          >
            Delete Selected
          </button>

          <button onClick={() => selectionActions.selectAll()}>
            Select All
          </button>

          <button onClick={() => selectionActions.clearSelection()}>
            Clear Selection
          </button>
        </div>
      </div>

      {/* Viewport Controls */}
      <div style={{ marginBottom: "20px" }}>
        <h3>Viewport Controls</h3>
        <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
          <button onClick={handleZoomIn}>Zoom In</button>
          <button onClick={handleZoomOut}>Zoom Out</button>
          <button onClick={() => viewportActions.resetZoom()}>
            Reset Zoom
          </button>
          <span>Zoom: {Math.round(viewport.scale * 100)}%</span>
        </div>
      </div>

      {/* Performance Metrics */}
      <div style={{ marginBottom: "20px" }}>
        <h3>Performance Metrics</h3>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
            gap: "10px",
          }}
        >
          <div
            style={{
              padding: "10px",
              background:
                fps > 50 ? "#d4edda" : fps > 30 ? "#fff3cd" : "#f8d7da",
              borderRadius: "4px",
            }}
          >
            <strong>FPS:</strong> {fps.toFixed(1)}
          </div>
          <div
            style={{
              padding: "10px",
              background: "#e2e3e5",
              borderRadius: "4px",
            }}
          >
            <strong>Memory:</strong> {memoryUsage.toFixed(1)} MB
          </div>
          <div
            style={{
              padding: "10px",
              background: "#e2e3e5",
              borderRadius: "4px",
            }}
          >
            <strong>Visible:</strong> {shapesVisible}/{shapesTotal}
          </div>
        </div>

        {warnings.length > 0 && (
          <div
            style={{
              marginTop: "10px",
              padding: "10px",
              background: "#f8d7da",
              borderRadius: "4px",
            }}
          >
            <strong>Performance Warnings:</strong>
            <ul>
              {warnings.map((warning, index) => (
                <li key={index}>{warning}</li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Selection Information */}
      {hasSelection && (
        <div style={{ marginBottom: "20px" }}>
          <h3>Selection Information</h3>
          <div
            style={{
              padding: "10px",
              background: "#e7f3ff",
              borderRadius: "4px",
            }}
          >
            <p>
              <strong>Selected Objects:</strong> {selectedShapes.length}
            </p>
            <p>
              <strong>Multi-selection:</strong>{" "}
              {isMultiSelection ? "Yes" : "No"}
            </p>
            {selectionBounds &&
              typeof selectionBounds === "object" &&
              "width" in selectionBounds &&
              "height" in selectionBounds && (
                <p>
                  <strong>Bounds:</strong>{" "}
                  {Math.round((selectionBounds as any).width)} ×{" "}
                  {Math.round((selectionBounds as any).height)}
                </p>
              )}
            <div>
              <strong>Selected Shape IDs:</strong>
              <ul>
                {selectedShapeObjects.map((shape) => (
                  <li key={shape.id}>
                    {shape.id} ({shape.type})
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* Canvas Simulation */}
      <div style={{ marginBottom: "20px" }}>
        <h3>Canvas Simulation</h3>
        <div
          style={{
            width: "400px",
            height: "300px",
            border: "2px solid #ccc",
            borderRadius: "4px",
            position: "relative",
            backgroundColor: "#fafafa",
            cursor:
              tool === "hand"
                ? "grab"
                : tool === "pointer"
                ? "default"
                : "crosshair",
          }}
          onMouseDown={handleCanvasClick}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onKeyDown={handleKeyDown}
          tabIndex={0}
        >
          <div
            style={{
              position: "absolute",
              top: "10px",
              left: "10px",
              fontSize: "12px",
              color: "#666",
            }}
          >
            Mode: {mode} | Tool: {tool}
          </div>

          {/* Render simplified shapes */}
          {shapes.slice(0, 5).map((shape, index) => (
            <div
              key={shape.id || index}
              style={{
                position: "absolute",
                left: `${20 + index * 60}px`,
                top: `${50 + index * 30}px`,
                width: "40px",
                height: "30px",
                backgroundColor: selectedShapes.includes(shape.id)
                  ? "#007bff"
                  : "#e9ecef",
                border: selectedShapes.includes(shape.id)
                  ? "2px solid #0056b3"
                  : "1px solid #adb5bd",
                borderRadius: shape.type === "ellipse" ? "50%" : "4px",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "10px",
              }}
              onClick={(e) => handleShapeClick(shape.id, e)}
            >
              {shape.type || "Shape"}
            </div>
          ))}
        </div>
      </div>

      {/* Development Debug Info */}
      {process.env.NODE_ENV === "development" && (
        <div style={{ marginBottom: "20px" }}>
          <h3>Debug Information</h3>
          <pre
            style={{
              padding: "10px",
              background: "#f8f9fa",
              borderRadius: "4px",
              fontSize: "12px",
              overflow: "auto",
            }}
          >
            {JSON.stringify(debugInfo, null, 2)}
          </pre>
        </div>
      )}

      {/* Migration Note */}
      <div
        style={{
          padding: "15px",
          background: "#d1ecf1",
          border: "1px solid #bee5eb",
          borderRadius: "4px",
        }}
      >
        <h3>Migration Benefits</h3>
        <ul>
          <li>✅ Replaced 25+ boolean flags with clean state machine</li>
          <li>✅ Type-safe state transitions and validation</li>
          <li>✅ Computed state automatically derived</li>
          <li>✅ Performance optimizations built-in</li>
          <li>✅ Debugging and logging capabilities</li>
          <li>✅ Backward compatibility maintained</li>
        </ul>
      </div>
    </div>
  );
};

export default SimplifiedStateExample;
