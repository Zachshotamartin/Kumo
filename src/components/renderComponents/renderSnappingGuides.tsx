import React from "react";
import { useSelector } from "react-redux";
import { Shape } from "../../classes/shape";

const RenderSnappingGuides = () => {
  const shapes = useSelector((state: any) => state.whiteBoard.shapes);
  const borderStartX = useSelector((state: any) => state.selected.borderStartX);
  const borderStartY = useSelector((state: any) => state.selected.borderStartY);
  const borderEndX = useSelector((state: any) => state.selected.borderEndX);
  const borderEndY = useSelector((state: any) => state.selected.borderEndY);
  const window = useSelector((state: any) => state.window);
  const selectedShapes = useSelector(
    (state: any) => state.selected.selectedShapes
  );
  const dragging = useSelector((state: any) => state.actions.dragging);

  // Don't render if no selection, not dragging, or no active movement
  if (borderStartX === -100000 || borderStartY === -100000 || !dragging) {
    return null;
  }

  const guides: Array<{
    type: "vertical" | "horizontal";
    coordinate: number;
    startCoord: number;
    endCoord: number;
    color: string;
  }> = [];

  // Helper function to convert world coordinates to screen coordinates
  const worldToScreen = (worldX: number, worldY: number) => ({
    x: (worldX - window.x1) / window.percentZoomed,
    y: (worldY - window.y1) / window.percentZoomed,
  });

  // Get viewport bounds in world coordinates
  const viewportBounds = {
    left: window.x1,
    right: window.x2,
    top: window.y1,
    bottom: window.y2,
  };

  // Helper function to check if a shape intersects with the viewport
  const isShapeVisible = (shape: Shape): boolean => {
    const shapeLeft = Math.min(shape.x1, shape.x2);
    const shapeRight = Math.max(shape.x1, shape.x2);
    const shapeTop = Math.min(shape.y1, shape.y2);
    const shapeBottom = Math.max(shape.y1, shape.y2);

    // Standard rectangle intersection test
    return !(
      shapeRight < viewportBounds.left ||
      shapeLeft > viewportBounds.right ||
      shapeBottom < viewportBounds.top ||
      shapeTop > viewportBounds.bottom
    );
  };

  // Get selection bounds
  const selectionBounds = {
    left: Math.min(borderStartX, borderEndX),
    right: Math.max(borderStartX, borderEndX),
    top: Math.min(borderStartY, borderEndY),
    bottom: Math.max(borderStartY, borderEndY),
    centerX: (borderStartX + borderEndX) / 2,
    centerY: (borderStartY + borderEndY) / 2,
  };

  // Filter shapes to only include visible ones that are not selected
  const visibleShapes = shapes.filter(
    (shape: Shape) =>
      !selectedShapes.includes(shape.id) && isShapeVisible(shape)
  );

  // Check each visible shape for alignment with selection
  visibleShapes.forEach((shape: Shape) => {
    const shapeBounds = {
      left: Math.min(shape.x1, shape.x2),
      right: Math.max(shape.x1, shape.x2),
      top: Math.min(shape.y1, shape.y2),
      bottom: Math.max(shape.y1, shape.y2),
      centerX: (shape.x1 + shape.x2) / 2,
      centerY: (shape.y1 + shape.y2) / 2,
    };

    // Check for vertical alignment (left, right, center)
    const verticalAlignments = [
      {
        selectionCoord: selectionBounds.left,
        shapeCoords: [shapeBounds.left, shapeBounds.right, shapeBounds.centerX],
      },
      {
        selectionCoord: selectionBounds.right,
        shapeCoords: [shapeBounds.left, shapeBounds.right, shapeBounds.centerX],
      },
      {
        selectionCoord: selectionBounds.centerX,
        shapeCoords: [shapeBounds.left, shapeBounds.right, shapeBounds.centerX],
      },
    ];

    verticalAlignments.forEach(({ selectionCoord, shapeCoords }) => {
      shapeCoords.forEach((shapeCoord) => {
        if (Math.abs(selectionCoord - shapeCoord) < 1) {
          // Allow for small floating point differences
          // Calculate the span between the two objects vertically
          const topBound = Math.min(selectionBounds.top, shapeBounds.top);
          const bottomBound = Math.max(
            selectionBounds.bottom,
            shapeBounds.bottom
          );

          guides.push({
            type: "vertical",
            coordinate: selectionCoord,
            startCoord: topBound,
            endCoord: bottomBound,
            color: "#ff0000",
          });
        }
      });
    });

    // Check for horizontal alignment (top, bottom, center)
    const horizontalAlignments = [
      {
        selectionCoord: selectionBounds.top,
        shapeCoords: [shapeBounds.top, shapeBounds.bottom, shapeBounds.centerY],
      },
      {
        selectionCoord: selectionBounds.bottom,
        shapeCoords: [shapeBounds.top, shapeBounds.bottom, shapeBounds.centerY],
      },
      {
        selectionCoord: selectionBounds.centerY,
        shapeCoords: [shapeBounds.top, shapeBounds.bottom, shapeBounds.centerY],
      },
    ];

    horizontalAlignments.forEach(({ selectionCoord, shapeCoords }) => {
      shapeCoords.forEach((shapeCoord) => {
        if (Math.abs(selectionCoord - shapeCoord) < 1) {
          // Allow for small floating point differences
          // Calculate the span between the two objects horizontally
          const leftBound = Math.min(selectionBounds.left, shapeBounds.left);
          const rightBound = Math.max(selectionBounds.right, shapeBounds.right);

          guides.push({
            type: "horizontal",
            coordinate: selectionCoord,
            startCoord: leftBound,
            endCoord: rightBound,
            color: "#ff0000",
          });
        }
      });
    });
  });

  // Remove duplicate guides
  const uniqueGuides = guides.filter(
    (guide, index, arr) =>
      arr.findIndex(
        (g) =>
          g.type === guide.type &&
          Math.abs(g.coordinate - guide.coordinate) < 1 &&
          Math.abs(g.startCoord - guide.startCoord) < 1 &&
          Math.abs(g.endCoord - guide.endCoord) < 1
      ) === index
  );

  return (
    <div
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        pointerEvents: "none",
        zIndex: 99,
      }}
    >
      {uniqueGuides.map((guide, index) => {
        if (guide.type === "vertical") {
          const screenX = worldToScreen(guide.coordinate, 0).x;
          const screenStartY = worldToScreen(0, guide.startCoord).y;
          const screenEndY = worldToScreen(0, guide.endCoord).y;
          const lineHeight = Math.abs(screenEndY - screenStartY);

          return (
            <div
              key={`v-${index}`}
              style={{
                position: "absolute",
                left: `${screenX}px`,
                top: `${Math.min(screenStartY, screenEndY)}px`,
                width: "2px",
                height: `${lineHeight}px`,
                backgroundColor: guide.color,
                opacity: 0.8,
                pointerEvents: "none",
              }}
            />
          );
        } else {
          const screenY = worldToScreen(0, guide.coordinate).y;
          const screenStartX = worldToScreen(guide.startCoord, 0).x;
          const screenEndX = worldToScreen(guide.endCoord, 0).x;
          const lineWidth = Math.abs(screenEndX - screenStartX);

          return (
            <div
              key={`h-${index}`}
              style={{
                position: "absolute",
                left: `${Math.min(screenStartX, screenEndX)}px`,
                top: `${screenY}px`,
                width: `${lineWidth}px`,
                height: "2px",
                backgroundColor: guide.color,
                opacity: 0.8,
                pointerEvents: "none",
              }}
            />
          );
        }
      })}
    </div>
  );
};

export default RenderSnappingGuides;
