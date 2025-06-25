import { useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import { Shape } from "../../classes/shape";
import { ResizeHandleDetection } from "../../utils/ResizeHandleDetection";

import {
  setBorderStartX,
  setBorderStartY,
  setBorderEndX,
  setBorderEndY,
} from "../../features/selected/selectedSlice";

const RenderBorder = () => {
  const dispatch = useDispatch();
  const borderStartX = useSelector((state: any) => state.selected.borderStartX);
  const borderStartY = useSelector((state: any) => state.selected.borderStartY);
  const borderEndX = useSelector((state: any) => state.selected.borderEndX);
  const borderEndY = useSelector((state: any) => state.selected.borderEndY);
  const shapes = useSelector((state: any) => state.whiteBoard.shapes);
  const selectedShapes = useSelector(
    (state: any) => state.selected.selectedShapes
  );
  const window = useSelector((state: any) => state.window);

  useEffect(() => {
    const selectedShapesArray = shapes.filter((shape: Shape, index: number) => {
      return selectedShapes.includes(shape.id);
    });

    if (selectedShapesArray.length === 0) {
      dispatch(setBorderStartX(-100000));
      dispatch(setBorderEndX(-100000));
      dispatch(setBorderStartY(-100000));
      dispatch(setBorderEndY(-100000));
      return;
    }
    const leftX = selectedShapesArray.reduce((minX: number, shape: Shape) => {
      return Math.min(minX, Math.min(shape.x1, shape.x2));
    }, Infinity);

    const rightX = selectedShapesArray.reduce((maxX: number, shape: Shape) => {
      return Math.max(maxX, Math.max(shape.x1, shape.x2));
    }, -Infinity);

    const topY = selectedShapesArray.reduce((minY: number, shape: Shape) => {
      return Math.min(minY, Math.min(shape.y1, shape.y2));
    }, Infinity);

    const bottomY = selectedShapesArray.reduce((maxY: number, shape: Shape) => {
      return Math.max(maxY, Math.max(shape.y1, shape.y2));
    }, -Infinity);

    dispatch(setBorderStartX(leftX));
    dispatch(setBorderStartY(topY));
    dispatch(setBorderEndX(rightX));
    dispatch(setBorderEndY(bottomY));
  }, [dispatch, selectedShapes, shapes]);

  // Calculate border dimensions and position consistently
  const borderLeft = (borderStartX - window.x1) / window.percentZoomed;
  const borderTop = (borderStartY - window.y1) / window.percentZoomed;
  const borderWidth =
    Math.abs(borderEndX - borderStartX) / window.percentZoomed;
  const borderHeight =
    Math.abs(borderEndY - borderStartY) / window.percentZoomed;

  // Use ResizeHandleDetection utility for consistent sizing across zoom levels
  const windowWithZoom = {
    ...window,
    percentZoomed: window.percentZoomed ?? 1.0,
  };
  const debugInfo = ResizeHandleDetection.getDebugInfo(windowWithZoom);

  // Convert world coordinates to screen coordinates for visual handles
  const cornerHandleScreenSize = Math.max(
    6,
    Math.min(12, debugInfo.cornerHandleSize / windowWithZoom.percentZoomed)
  );
  const edgeHandleScreenSize = Math.max(
    6,
    Math.min(12, debugInfo.edgeHandleSize / windowWithZoom.percentZoomed)
  );

  // Hit areas are larger (converted from world coordinates to screen coordinates)
  const cornerHitAreaSize = Math.max(
    12,
    Math.min(20, debugInfo.cornerHandleSize / windowWithZoom.percentZoomed)
  );
  const edgeHitAreaSize = Math.max(
    12,
    Math.min(20, debugInfo.edgeHandleSize / windowWithZoom.percentZoomed)
  );

  const borderPadding = 2;

  // Create handles with both visual and hit area components
  const createHandle = (
    top: number,
    left: number,
    cursor: string,
    testId?: string,
    isEdge: boolean = false
  ) => {
    const visualSize = isEdge ? edgeHandleScreenSize : cornerHandleScreenSize;
    const hitSize = isEdge ? edgeHitAreaSize : cornerHitAreaSize;
    const visualOffset = visualSize / 2;
    const hitAreaOffset = hitSize / 2;

    return (
      <div key={`handle-${cursor}-${testId}`}>
        {/* Invisible hit area - larger for easier interaction */}
        <div
          data-testid={testId ? `hit-area-${testId}` : undefined}
          style={{
            position: "absolute",
            top: `${top - hitAreaOffset}px`,
            left: `${left - hitAreaOffset}px`,
            width: `${hitSize}px`,
            height: `${hitSize}px`,
            cursor,
            zIndex: 53,
            backgroundColor: "transparent",
            border: "none",
          }}
        />
        {/* Visual handle - smaller and styled */}
        <div
          data-testid={testId ? `visual-${testId}` : undefined}
          style={{
            position: "absolute",
            top: `${top - visualOffset}px`,
            left: `${left - visualOffset}px`,
            width: `${visualSize}px`,
            height: `${visualSize}px`,
            border: `2px solid rgba(99, 102, 241, 0.9)`,
            backgroundColor: "white",
            borderRadius: "50%",
            boxShadow: "0 2px 8px rgba(99, 102, 241, 0.3)",
            zIndex: 52,
            pointerEvents: "none", // Let the hit area handle events
          }}
        />
      </div>
    );
  };

  // Debug overlay (only in development)
  const showDebugInfo = process.env.NODE_ENV === "development" && false; // Set to true to enable debug

  return (
    <>
      {/* Selection border */}
      <div
        style={{
          position: "absolute",
          top: `${borderTop - borderPadding}px`,
          left: `${borderLeft - borderPadding}px`,
          width: `${borderWidth + borderPadding * 2}px`,
          height: `${borderHeight + borderPadding * 2}px`,
          border: `2px solid rgba(99, 102, 241, 0.8)`,
          backgroundColor: "rgba(99, 102, 241, 0.05)",
          borderRadius: "4px",
          boxShadow:
            "0 0 0 1px rgba(99, 102, 241, 0.2), 0 4px 12px rgba(99, 102, 241, 0.15)",
          zIndex: 51,
          pointerEvents: "none",
        }}
      />

      {/* Corner handles */}
      {createHandle(
        borderTop - borderPadding,
        borderLeft - borderPadding,
        "nw-resize",
        "top-left",
        false
      )}
      {createHandle(
        borderTop - borderPadding,
        borderLeft + borderWidth + borderPadding,
        "ne-resize",
        "top-right",
        false
      )}
      {createHandle(
        borderTop + borderHeight + borderPadding,
        borderLeft - borderPadding,
        "sw-resize",
        "bottom-left",
        false
      )}
      {createHandle(
        borderTop + borderHeight + borderPadding,
        borderLeft + borderWidth + borderPadding,
        "se-resize",
        "bottom-right",
        false
      )}

      {/* Edge handles */}
      {createHandle(
        borderTop - borderPadding,
        borderLeft + borderWidth / 2,
        "n-resize",
        "top-edge",
        true
      )}
      {createHandle(
        borderTop + borderHeight + borderPadding,
        borderLeft + borderWidth / 2,
        "s-resize",
        "bottom-edge",
        true
      )}
      {createHandle(
        borderTop + borderHeight / 2,
        borderLeft - borderPadding,
        "w-resize",
        "left-edge",
        true
      )}
      {createHandle(
        borderTop + borderHeight / 2,
        borderLeft + borderWidth + borderPadding,
        "e-resize",
        "right-edge",
        true
      )}

      {/* Debug info overlay */}
      {showDebugInfo && (
        <div
          style={{
            position: "absolute",
            top: `${borderTop + borderHeight + 20}px`,
            left: `${borderLeft}px`,
            background: "rgba(0, 0, 0, 0.8)",
            color: "white",
            padding: "8px",
            borderRadius: "4px",
            fontSize: "11px",
            fontFamily: "monospace",
            zIndex: 60,
            whiteSpace: "nowrap",
          }}
        >
          <div>Zoom: {(debugInfo.zoomFactor * 100).toFixed(0)}%</div>
          <div>
            Corner Handle: {debugInfo.cornerHandleSize.toFixed(1)}px (world)
          </div>
          <div>
            Edge Handle: {debugInfo.edgeHandleSize.toFixed(1)}px (world)
          </div>
          <div>
            Visual Corner: {cornerHandleScreenSize.toFixed(1)}px (screen)
          </div>
          <div>Hit Corner: {cornerHitAreaSize.toFixed(1)}px (screen)</div>
          <div>Type: {debugInfo.scalingType}</div>
        </div>
      )}
    </>
  );
};

export default RenderBorder;
