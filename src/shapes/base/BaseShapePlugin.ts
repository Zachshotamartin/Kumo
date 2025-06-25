import React from "react";
import {
  ShapePlugin,
  BaseShape,
  ShapeCreationOptions,
  ShapeRenderContext,
  Point,
  ShapeBounds,
} from "../types";

/**
 * Abstract base class for shape plugins.
 * Provides common functionality and sensible defaults.
 */
export abstract class BaseShapePlugin implements ShapePlugin {
  abstract readonly type: string;
  abstract readonly name: string;
  abstract readonly description: string;
  abstract readonly icon: string;

  /**
   * Generate unique ID for shapes
   */
  protected generateId(): string {
    return (
      Math.random().toString(36).substring(2, 10) +
      new Date().getTime().toString(36)
    );
  }

  /**
   * Create a base shape with common properties
   */
  protected createBaseShape(options: ShapeCreationOptions): BaseShape {
    const { x, y, zIndex = 0 } = options;

    return {
      type: this.type,
      id: this.generateId(),

      // Positioning
      x1: x,
      y1: y,
      x2: x,
      y2: y,

      // Dimensions
      width: 0,
      height: 0,

      // Z-index and hierarchy
      zIndex,
      level: 0,

      // Transform properties
      rotation: 0,
      flipX: false,
      flipY: false,

      // Default styling
      borderRadius: 0,
      borderWidth: 0,
      borderStyle: "solid",
      borderColor: "#000000",
      backgroundColor: "#ffffff",
      color: "#000000",
      opacity: 1,

      // Text properties
      fontSize: 12,
      fontFamily: "Arial",
      fontWeight: "normal",
      textAlign: "left",
      alignItems: "flex-start",
      textDecoration: "none",
      lineHeight: 1.2,
      letterSpacing: 0,
      rows: 1,
      text: "",

      // Apply any additional default properties from subclass
      ...this.getDefaultProperties(),
    };
  }

  /**
   * Default implementation of create method
   */
  create(options: ShapeCreationOptions): BaseShape {
    return this.createBaseShape(options);
  }

  /**
   * Default properties specific to each shape type
   * Override in subclasses to provide shape-specific defaults
   */
  getDefaultProperties(): Partial<BaseShape> {
    return {};
  }

  /**
   * Basic validation - checks for required properties
   */
  validate(shape: BaseShape): boolean {
    if (!shape.type || shape.type !== this.type) {
      return false;
    }

    if (!shape.id || typeof shape.id !== "string") {
      return false;
    }

    if (
      typeof shape.x1 !== "number" ||
      typeof shape.y1 !== "number" ||
      typeof shape.x2 !== "number" ||
      typeof shape.y2 !== "number"
    ) {
      return false;
    }

    if (typeof shape.zIndex !== "number" || typeof shape.level !== "number") {
      return false;
    }

    return true;
  }

  /**
   * Abstract render method - must be implemented by subclasses
   */
  abstract render(context: ShapeRenderContext): React.ReactElement;

  /**
   * Default move implementation
   */
  move(shape: BaseShape, offset: Point): BaseShape {
    return {
      ...shape,
      x1: Math.round(shape.x1 + offset.x),
      y1: Math.round(shape.y1 + offset.y),
      x2: Math.round(shape.x2 + offset.x),
      y2: Math.round(shape.y2 + offset.y),
    };
  }

  /**
   * Default resize implementation
   */
  resize(shape: BaseShape, bounds: ShapeBounds, offset: Point): BaseShape {
    const newWidth = Math.round(Math.abs(bounds.width + offset.x));
    const newHeight = Math.round(Math.abs(bounds.height + offset.y));

    return {
      ...shape,
      x2: Math.round(shape.x1 + newWidth),
      y2: Math.round(shape.y1 + newHeight),
      width: newWidth,
      height: newHeight,
    };
  }

  /**
   * Get bounding box of the shape
   */
  getBounds(shape: BaseShape): ShapeBounds {
    return {
      x: Math.round(Math.min(shape.x1, shape.x2)),
      y: Math.round(Math.min(shape.y1, shape.y2)),
      width: Math.round(Math.abs(shape.x2 - shape.x1)),
      height: Math.round(Math.abs(shape.y2 - shape.y1)),
    };
  }

