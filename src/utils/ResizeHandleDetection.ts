interface Point {
  x: number;
  y: number;
}

interface BoundingBox {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
}

interface WindowState {
  percentZoomed: number;
}

export enum ResizeDirection {
  NONE = "none",
  TOP = "top",
  BOTTOM = "bottom",
  LEFT = "left",
  RIGHT = "right",
  TOP_LEFT = "top-left",
  TOP_RIGHT = "top-right",
  BOTTOM_LEFT = "bottom-left",
  BOTTOM_RIGHT = "bottom-right",
}

export interface ResizeHandleResult {
  direction: ResizeDirection;
  isResize: boolean;
  cursor: string;
}

/**
 * Improved resize handle detection with proper zoom scaling
 * Coordinates are handled in world coordinates (before viewport transformation)
 */
export class ResizeHandleDetection {
  private static readonly BASE_HANDLE_SIZE = 16; // Base size for optimal interaction
  private static readonly MIN_HANDLE_SIZE = 8; // Minimum size to prevent invisibility
  private static readonly MAX_HANDLE_SIZE = 32; // Maximum size to prevent taking over UI

  // Edge detection gets slightly larger area for better UX
  private static readonly EDGE_DETECTION_MULTIPLIER = 1.25;

  /**
   * Calculate optimal handle size based on zoom level with improved scaling
   * This returns the hit detection size in world coordinates
   */
  private static getHandleSize(
    window: WindowState,
    isEdgeDetection: boolean = false
  ): number {
    const zoomFactor = window.percentZoomed;

    // Improved zoom scaling algorithm for consistent feel across zoom levels
    // Uses logarithmic scaling for more natural behavior
    let scaleFactor;
    if (zoomFactor >= 1) {
      // When zoomed in, use inverse scaling with smoothing
      scaleFactor = 1 / Math.sqrt(zoomFactor);
    } else {
      // When zoomed out, use gentler scaling to prevent huge handles
      scaleFactor = 1 + (1 - zoomFactor) * 0.5;
    }

    let calculatedSize = this.BASE_HANDLE_SIZE * scaleFactor;

    // Apply edge detection multiplier for slightly larger edge hit areas
    if (isEdgeDetection) {
      calculatedSize *= this.EDGE_DETECTION_MULTIPLIER;
    }

    // Clamp to reasonable bounds
    return Math.max(
      this.MIN_HANDLE_SIZE,
      Math.min(this.MAX_HANDLE_SIZE, calculatedSize)
    );
  }

  /**
   * Get resize direction and cursor for a point within selection bounds
   * Both point and bounds should be in world coordinates
   */
  static getResizeDirection(
    point: Point,
    bounds: BoundingBox,
    window: WindowState
  ): ResizeHandleResult {
    const cornerHandleSize = this.getHandleSize(window, false);
    const edgeHandleSize = this.getHandleSize(window, true);
    const { startX, startY, endX, endY } = bounds;

    // Normalize bounds to ensure startX < endX and startY < endY
    const normalizedBounds = {
      minX: Math.min(startX, endX),
      maxX: Math.max(startX, endX),
      minY: Math.min(startY, endY),
      maxY: Math.max(startY, endY),
    };

    // Check corners first (higher priority than edges)
    const cornerResults = this.checkCorners(
      point,
      normalizedBounds,
      cornerHandleSize
    );
    if (cornerResults.isResize) {
      return cornerResults;
    }

    // Check edges with slightly larger detection area
    const edgeResults = this.checkEdges(
      point,
      normalizedBounds,
      edgeHandleSize
    );
    if (edgeResults.isResize) {
      return edgeResults;
    }

    // Check if point is inside bounds (for moving)
    if (this.isPointInBounds(point, normalizedBounds)) {
      return {
        direction: ResizeDirection.NONE,
        isResize: false,
        cursor: "move",
      };
    }

    // Point is outside bounds
    return {
      direction: ResizeDirection.NONE,
      isResize: false,
      cursor: "default",
    };
  }

