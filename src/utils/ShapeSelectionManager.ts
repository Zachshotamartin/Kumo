import { Shape } from "../classes/shape";

export interface SelectionBounds {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
}

export interface SelectionResult {
  selectedShapes: string[];
  action: "select" | "deselect" | "add" | "clear" | "highlight";
  bounds?: SelectionBounds;
}

export enum SelectionMode {
  SINGLE = "single",
  MULTI = "multi",
  ADDITIVE = "additive",
}

/**
 * Centralized shape selection manager
 * Handles all selection logic in a predictable, testable way
 */
export class ShapeSelectionManager {
  private currentSelection: Set<string> = new Set();
  private selectionBounds: SelectionBounds | null = null;

  /**
   * Handle mouse click on canvas/shape with selection priority rules
   */
  handleClick(
    point: { x: number; y: number },
    shapes: Shape[],
    options: {
      shiftKey?: boolean;
      currentSelection?: string[];
      selectionBounds?: SelectionBounds;
    } = {}
  ): SelectionResult {
    const {
      shiftKey = false,
      currentSelection = [],
      selectionBounds,
    } = options;

    // Update internal state
    this.currentSelection = new Set(currentSelection);
    this.selectionBounds = selectionBounds || null;

    // Apply selection priority rules
    return this.applySelectionPriority(point, shapes, shiftKey);
  }

  /**
   * Apply selection priority rules based on current selection state
   */
  private applySelectionPriority(
    point: { x: number; y: number },
    shapes: Shape[],
    shiftKey: boolean
  ): SelectionResult {
    const shapeAtPoint = this.findShapeAtPoint(point, shapes);
    const isGroupSelected = this.currentSelection.size > 1;
    const isWithinSelectionBounds =
      this.selectionBounds && this.isPointInSelectionBounds(point);

    // Scenario 1: No current selection
    if (this.currentSelection.size === 0) {
      if (!shapeAtPoint) {
        return this.handleCanvasClick(point, shiftKey);
      }
      return this.handleShapeClick(shapeAtPoint, shiftKey);
    }

    // Scenario 2: Group currently selected
    if (isGroupSelected) {
      // If clicking within group bounds
      if (isWithinSelectionBounds) {
        // ANY click within group bounds preserves group selection
        // This prevents individual selection of group members
        return {
          selectedShapes: Array.from(this.currentSelection),
          action: "select",
        };
      }

      // Outside group border - only allow selection of shapes NOT in current group
      if (shapeAtPoint && !this.currentSelection.has(shapeAtPoint.id)) {
        // Shape outside group - allow individual selection
        return this.handleShapeClick(shapeAtPoint, shiftKey);
      }

      // Clicking on canvas outside group or on a group member outside bounds
      if (!shapeAtPoint) {
        return this.handleCanvasClick(point, shiftKey);
      }

      // Clicking on a group member outside bounds - keep group selected
      return {
        selectedShapes: Array.from(this.currentSelection),
        action: "select",
      };
    }

    // Scenario 3: Individual shape currently selected
    if (!shapeAtPoint) {
      return this.handleCanvasClick(point, shiftKey);
    }
    return this.handleShapeClick(shapeAtPoint, shiftKey);
  }

  /**
   * Handle click on empty canvas
   */
  private handleCanvasClick(
    point: { x: number; y: number },
    shiftKey: boolean
  ): SelectionResult {
    if (this.selectionBounds && this.isPointInSelectionBounds(point)) {
      // Clicking inside selection bounds - start move
      return {
        selectedShapes: Array.from(this.currentSelection),
        action: "select",
      };
    }

    if (!shiftKey) {
      // Clear selection and start highlighting
      this.currentSelection.clear();
      return {
        selectedShapes: [],
        action: "clear",
      };
    }

    // Shift+click on canvas - maintain selection
    return {
      selectedShapes: Array.from(this.currentSelection),
      action: "select",
    };
  }

