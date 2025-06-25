import { WindowState } from "../features/window/windowSlice";
import { ResizeHandleDetection } from "../utils/ResizeHandleDetection";

/**
 * @deprecated Use ResizeHandleDetection.getResizeDirection() directly for better zoom-aware behavior
 * This function is maintained for backward compatibility but will be removed in future versions
 */
export function changeCursor(
  x: number,
  y: number,
  e: React.MouseEvent<HTMLDivElement>,
  borderStartX: number,
  borderEndX: number,
  borderStartY: number,
  borderEndY: number,
  window: WindowState
): void {
  // Handle undefined percentZoomed by defaulting to 1.0 (100% zoom)
  const windowWithZoom = {
    ...window,
    percentZoomed: window.percentZoomed ?? 1.0,
  };

  // Use the new ResizeHandleDetection utility for consistent zoom-aware behavior
  const point = { x, y };
  const bounds = {
    startX: borderStartX,
    startY: borderStartY,
    endX: borderEndX,
    endY: borderEndY,
  };

  const resizeResult = ResizeHandleDetection.getResizeDirection(
    point,
    bounds,
    windowWithZoom
  );

  // Apply the cursor
  (e.target as HTMLElement).style.cursor = resizeResult.cursor;
}

/**
 * New improved cursor detection function using ResizeHandleDetection utility
 * Provides zoom-aware cursor behavior with consistent handle sizes
 */
export function getZoomAwareCursor(
  x: number,
  y: number,
  borderStartX: number,
  borderEndX: number,
  borderStartY: number,
  borderEndY: number,
  window: WindowState
): string {
  // Handle undefined percentZoomed by defaulting to 1.0 (100% zoom)
  const windowWithZoom = {
    ...window,
    percentZoomed: window.percentZoomed ?? 1.0,
  };

  const point = { x, y };
  const bounds = {
    startX: borderStartX,
    startY: borderStartY,
    endX: borderEndX,
    endY: borderEndY,
  };

  const resizeResult = ResizeHandleDetection.getResizeDirection(
    point,
    bounds,
    windowWithZoom
  );
  return resizeResult.cursor;
}