  /**
   * Check corner resize handles with zoom-aware detection
   */
  private static checkCorners(
    point: Point,
    bounds: { minX: number; maxX: number; minY: number; maxY: number },
    handleSize: number
  ): ResizeHandleResult {
    const { minX, maxX, minY, maxY } = bounds;

    // Top-left corner
    if (this.isPointNearCorner(point, { x: minX, y: minY }, handleSize)) {
      return {
        direction: ResizeDirection.TOP_LEFT,
        isResize: true,
        cursor: "nw-resize",
      };
    }

    // Top-right corner
    if (this.isPointNearCorner(point, { x: maxX, y: minY }, handleSize)) {
      return {
        direction: ResizeDirection.TOP_RIGHT,
        isResize: true,
        cursor: "ne-resize",
      };
    }

    // Bottom-left corner
    if (this.isPointNearCorner(point, { x: minX, y: maxY }, handleSize)) {
      return {
        direction: ResizeDirection.BOTTOM_LEFT,
        isResize: true,
        cursor: "sw-resize",
      };
    }

    // Bottom-right corner
    if (this.isPointNearCorner(point, { x: maxX, y: maxY }, handleSize)) {
      return {
        direction: ResizeDirection.BOTTOM_RIGHT,
        isResize: true,
        cursor: "se-resize",
      };
    }

    return {
      direction: ResizeDirection.NONE,
      isResize: false,
      cursor: "default",
    };
  }

  /**
   * Check edge resize handles with enhanced zoom-aware detection
   */
  private static checkEdges(
    point: Point,
    bounds: { minX: number; maxX: number; minY: number; maxY: number },
    handleSize: number
  ): ResizeHandleResult {
    const { minX, maxX, minY, maxY } = bounds;

    // Calculate minimum shape size to prevent edge detection on tiny shapes
    const shapeWidth = maxX - minX;
    const shapeHeight = maxY - minY;
    const minDimension = Math.min(shapeWidth, shapeHeight);

    // Adjust edge detection based on shape size to prevent overlap
    const effectiveHandleSize = Math.min(handleSize, minDimension * 0.3);

    // Top edge
    if (
      this.isPointOnHorizontalEdge(point, minY, minX, maxX, effectiveHandleSize)
    ) {
      return {
        direction: ResizeDirection.TOP,
        isResize: true,
        cursor: "n-resize",
      };
    }

    // Bottom edge
    if (
      this.isPointOnHorizontalEdge(point, maxY, minX, maxX, effectiveHandleSize)
    ) {
      return {
        direction: ResizeDirection.BOTTOM,
        isResize: true,
        cursor: "s-resize",
      };
    }

    // Left edge
    if (
      this.isPointOnVerticalEdge(point, minX, minY, maxY, effectiveHandleSize)
    ) {
      return {
        direction: ResizeDirection.LEFT,
        isResize: true,
        cursor: "w-resize",
      };
    }

    // Right edge
    if (
      this.isPointOnVerticalEdge(point, maxX, minY, maxY, effectiveHandleSize)
    ) {
      return {
        direction: ResizeDirection.RIGHT,
        isResize: true,
        cursor: "e-resize",
      };
    }

    return {
      direction: ResizeDirection.NONE,
      isResize: false,
      cursor: "default",
    };
  }

  /**
   * Check if point is near a corner within handle size
   * Uses circular detection for more natural feel
   */
  private static isPointNearCorner(
    point: Point,
    corner: Point,
    handleSize: number
  ): boolean {
    const dx = point.x - corner.x;
    const dy = point.y - corner.y;

    // Use circular detection (distance from corner)
    const distance = Math.sqrt(dx * dx + dy * dy);
    return distance <= handleSize;
  }

  /**
   * Check if point is on a vertical edge within handle size
   * Enhanced with zoom-aware detection and shape size consideration
   */
  private static isPointOnVerticalEdge(
    point: Point,
    edgeX: number,
    minY: number,
    maxY: number,
    handleSize: number
  ): boolean {
    const shapeHeight = maxY - minY;

    // Ensure we don't make the edge detection area larger than the shape itself
    const effectiveRange = Math.min(handleSize, shapeHeight * 0.4);

    return (
      Math.abs(point.x - edgeX) <= handleSize &&
      point.y >= minY - effectiveRange &&
      point.y <= maxY + effectiveRange
    );
  }

