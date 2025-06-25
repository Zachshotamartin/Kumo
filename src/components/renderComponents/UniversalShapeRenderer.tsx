import React, { useMemo, useCallback } from "react";
import { useSelector } from "react-redux";
import { getShapeSystem } from "../../shapes/core/ShapeSystem";
import { Viewport } from "../../performance/types";
import { ShapeErrorBoundary } from "../ErrorBoundary";

import type { KumoShape } from "../../types";

interface UniversalShapeRendererProps {
  shapes: any[];
  viewport: Viewport;
  selectedShapes: any[];
  performanceMode: "auto" | "high" | "balanced" | "compatibility";
  onShapeClick?: (shape: any) => void;
  onShapeHover?: (shape: any) => void;
}

/**
 * High-performance universal shape renderer
 *
 * Features:
 * - Level-of-detail rendering based on zoom level
 * - Batched rendering for performance
 * - Shape plugin integration
 * - Performance mode optimization
 */
export const UniversalShapeRenderer: React.FC<UniversalShapeRendererProps> = ({
  shapes,
  viewport,
  selectedShapes,
  performanceMode,
  onShapeClick,
  onShapeHover,
}) => {
  const window = useSelector((state: any) => state.window);
  const shapeSystem = useMemo(() => getShapeSystem(), []);

  // LOD thresholds based on performance mode
  const lodThresholds = useMemo(() => {
    switch (performanceMode) {
      case "high":
        return { simple: 0.5, hidden: 0.2 };
      case "balanced":
        return { simple: 0.3, hidden: 0.1 };
      case "compatibility":
        return { simple: 0, hidden: 0 }; // No LOD in compatibility mode
      default:
        return { simple: 0.3, hidden: 0.1 };
    }
  }, [performanceMode]);

  // Determine LOD level for a shape
  const getLODLevel = useCallback(
    (shape: any): "full" | "simple" | "hidden" => {
      if (performanceMode === "compatibility") return "full";

      const scale = viewport.scale;
      const isSelected = selectedShapes.some((s) => s.id === shape.id);

      // Selected shapes always render in full detail
      if (isSelected) return "full";

      if (scale < lodThresholds.hidden) {
        return "hidden";
      } else if (scale < lodThresholds.simple) {
        return "simple";
      } else {
        return "full";
      }
    },
    [viewport.scale, selectedShapes, lodThresholds, performanceMode]
  );

  // Handle mouse events with performance optimizations
  const handleMouseEnter = useCallback(
    (shape: any) => {
      if (onShapeHover) {
        // Throttle hover events in high performance mode
        if (performanceMode === "high") {
          setTimeout(() => onShapeHover(shape), 16); // ~60fps throttling
        } else {
          onShapeHover(shape);
        }
      }
    },
    [onShapeHover, performanceMode]
  );

  const handleClick = useCallback(
    (shape: any) => {
      if (onShapeClick) {
        onShapeClick(shape);
      }
    },
    [onShapeClick]
  );

  // Render shapes with appropriate LOD
  const renderShape = useCallback(
    (shape: any, index: number) => {
      const lodLevel = getLODLevel(shape);

      // Skip hidden shapes
      if (lodLevel === "hidden") {
        return null;
      }

      const isSelected = selectedShapes.some((s) => s.id === shape.id);
      const plugin = shapeSystem.getPlugin(shape.type);

      if (!plugin) {
        console.warn(`No plugin found for shape type: ${shape.type}`);
        return null;
      }

      // Create render context
      const context = {
        shape,
        isSelected,
        isHovered: false, // TODO: Track hover state
        window,
        onMouseEnter: () => handleMouseEnter(shape),
        onMouseLeave: () => {},
        onClick: () => handleClick(shape),
      };

      // Wrap shape rendering in error boundary
      return (
        <ShapeErrorBoundary
          key={`shape-${shape.id}-${index}`}
          shapeId={shape.id}
        >
          {lodLevel === "simple"
            ? renderSimpleShape(shape, context, index)
            : plugin.render(context)}
        </ShapeErrorBoundary>
      );
    },
    [
      getLODLevel,
      selectedShapes,
      shapeSystem,
      window,
      handleMouseEnter,
      handleClick,
    ]
  );

  // Simple shape rendering for LOD
  const renderSimpleShape = useCallback(
    (shape: any, context: any, index: number) => {
      const bounds = {
        x: Math.min(shape.x1, shape.x2),
        y: Math.min(shape.y1, shape.y2),
        width: Math.abs(shape.x2 - shape.x1),
        height: Math.abs(shape.y2 - shape.y1),
      };

      // Simple rectangle representation for all shapes when zoomed out
      return (
        <div
          key={`simple-${shape.id}-${index}`}
          style={{
            position: "absolute",
            left: `${(bounds.x - window.x1) / window.percentZoomed}px`,
            top: `${(bounds.y - window.y1) / window.percentZoomed}px`,
            width: `${bounds.width / window.percentZoomed}px`,
            height: `${bounds.height / window.percentZoomed}px`,
            backgroundColor: shape.backgroundColor || "#cccccc",
            borderRadius: shape.type === "ellipse" ? "50%" : "0",
            border: `1px solid ${shape.borderColor || "#999999"}`,
            opacity: 0.7,
            zIndex: context.isSelected ? 50 : shape.zIndex || 1,
            pointerEvents: shape.level === 0 ? "all" : "none",
            cursor: "pointer",
          }}
          onMouseEnter={context.onMouseEnter}
          onMouseLeave={context.onMouseLeave}
          onClick={context.onClick}
        />
      );
    },
    [window]
  );

  // Batch rendering for performance
  const renderShapesBatched = useMemo(() => {
    if (performanceMode === "compatibility") {
      // No batching in compatibility mode
      return shapes.map(renderShape);
    }

    // Group shapes by type for batched rendering
    const shapesByType = shapes.reduce((acc, shape) => {
      if (!acc[shape.type]) {
        acc[shape.type] = [];
      }
      acc[shape.type].push(shape);
      return acc;
    }, {} as Record<string, any[]>);

    // Render each type as a batch
    return (Object.entries(shapesByType) as [string, KumoShape[]][]).map(
      ([type, typeShapes]) => {
        return (
          <div key={`batch-${type}`} data-shape-type={type}>
            {typeShapes.map((shape: KumoShape, index: number) =>
              renderShape(shape, index)
            )}
          </div>
        );
      }
    );
  }, [shapes, renderShape, performanceMode]);

  // Performance optimization: Memoize the entire render tree
  const memoizedShapes = useMemo(() => {
    if (shapes.length === 0) return null;

    return (
      <div
        style={{
          position: "relative",
          width: "100%",
          height: "100%",
        }}
        data-performance-mode={performanceMode}
        data-shape-count={shapes.length}
      >
        {renderShapesBatched}
      </div>
    );
  }, [shapes, renderShapesBatched, performanceMode]);

  return memoizedShapes;
};

export default UniversalShapeRenderer;