  /**
   * Get snap points for the shape (corners and center by default)
   */
  getSnapPoints(shape: BaseShape): Point[] {
    const bounds = this.getBounds(shape);
    return [
      // Corners
      { x: bounds.x, y: bounds.y },
      { x: bounds.x + bounds.width, y: bounds.y },
      { x: bounds.x, y: bounds.y + bounds.height },
      { x: bounds.x + bounds.width, y: bounds.y + bounds.height },
      // Center
      { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 },
      // Midpoints
      { x: bounds.x + bounds.width / 2, y: bounds.y },
      { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height },
      { x: bounds.x, y: bounds.y + bounds.height / 2 },
      { x: bounds.x + bounds.width, y: bounds.y + bounds.height / 2 },
    ];
  }

  /**
   * Default serialization - just return the shape as-is
   */
  serialize(shape: BaseShape): any {
    return { ...shape };
  }

  /**
   * Default deserialization - validate and return
   */
  deserialize(data: any): BaseShape {
    if (!this.validate(data)) {
      throw new Error(`Invalid shape data for type: ${this.type}`);
    }
    return data as BaseShape;
  }

  /**
   * Utility method to get computed style properties
   */
  protected getComputedStyle(
    shape: BaseShape,
    context: ShapeRenderContext
  ): React.CSSProperties {
    const bounds = this.getBounds(shape);
    const window = context.window;

    return {
      position: "absolute",
      zIndex: context.isSelected ? 50 : shape.zIndex,

      // Position
      top: `${(bounds.y - window.y1) / window.percentZoomed}px`,
      left: `${(bounds.x - window.x1) / window.percentZoomed}px`,

      // Dimensions
      width: `${bounds.width / window.percentZoomed}px`,
      height: `${bounds.height / window.percentZoomed}px`,

      // Transform
      transform: `rotate(${shape.rotation || 0}deg)`,

      // Styling
      borderRadius: `${shape.borderRadius || 0}%`,
      borderWidth: `${(shape.borderWidth || 0) / window.percentZoomed}px`,
      borderStyle: shape.borderStyle || "solid",
      borderColor: shape.borderColor || "#000000",
      backgroundColor: shape.backgroundColor || "transparent",
      opacity: shape.opacity ?? 1,

      // Text styling (if applicable)
      color: shape.color || "#000000",
      fontSize: `${(shape.fontSize || 12) / window.percentZoomed}px`,
      fontFamily: shape.fontFamily || "Arial",
      fontWeight: shape.fontWeight || "normal",
      textAlign: (shape.textAlign as any) || "left",
      alignItems: shape.alignItems || "flex-start",
      textDecoration: shape.textDecoration || "none",
      lineHeight: shape.lineHeight || 1.2,
      letterSpacing: `${(shape.letterSpacing || 0) / window.percentZoomed}px`,

      // Pointer events
      pointerEvents: shape.level === 0 ? "all" : "none",
    };
  }

  /**
   * Utility method to check if a point is within the shape
   */
  protected isPointInShape(point: Point, shape: BaseShape): boolean {
    const bounds = this.getBounds(shape);
    return (
      point.x >= bounds.x &&
      point.x <= bounds.x + bounds.width &&
      point.y >= bounds.y &&
      point.y <= bounds.y + bounds.height
    );
  }

  /**
   * Utility method to calculate distance between two points
   */
  protected calculateDistance(point1: Point, point2: Point): number {
    const dx = point1.x - point2.x;
    const dy = point1.y - point2.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  /**
   * Utility method to normalize bounds (ensure positive width/height)
   */
  protected normalizeBounds(bounds: ShapeBounds): ShapeBounds {
    return {
      x: bounds.width >= 0 ? bounds.x : bounds.x + bounds.width,
      y: bounds.height >= 0 ? bounds.y : bounds.y + bounds.height,
      width: Math.abs(bounds.width),
      height: Math.abs(bounds.height),
    };
  }
}