  /**
   * Check if point is on a horizontal edge within handle size
   * Enhanced with zoom-aware detection and shape size consideration
   */
  private static isPointOnHorizontalEdge(
    point: Point,
    edgeY: number,
    minX: number,
    maxX: number,
    handleSize: number
  ): boolean {
    const shapeWidth = maxX - minX;

    // Ensure we don't make the edge detection area larger than the shape itself
    const effectiveRange = Math.min(handleSize, shapeWidth * 0.4);

    return (
      Math.abs(point.y - edgeY) <= handleSize &&
      point.x >= minX - effectiveRange &&
      point.x <= maxX + effectiveRange
    );
  }

  /**
   * Check if point is inside bounds
   */
  private static isPointInBounds(
    point: Point,
    bounds: { minX: number; maxX: number; minY: number; maxY: number }
  ): boolean {
    return (
      point.x >= bounds.minX &&
      point.x <= bounds.maxX &&
      point.y >= bounds.minY &&
      point.y <= bounds.maxY
    );
  }

  /**
   * Get CSS cursor for resize direction
   */
  static getCursorForDirection(direction: ResizeDirection): string {
    switch (direction) {
      case ResizeDirection.TOP:
      case ResizeDirection.BOTTOM:
        return "ns-resize";
      case ResizeDirection.LEFT:
      case ResizeDirection.RIGHT:
        return "ew-resize";
      case ResizeDirection.TOP_LEFT:
      case ResizeDirection.BOTTOM_RIGHT:
        return "nw-resize";
      case ResizeDirection.TOP_RIGHT:
      case ResizeDirection.BOTTOM_LEFT:
        return "ne-resize";
      default:
        return "default";
    }
  }

  /**
   * Get debug information for troubleshooting zoom-related issues
   */
  static getDebugInfo(window: WindowState): {
    zoomFactor: number;
    cornerHandleSize: number;
    edgeHandleSize: number;
    scalingType: string;
  } {
    return {
      zoomFactor: window.percentZoomed,
      cornerHandleSize: this.getHandleSize(window, false),
      edgeHandleSize: this.getHandleSize(window, true),
      scalingType: window.percentZoomed >= 1 ? "zoomed-in" : "zoomed-out",
    };
  }

  /**
   * Check if two resize directions are compatible for multi-directional resize
   */
  static areDirectionsCompatible(
    dir1: ResizeDirection,
    dir2: ResizeDirection
  ): boolean {
    const verticalDirections = [ResizeDirection.TOP, ResizeDirection.BOTTOM];
    const horizontalDirections = [ResizeDirection.LEFT, ResizeDirection.RIGHT];

    const dir1IsVertical = verticalDirections.includes(dir1);
    const dir2IsVertical = verticalDirections.includes(dir2);
    const dir1IsHorizontal = horizontalDirections.includes(dir1);
    const dir2IsHorizontal = horizontalDirections.includes(dir2);

    // Compatible if one is vertical and one is horizontal
    return (
      (dir1IsVertical && dir2IsHorizontal) ||
      (dir1IsHorizontal && dir2IsVertical)
    );
  }

  /**
   * Combine two compatible directions into a corner direction
   */
  static combineDirections(
    dir1: ResizeDirection,
    dir2: ResizeDirection
  ): ResizeDirection {
    const directions = [dir1, dir2].sort();

    if (directions.includes(ResizeDirection.TOP)) {
      if (directions.includes(ResizeDirection.LEFT))
        return ResizeDirection.TOP_LEFT;
      if (directions.includes(ResizeDirection.RIGHT))
        return ResizeDirection.TOP_RIGHT;
    }

    if (directions.includes(ResizeDirection.BOTTOM)) {
      if (directions.includes(ResizeDirection.LEFT))
        return ResizeDirection.BOTTOM_LEFT;
      if (directions.includes(ResizeDirection.RIGHT))
        return ResizeDirection.BOTTOM_RIGHT;
    }

    return dir1; // Fallback to first direction
  }
}
