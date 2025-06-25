import React, { useState } from "react";
import { useShapeManagement } from "../hooks/useShapeManagement";
import { Shape, ShapeType } from "../../domain/entities/Shape";
import { CreateShapeRequest } from "../../application/useCases/ShapeManagementUseCase";

/**
 * Clean Shape Manager Component
 *
 * Example of a properly separated React component:
 * - Pure UI logic only
 * - Business logic delegated to use case hook
 * - Easy to test and maintain
 * - Clear separation of concerns
 */

interface CleanShapeManagerProps {
  className?: string;
  onError?: (error: string) => void;
  onSuccess?: (message: string) => void;
}

export const CleanShapeManager: React.FC<CleanShapeManagerProps> = ({
  className = "",
  onError,
  onSuccess,
}) => {
  // ===================
  // BUSINESS LOGIC (via hook)
  // ===================

  const { state, actions } = useShapeManagement();
  const { shapes, loading, error, selectedShapes } = state;

  // ===================
  // UI STATE (presentation only)
  // ===================

  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newShapeType, setNewShapeType] = useState<ShapeType>("rectangle");
  const [dragMode, setDragMode] = useState(false);

  // ===================
  // UI EVENT HANDLERS
  // ===================

  const handleCreateShape = async () => {
    const createRequest: CreateShapeRequest = {
      type: newShapeType,
      bounds: {
        x1: Math.random() * 400,
        y1: Math.random() * 300,
        x2: Math.random() * 400 + 100,
        y2: Math.random() * 300 + 100,
        width: 100,
        height: 100,
      },
      style: {
        backgroundColor: "#3b82f6",
        borderColor: "#1e40af",
        borderWidth: 2,
      },
    };

    const success = await actions.createShape(createRequest);
    if (success) {
      onSuccess?.("Shape created successfully");
      setShowCreateForm(false);
    } else {
      onError?.(error || "Failed to create shape");
    }
  };

  const handleDeleteSelected = async () => {
    if (selectedShapes.size === 0) {
      onError?.("No shapes selected");
      return;
    }

    const success = await actions.deleteSelectedShapes();
    if (success) {
      onSuccess?.(`Deleted ${selectedShapes.size} shape(s)`);
    } else {
      onError?.(error || "Failed to delete shapes");
    }
  };

  const handleCreateComponent = async () => {
    if (selectedShapes.size < 2) {
      onError?.("Select at least 2 shapes to create a component");
      return;
    }

    const success = await actions.createComponent({
      shapeIds: Array.from(selectedShapes),
    });

    if (success) {
      onSuccess?.("Component created successfully");
    } else {
      onError?.(error || "Failed to create component");
    }
  };

  const handleShapeClick = (shape: Shape, event: React.MouseEvent) => {
    if (event.shiftKey) {
      actions.toggleShapeSelection(shape.id);
    } else {
      actions.selectShape(shape.id);
    }
  };

  const handleDragShapes = async (deltaX: number, deltaY: number) => {
    if (selectedShapes.size === 0) return;

    const success = await actions.moveSelectedShapes(deltaX, deltaY);
    if (!success) {
      onError?.(error || "Failed to move shapes");
    }
  };

  // ===================
  // RENDER HELPERS
  // ===================

  const renderShapeTypeSelector = () => (
    <select
      value={newShapeType}
      onChange={(e) => setNewShapeType(e.target.value as ShapeType)}
      className="px-3 py-2 border border-gray-300 rounded-md"
    >
      <option value="rectangle">Rectangle</option>
      <option value="ellipse">Ellipse</option>
      <option value="text">Text</option>
      <option value="image">Image</option>
      <option value="calendar">Calendar</option>
    </select>
  );

  const renderCreateForm = () => (
    <div className="bg-white p-4 border border-gray-200 rounded-lg shadow-sm">
      <h3 className="text-lg font-semibold mb-3">Create New Shape</h3>

      <div className="space-y-3">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Shape Type
          </label>
          {renderShapeTypeSelector()}
        </div>

        <div className="flex space-x-2">
          <button
            onClick={handleCreateShape}
            disabled={loading}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? "Creating..." : "Create"}
          </button>

          <button
            onClick={() => setShowCreateForm(false)}
            className="px-4 py-2 bg-gray-300 text-gray-700 rounded-md hover:bg-gray-400"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );

  const renderToolbar = () => (
    <div className="bg-gray-50 p-4 border-b border-gray-200">
      <div className="flex items-center space-x-4">
        <button
          onClick={() => setShowCreateForm(true)}
          className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700"
        >
          Add Shape
        </button>

        <button
          onClick={handleDeleteSelected}
          disabled={selectedShapes.size === 0 || loading}
          className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50"
        >
          Delete Selected ({selectedShapes.size})
        </button>

        <button
          onClick={handleCreateComponent}
          disabled={selectedShapes.size < 2 || loading}
          className="px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 disabled:opacity-50"
        >
          Create Component
        </button>

        <button
          onClick={() => actions.clearSelection()}
          disabled={selectedShapes.size === 0}
          className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 disabled:opacity-50"
        >
          Clear Selection
        </button>

        <div className="flex items-center space-x-2">
          <input
            type="checkbox"
            id="dragMode"
            checked={dragMode}
            onChange={(e) => setDragMode(e.target.checked)}
            className="rounded"
          />
          <label htmlFor="dragMode" className="text-sm font-medium">
            Drag Mode
          </label>
        </div>
      </div>
    </div>
  );

  const renderShapeItem = (shape: Shape) => {
    const isSelected = selectedShapes.has(shape.id);

    return (
      <div
        key={shape.id}
        onClick={(e) => handleShapeClick(shape, e)}
        className={`
          p-3 border rounded-md cursor-pointer transition-all
          ${
            isSelected
              ? "border-blue-500 bg-blue-50"
              : "border-gray-200 hover:border-gray-300"
          }
        `}
      >
        <div className="flex items-center justify-between">
          <div>
            <div className="font-medium capitalize">
              {shape.type}
              {shape.type === "component" &&
                ` (${shape.children?.length || 0} items)`}
            </div>

            <div className="text-sm text-gray-500">
              {Math.round(shape.bounds.width)} ×{" "}
              {Math.round(shape.bounds.height)}
              {" • "}Z-Index: {shape.zIndex}
            </div>

            {shape.text && (
              <div className="text-sm text-gray-600 mt-1">"{shape.text}"</div>
            )}
          </div>

          {shape.type === "component" && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                actions.flattenComponent(shape.id);
              }}
              className="text-xs px-2 py-1 bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
            >
              Flatten
            </button>
          )}
        </div>
      </div>
    );
  };

  const renderShapesList = () => (
    <div className="flex-1 overflow-auto">
      <div className="p-4">
        <h3 className="text-lg font-semibold mb-3">Shapes ({shapes.length})</h3>

        {shapes.length === 0 ? (
          <div className="text-center text-gray-500 py-8">
            No shapes yet. Create one to get started!
          </div>
        ) : (
          <div className="space-y-2">
            {shapes
              .sort((a, b) => b.zIndex - a.zIndex) // Sort by z-index (highest first)
              .map(renderShapeItem)}
          </div>
        )}
      </div>
    </div>
  );

  const renderStatus = () => {
    if (loading) {
      return (
        <div className="px-4 py-2 bg-blue-50 text-blue-700 text-sm">
          Loading...
        </div>
      );
    }

    if (error) {
      return (
        <div className="px-4 py-2 bg-red-50 text-red-700 text-sm flex justify-between items-center">
          <span>{error}</span>
          <button
            onClick={actions.clearError}
            className="text-red-500 hover:text-red-700"
          >
            ×
          </button>
        </div>
      );
    }

    return null;
  };

  // ===================
  // MAIN RENDER
  // ===================

  return (
    <div className={`h-full flex flex-col bg-white ${className}`}>
      {renderToolbar()}
      {renderStatus()}

      {showCreateForm && (
        <div className="p-4 border-b border-gray-200">{renderCreateForm()}</div>
      )}

      {renderShapesList()}

      {/* Shape Canvas Preview */}
      <div className="border-t border-gray-200 p-4">
        <h4 className="font-medium mb-2">Canvas Preview</h4>
        <div
          className="relative bg-gray-50 border border-gray-200 rounded"
          style={{ height: "200px" }}
        >
          {shapes.map((shape) => (
            <div
              key={shape.id}
              className={`
                absolute border-2 cursor-pointer transition-all
                ${
                  selectedShapes.has(shape.id)
                    ? "border-blue-500 bg-blue-100"
                    : "border-gray-300"
                }
              `}
              style={{
                left: Math.max(0, shape.bounds.x1 / 5), // Scale down for preview
                top: Math.max(0, shape.bounds.y1 / 5),
                width: Math.max(10, shape.bounds.width / 5),
                height: Math.max(10, shape.bounds.height / 5),
                backgroundColor: shape.style.backgroundColor || "transparent",
                zIndex: shape.zIndex,
              }}
              onClick={(e) => handleShapeClick(shape, e)}
              title={`${shape.type} (${shape.id})`}
            >
              {shape.text && (
                <div className="text-xs p-1 overflow-hidden">{shape.text}</div>
              )}
            </div>
          ))}

          {shapes.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center text-gray-400 text-sm">
              Canvas Preview
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default CleanShapeManager;