  /**
   * Handle click on shape
   */
  private handleShapeClick(shape: Shape, shiftKey: boolean): SelectionResult {
    const isSelected = this.currentSelection.has(shape.id);

    if (shiftKey) {
      // Additive selection
      if (isSelected) {
        this.currentSelection.delete(shape.id);
        return {
          selectedShapes: Array.from(this.currentSelection),
          action: "deselect",
        };
      } else {
        this.currentSelection.add(shape.id);
        return {
          selectedShapes: Array.from(this.currentSelection),
          action: "add",
        };
      }
    } else {
      // Single selection - always select only this shape
      this.currentSelection.clear();
      this.currentSelection.add(shape.id);
      return {
        selectedShapes: [shape.id],
        action: "select",
      };
    }
  }

  /**
   * Handle highlighting/selection box
   */
  handleHighlight(
    startPoint: { x: number; y: number },
    endPoint: { x: number; y: number },
    shapes: Shape[],
    shiftKey: boolean = false
  ): SelectionResult {
    const highlightBounds = {
      startX: Math.min(startPoint.x, endPoint.x),
      startY: Math.min(startPoint.y, endPoint.y),
      endX: Math.max(startPoint.x, endPoint.x),
      endY: Math.max(startPoint.y, endPoint.y),
    };

    const shapesInBounds = this.findShapesInBounds(highlightBounds, shapes);

    if (!shiftKey) {
      // Replace selection
      this.currentSelection = new Set(shapesInBounds.map((s) => s.id));
    } else {
      // Add to selection
      shapesInBounds.forEach((shape) => this.currentSelection.add(shape.id));
    }

    return {
      selectedShapes: Array.from(this.currentSelection),
      action: "highlight",
      bounds: highlightBounds,
    };
  }

  /**
   * Check if point is in resize handle area
   */
  isPointInResizeHandle(
    point: { x: number; y: number },
    bounds: SelectionBounds,
    threshold: number = 10
  ): {
    isResize: boolean;
    direction: string | null;
  } {
    const { startX, startY, endX, endY } = bounds;

    // Check corners first (higher priority)
    if (this.isWithinThreshold(point, { x: endX, y: endY }, threshold)) {
      return { isResize: true, direction: "bottom-right" };
    }
    if (this.isWithinThreshold(point, { x: startX, y: endY }, threshold)) {
      return { isResize: true, direction: "bottom-left" };
    }
    if (this.isWithinThreshold(point, { x: endX, y: startY }, threshold)) {
      return { isResize: true, direction: "top-right" };
    }
    if (this.isWithinThreshold(point, { x: startX, y: startY }, threshold)) {
      return { isResize: true, direction: "top-left" };
    }

    // Check edges
    if (this.isOnEdge(point, { x: endX, y1: startY, y2: endY }, threshold)) {
      return { isResize: true, direction: "right" };
    }
    if (this.isOnEdge(point, { x: startX, y1: startY, y2: endY }, threshold)) {
      return { isResize: true, direction: "left" };
    }
    if (
      this.isOnHorizontalEdge(
        point,
        { y: endY, x1: startX, x2: endX },
        threshold
      )
    ) {
      return { isResize: true, direction: "bottom" };
    }
    if (
      this.isOnHorizontalEdge(
        point,
        { y: startY, x1: startX, x2: endX },
        threshold
      )
    ) {
      return { isResize: true, direction: "top" };
    }

    return { isResize: false, direction: null };
  }

  /**
   * Find topmost shape at point (considering z-index and component membership)
   */
  private findShapeAtPoint(
    point: { x: number; y: number },
    shapes: Shape[]
  ): Shape | null {
    // Filter shapes that contain the point, including component child shapes
    const shapesAtPoint = this.findAllShapesAtPoint(point, shapes);

    if (shapesAtPoint.length === 0) {
      return null;
    }

    // Sort by z-index (highest first), then by component priority
    shapesAtPoint.sort((a, b) => {
      const aZIndex = a.zIndex ?? 0;
      const bZIndex = b.zIndex ?? 0;

      if (aZIndex !== bZIndex) {
        return bZIndex - aZIndex; // Higher z-index first
      }

      // If z-index is equal, prefer individual shapes over component children
      const aIsComponent = a.type === "component";
      const bIsComponent = b.type === "component";

      if (aIsComponent && !bIsComponent) return 1; // b wins (individual)
      if (!aIsComponent && bIsComponent) return -1; // a wins (individual)

      return 0; // Equal priority
    });

    return shapesAtPoint[0] || null;
  }

