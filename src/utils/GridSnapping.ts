import { Shape } from "../classes/shape";

export interface SnapPoint {
  x: number;
  y: number;
  type: "grid" | "shape-edge" | "shape-center" | "shape-midpoint";
  shapeId?: string;
  priority: number; // Lower number = higher priority
}

export interface SnapResult {
  x: number;
  y: number;
  snappedX: boolean;
  snappedY: boolean;
  snapPointsX: SnapPoint[];
  snapPointsY: SnapPoint[];
}

export interface GridSnappingConfig {
  enabled: boolean;
  gridSize: number;
  snapThreshold: number; // Distance in pixels to snap
  snapToShapes: boolean;
  snapToGrid: boolean;
  showGuides: boolean;
  prioritizeGrid: boolean; // Grid snapping has priority over shape snapping
}

/**
 * Advanced grid snapping system with tolerance-based snapping
 */
export class GridSnapping {
  private config: GridSnappingConfig;
  private shapes: Shape[];
  private viewport: { percentZoomed: number };

  constructor(
    config: Partial<GridSnappingConfig> = {},
    shapes: Shape[] = [],
    viewport: { percentZoomed: number } = { percentZoomed: 1 }
  ) {
    this.config = {
      enabled: true,
      gridSize: 20,
      snapThreshold: 8, // 8 pixels threshold
      snapToShapes: true,
      snapToGrid: true,
      showGuides: true,
      prioritizeGrid: false,
      ...config,
    };
    this.shapes = shapes;
    this.viewport = viewport;
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<GridSnappingConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  /**
   * Update shapes for snapping calculations
   */
  updateShapes(shapes: Shape[]): void {
    this.shapes = shapes;
  }

  /**
   * Update viewport for zoom-aware snapping
   */
  updateViewport(viewport: { percentZoomed: number }): void {
    this.viewport = viewport;
  }

  /**
   * Get the effective snap threshold based on zoom level
   */
  private getEffectiveThreshold(): number {
    // Adjust threshold based on zoom level
    // When zoomed in, threshold should be smaller in world coordinates
    // When zoomed out, threshold should be larger in world coordinates
    return this.config.snapThreshold * this.viewport.percentZoomed;
  }

  /**
   * Snap a point to the grid and nearby shapes
   */
  snapPoint(x: number, y: number, excludeShapeIds: string[] = []): SnapResult {
    if (!this.config.enabled) {
      return {
        x,
        y,
        snappedX: false,
        snappedY: false,
        snapPointsX: [],
        snapPointsY: [],
      };
    }

    const threshold = this.getEffectiveThreshold();
    const snapPointsX: SnapPoint[] = [];
    const snapPointsY: SnapPoint[] = [];

    // Collect all potential snap points
    if (this.config.snapToGrid) {
      this.addGridSnapPoints(x, y, threshold, snapPointsX, snapPointsY);
    }

    if (this.config.snapToShapes) {
      this.addShapeSnapPoints(
        x,
        y,
        threshold,
        excludeShapeIds,
        snapPointsX,
        snapPointsY
      );
    }

    // Find best snap points
    const bestSnapX = this.findBestSnapPoint(x, snapPointsX);
    const bestSnapY = this.findBestSnapPoint(y, snapPointsY);

    return {
      x: bestSnapX ? bestSnapX.x : x,
      y: bestSnapY ? bestSnapY.y : y,
      snappedX: bestSnapX !== null,
      snappedY: bestSnapY !== null,
      snapPointsX: snapPointsX.filter((p) => Math.abs(p.x - x) <= threshold),
      snapPointsY: snapPointsY.filter((p) => Math.abs(p.y - y) <= threshold),
    };
  }

  /**
   * Snap a rectangular selection/shape
   */
  snapRectangle(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    excludeShapeIds: string[] = []
  ): {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    snapped: boolean;
  } {
    if (!this.config.enabled) {
      return { x1, y1, x2, y2, snapped: false };
    }

    // Try snapping all four corners and edges
    const centerX = (x1 + x2) / 2;
    const centerY = (y1 + y2) / 2;

    const snapResults = [
      this.snapPoint(x1, y1, excludeShapeIds), // Top-left
      this.snapPoint(x2, y2, excludeShapeIds), // Bottom-right
      this.snapPoint(centerX, centerY, excludeShapeIds), // Center
    ];

    // Find the best snap result (prioritize by number of snaps)
    const bestResult = snapResults.reduce((best, current) => {
      const currentSnaps =
        (current.snappedX ? 1 : 0) + (current.snappedY ? 1 : 0);
      const bestSnaps = (best.snappedX ? 1 : 0) + (best.snappedY ? 1 : 0);
      return currentSnaps > bestSnaps ? current : best;
    });

    if (!bestResult.snappedX && !bestResult.snappedY) {
      return { x1, y1, x2, y2, snapped: false };
    }

    // Apply the snap offset
    const deltaX = bestResult.snappedX ? bestResult.x - centerX : 0;
    const deltaY = bestResult.snappedY ? bestResult.y - centerY : 0;

    return {
      x1: x1 + deltaX,
      y1: y1 + deltaY,
      x2: x2 + deltaX,
      y2: y2 + deltaY,
      snapped: true,
    };
  }

  /**
   * Add grid snap points
   */
  private addGridSnapPoints(
    x: number,
    y: number,
    threshold: number,
    snapPointsX: SnapPoint[],
    snapPointsY: SnapPoint[]
  ): void {
    const gridSize = this.config.gridSize;

    // Find nearest grid lines
    const nearestGridX = Math.round(x / gridSize) * gridSize;
    const nearestGridY = Math.round(y / gridSize) * gridSize;

    if (Math.abs(x - nearestGridX) <= threshold) {
      snapPointsX.push({
        x: nearestGridX,
        y: y,
        type: "grid",
        priority: this.config.prioritizeGrid ? 1 : 2,
      });
    }

    if (Math.abs(y - nearestGridY) <= threshold) {
      snapPointsY.push({
        x: x,
        y: nearestGridY,
        type: "grid",
        priority: this.config.prioritizeGrid ? 1 : 2,
      });
    }
  }

  /**
   * Add shape snap points
   */
  private addShapeSnapPoints(
    x: number,
    y: number,
    threshold: number,
    excludeShapeIds: string[],
    snapPointsX: SnapPoint[],
    snapPointsY: SnapPoint[]
  ): void {
    for (const shape of this.shapes) {
      if (excludeShapeIds.includes(shape.id)) {
        continue;
      }

      const shapeSnapPoints = this.getShapeSnapPoints(shape);

      // Check X coordinates
      for (const snapPoint of shapeSnapPoints) {
        if (Math.abs(x - snapPoint.x) <= threshold) {
          snapPointsX.push({
            ...snapPoint,
            y: y,
            shapeId: shape.id,
          });
        }

        if (Math.abs(y - snapPoint.y) <= threshold) {
          snapPointsY.push({
            ...snapPoint,
            x: x,
            shapeId: shape.id,
          });
        }
      }
    }
  }

  /**
   * Get snap points for a shape
   */
  private getShapeSnapPoints(shape: Shape): SnapPoint[] {
    const points: SnapPoint[] = [];

    const minX = Math.min(shape.x1, shape.x2);
    const maxX = Math.max(shape.x1, shape.x2);
    const minY = Math.min(shape.y1, shape.y2);
    const maxY = Math.max(shape.y1, shape.y2);
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;

    // Corners
    points.push(
      { x: minX, y: minY, type: "shape-edge", priority: 2 },
      { x: maxX, y: minY, type: "shape-edge", priority: 2 },
      { x: minX, y: maxY, type: "shape-edge", priority: 2 },
      { x: maxX, y: maxY, type: "shape-edge", priority: 2 }
    );

    // Center
    points.push({ x: centerX, y: centerY, type: "shape-center", priority: 3 });

    // Midpoints of edges
    points.push(
      { x: centerX, y: minY, type: "shape-midpoint", priority: 3 }, // Top center
      { x: centerX, y: maxY, type: "shape-midpoint", priority: 3 }, // Bottom center
      { x: minX, y: centerY, type: "shape-midpoint", priority: 3 }, // Left center
      { x: maxX, y: centerY, type: "shape-midpoint", priority: 3 } // Right center
    );

    return points;
  }

  /**
   * Find the best snap point from a list
   */
  private findBestSnapPoint(
    coordinate: number,
    snapPoints: SnapPoint[]
  ): SnapPoint | null {
    if (snapPoints.length === 0) {
      return null;
    }

    // Sort by priority first, then by distance
    const sortedPoints = snapPoints.sort((a, b) => {
      if (a.priority !== b.priority) {
        return a.priority - b.priority; // Lower priority number = higher priority
      }

      const distanceA = Math.abs(a.x - coordinate) + Math.abs(a.y - coordinate);
      const distanceB = Math.abs(b.x - coordinate) + Math.abs(b.y - coordinate);
      return distanceA - distanceB;
    });

    return sortedPoints[0] || null;
  }

  /**
   * Get snap guides for rendering
   */
  getSnapGuides(snapResult: SnapResult): Array<{
    type: "vertical" | "horizontal";
    coordinate: number;
    color: string;
    opacity: number;
  }> {
    if (!this.config.showGuides) {
      return [];
    }

    const guides: Array<{
      type: "vertical" | "horizontal";
      coordinate: number;
      color: string;
      opacity: number;
    }> = [];

    // Add vertical guides
    for (const snapPoint of snapResult.snapPointsX) {
      guides.push({
        type: "vertical",
        coordinate: snapPoint.x,
        color: this.getSnapPointColor(snapPoint.type),
        opacity: 0.8,
      });
    }

    // Add horizontal guides
    for (const snapPoint of snapResult.snapPointsY) {
      guides.push({
        type: "horizontal",
        coordinate: snapPoint.y,
        color: this.getSnapPointColor(snapPoint.type),
        opacity: 0.8,
      });
    }

    return guides;
  }

  /**
   * Get color for snap point type
   */
  private getSnapPointColor(type: SnapPoint["type"]): string {
    switch (type) {
      case "grid":
        return "#007bff"; // Blue for grid
      case "shape-edge":
        return "#dc3545"; // Red for shape edges
      case "shape-center":
        return "#28a745"; // Green for shape centers
      case "shape-midpoint":
        return "#ffc107"; // Yellow for shape midpoints
      default:
        return "#6c757d"; // Gray fallback
    }
  }

  /**
   * Check if snapping is enabled
   */
  isEnabled(): boolean {
    return this.config.enabled;
  }

  /**
   * Get current configuration
   */
  getConfig(): GridSnappingConfig {
    return { ...this.config };
  }
}