  /**
   * Find all shapes at point, including component child shapes
   */
  private findAllShapesAtPoint(
    point: { x: number; y: number },
    shapes: Shape[]
  ): Shape[] {
    const result: Shape[] = [];

    shapes.forEach((shape) => {
      if (shape.type === "component" && shape.shapes) {
        // Check component bounds first
        if (this.isPointInShape(point, shape)) {
          // Check if point hits any child shape
          const hitChild = shape.shapes.find((childShape) =>
            this.isPointInShape(point, childShape)
          );

          if (hitChild) {
            // Point hits a child shape - return the component
            result.push(shape);
          }
        }
      } else {
        // Regular shape
        if (this.isPointInShape(point, shape)) {
          result.push(shape);
        }
      }
    });

    return result;
  }

  /**
   * Find all shapes within highlighting bounds
   */
  private findShapesInBounds(
    bounds: SelectionBounds,
    shapes: Shape[]
  ): Shape[] {
    return shapes.filter((shape) => this.isShapeInBounds(shape, bounds));
  }

  /**
   * Check if point is within shape bounds
   */
  private isPointInShape(
    point: { x: number; y: number },
    shape: Shape
  ): boolean {
    const minX = Math.min(shape.x1, shape.x2);
    const maxX = Math.max(shape.x1, shape.x2);
    const minY = Math.min(shape.y1, shape.y2);
    const maxY = Math.max(shape.y1, shape.y2);

    return (
      point.x >= minX && point.x <= maxX && point.y >= minY && point.y <= maxY
    );
  }

  /**
   * Check if shape overlaps with selection bounds
   */
  private isShapeInBounds(shape: Shape, bounds: SelectionBounds): boolean {
    const shapeMinX = Math.min(shape.x1, shape.x2);
    const shapeMaxX = Math.max(shape.x1, shape.x2);
    const shapeMinY = Math.min(shape.y1, shape.y2);
    const shapeMaxY = Math.max(shape.y1, shape.y2);

    // Check if shape overlaps with bounds
    return !(
      shapeMaxX < bounds.startX ||
      shapeMinX > bounds.endX ||
      shapeMaxY < bounds.startY ||
      shapeMinY > bounds.endY
    );
  }

  /**
   * Check if point is in current selection bounds
   */
  private isPointInSelectionBounds(point: { x: number; y: number }): boolean {
    if (!this.selectionBounds) return false;

    const { startX, startY, endX, endY } = this.selectionBounds;
    return (
      point.x >= startX &&
      point.x <= endX &&
      point.y >= startY &&
      point.y <= endY
    );
  }

  /**
   * Helper: Check if point is within threshold distance of target
   */
  private isWithinThreshold(
    point: { x: number; y: number },
    target: { x: number; y: number },
    threshold: number
  ): boolean {
    const dx = Math.abs(point.x - target.x);
    const dy = Math.abs(point.y - target.y);
    return dx <= threshold && dy <= threshold;
  }

  /**
   * Helper: Check if point is on vertical edge
   */
  private isOnEdge(
    point: { x: number; y: number },
    edge: { x: number; y1: number; y2: number },
    threshold: number
  ): boolean {
    return (
      Math.abs(point.x - edge.x) <= threshold &&
      point.y >= edge.y1 &&
      point.y <= edge.y2
    );
  }

  /**
   * Helper: Check if point is on horizontal edge
   */
  private isOnHorizontalEdge(
    point: { x: number; y: number },
    edge: { y: number; x1: number; x2: number },
    threshold: number
  ): boolean {
    return (
      Math.abs(point.y - edge.y) <= threshold &&
      point.x >= edge.x1 &&
      point.x <= edge.x2
    );
  }

  /**
   * Clear current selection
   */
  clearSelection(): SelectionResult {
    this.currentSelection.clear();
    this.selectionBounds = null;
    return {
      selectedShapes: [],
      action: "clear",
    };
  }

  /**
   * Get current selection
   */
  getCurrentSelection(): string[] {
    return Array.from(this.currentSelection);
  }
}
