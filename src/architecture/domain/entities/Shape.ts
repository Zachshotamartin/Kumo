/**
 * Domain Entity: Shape
 *
 * Pure business object representing a shape in the whiteboard.
 * Contains only business rules and data, no UI or infrastructure concerns.
 */

export interface Point {
  x: number;
  y: number;
}

export interface Bounds {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  width: number;
  height: number;
}

export interface ShapeStyle {
  backgroundColor?: string;
  borderColor?: string;
  borderWidth?: number;
  borderStyle?: "solid" | "dashed" | "dotted";
  borderRadius?: number;
  opacity?: number;
}

export interface TextStyle {
  fontSize?: number;
  fontFamily?: string;
  fontWeight?: "normal" | "bold";
  textAlign?: "left" | "center" | "right";
  color?: string;
  textDecoration?: "none" | "underline" | "line-through";
  lineHeight?: number;
  letterSpacing?: number;
}

export type ShapeType =
  | "rectangle"
  | "ellipse"
  | "text"
  | "image"
  | "calendar"
  | "component";

/**
 * Core Shape entity with business logic
 */
export class Shape {
  public readonly id: string;
  public readonly type: ShapeType;
  public readonly bounds: Bounds;
  public readonly style: ShapeStyle;
  public readonly textStyle?: TextStyle;
  public readonly text?: string;
  public readonly imageUrl?: string;
  public readonly level: number;
  public readonly zIndex: number;
  public readonly children?: Shape[];

  // Business rules
  public readonly isVisible: boolean;
  public readonly isSelectable: boolean;
  public readonly isEditable: boolean;

  constructor(params: {
    id: string;
    type: ShapeType;
    bounds: Bounds;
    style?: ShapeStyle;
    textStyle?: TextStyle;
    text?: string;
    imageUrl?: string;
    level?: number;
    zIndex?: number;
    children?: Shape[];
  }) {
    this.id = params.id;
    this.type = params.type;
    this.bounds = params.bounds;
    this.style = params.style || {};
    this.textStyle = params.textStyle;
    this.text = params.text;
    this.imageUrl = params.imageUrl;
    this.level = params.level || 0;
    this.zIndex = params.zIndex || 0;
    this.children = params.children;

    // Business rules
    this.isVisible = this.calculateVisibility();
    this.isSelectable = this.level === 0; // Only top-level shapes are selectable
    this.isEditable = this.type !== "component" || this.children?.length === 0;
  }

  // ===================
  // BUSINESS METHODS
  // ===================

  /**
   * Check if this shape contains a point
   */
  containsPoint(point: Point): boolean {
    return (
      point.x >= this.bounds.x1 &&
      point.x <= this.bounds.x2 &&
      point.y >= this.bounds.y1 &&
      point.y <= this.bounds.y2
    );
  }

  /**
   * Check if this shape intersects with another shape
   */
  intersectsWith(other: Shape): boolean {
    return !(
      this.bounds.x2 < other.bounds.x1 ||
      this.bounds.x1 > other.bounds.x2 ||
      this.bounds.y2 < other.bounds.y1 ||
      this.bounds.y1 > other.bounds.y2
    );
  }

  /**
   * Check if this shape is completely inside another shape
   */
  isInsideOf(other: Shape): boolean {
    return (
      this.bounds.x1 >= other.bounds.x1 &&
      this.bounds.x2 <= other.bounds.x2 &&
      this.bounds.y1 >= other.bounds.y1 &&
      this.bounds.y2 <= other.bounds.y2
    );
  }

  /**
   * Get the center point of the shape
   */
  getCenter(): Point {
    return {
      x: (this.bounds.x1 + this.bounds.x2) / 2,
      y: (this.bounds.y1 + this.bounds.y2) / 2,
    };
  }

  /**
   * Get the area of the shape
   */
  getArea(): number {
    return this.bounds.width * this.bounds.height;
  }

  /**
   * Check if the shape is valid according to business rules
   */
  isValid(): boolean {
    // Basic validation rules
    if (this.bounds.width <= 0 || this.bounds.height <= 0) {
      return false;
    }

    if (this.type === "text" && !this.text) {
      return false;
    }

    if (this.type === "image" && !this.imageUrl) {
      return false;
    }

    if (
      this.type === "component" &&
      (!this.children || this.children.length === 0)
    ) {
      return false;
    }

    return true;
  }

  /**
   * Create a new shape with updated bounds
   */
  withBounds(newBounds: Bounds): Shape {
    return new Shape({
      id: this.id,
      type: this.type,
      bounds: newBounds,
      style: this.style,
      textStyle: this.textStyle,
      text: this.text,
      imageUrl: this.imageUrl,
      level: this.level,
      zIndex: this.zIndex,
      children: this.children,
    });
  }

  /**
   * Create a new shape with updated style
   */
  withStyle(newStyle: Partial<ShapeStyle>): Shape {
    return new Shape({
      id: this.id,
      type: this.type,
      bounds: this.bounds,
      style: { ...this.style, ...newStyle },
      textStyle: this.textStyle,
      text: this.text,
      imageUrl: this.imageUrl,
      level: this.level,
      zIndex: this.zIndex,
      children: this.children,
    });
  }

  /**
   * Create a new shape with updated z-index
   */
  withZIndex(newZIndex: number): Shape {
    return new Shape({
      id: this.id,
      type: this.type,
      bounds: this.bounds,
      style: this.style,
      textStyle: this.textStyle,
      text: this.text,
      imageUrl: this.imageUrl,
      level: this.level,
      zIndex: newZIndex,
      children: this.children?.map((child) =>
        child.withZIndex(child.zIndex + newZIndex - this.zIndex)
      ),
    });
  }

  /**
   * Create a new shape moved by a delta
   */
  move(deltaX: number, deltaY: number): Shape {
    const newBounds: Bounds = {
      x1: this.bounds.x1 + deltaX,
      y1: this.bounds.y1 + deltaY,
      x2: this.bounds.x2 + deltaX,
      y2: this.bounds.y2 + deltaY,
      width: this.bounds.width,
      height: this.bounds.height,
    };

    return new Shape({
      id: this.id,
      type: this.type,
      bounds: newBounds,
      style: this.style,
      textStyle: this.textStyle,
      text: this.text,
      imageUrl: this.imageUrl,
      level: this.level,
      zIndex: this.zIndex,
      children: this.children?.map((child) => child.move(deltaX, deltaY)),
    });
  }

  /**
   * Create a new shape with updated text
   */
  withText(newText: string): Shape {
    if (this.type !== "text") {
      throw new Error("Cannot set text on non-text shape");
    }

    return new Shape({
      id: this.id,
      type: this.type,
      bounds: this.bounds,
      style: this.style,
      textStyle: this.textStyle,
      text: newText,
      imageUrl: this.imageUrl,
      level: this.level,
      zIndex: this.zIndex,
      children: this.children,
    });
  }

  /**
   * Convert to component by adding children
   */
  toComponent(children: Shape[]): Shape {
    if (children.length === 0) {
      throw new Error("Component must have at least one child");
    }

    // Calculate new bounds to encompass all children
    const childBounds = children.map((child) => child.bounds);
    const x1 = Math.min(...childBounds.map((b) => b.x1));
    const y1 = Math.min(...childBounds.map((b) => b.y1));
    const x2 = Math.max(...childBounds.map((b) => b.x2));
    const y2 = Math.max(...childBounds.map((b) => b.y2));

    const componentBounds: Bounds = {
      x1,
      y1,
      x2,
      y2,
      width: x2 - x1,
      height: y2 - y1,
    };

    return new Shape({
      id: this.id,
      type: "component",
      bounds: componentBounds,
      style: { backgroundColor: "transparent" },
      level: this.level,
      zIndex: Math.max(...children.map((c) => c.zIndex)) + 1,
      children: children.map(
        (child) =>
          new Shape({
            ...child,
            level: child.level + 1,
          })
      ),
    });
  }

  /**
   * Flatten component into individual shapes
   */
  flatten(): Shape[] {
    if (this.type !== "component" || !this.children) {
      return [this];
    }

    return this.children.flatMap((child) => child.flatten());
  }

  // ===================
  // PRIVATE METHODS
  // ===================

  private calculateVisibility(): boolean {
    // Business rule: Shapes are visible if they have valid bounds and are not at negative level
    return this.bounds.width > 0 && this.bounds.height > 0 && this.level >= 0;
  }

  // ===================
  // SERIALIZATION
  // ===================

  /**
   * Convert to plain object for serialization
   */
  toPlainObject(): any {
    return {
      id: this.id,
      type: this.type,
      x1: this.bounds.x1,
      y1: this.bounds.y1,
      x2: this.bounds.x2,
      y2: this.bounds.y2,
      width: this.bounds.width,
      height: this.bounds.height,
      level: this.level,
      zIndex: this.zIndex,
      text: this.text,
      imageUrl: this.imageUrl,
      ...this.style,
      ...this.textStyle,
      shapes: this.children?.map((child) => child.toPlainObject()),
    };
  }

  /**
   * Create from plain object
   */
  static fromPlainObject(obj: any): Shape {
    const bounds: Bounds = {
      x1: obj.x1,
      y1: obj.y1,
      x2: obj.x2,
      y2: obj.y2,
      width: obj.width || obj.x2 - obj.x1,
      height: obj.height || obj.y2 - obj.y1,
    };

    const style: ShapeStyle = {
      backgroundColor: obj.backgroundColor,
      borderColor: obj.borderColor,
      borderWidth: obj.borderWidth,
      borderStyle: obj.borderStyle,
      borderRadius: obj.borderRadius,
      opacity: obj.opacity,
    };

    const textStyle: TextStyle = {
      fontSize: obj.fontSize,
      fontFamily: obj.fontFamily,
      fontWeight: obj.fontWeight,
      textAlign: obj.textAlign,
      color: obj.color,
      textDecoration: obj.textDecoration,
      lineHeight: obj.lineHeight,
      letterSpacing: obj.letterSpacing,
    };

    const children = obj.shapes?.map((childObj: any) =>
      Shape.fromPlainObject(childObj)
    );

    return new Shape({
      id: obj.id,
      type: obj.type,
      bounds,
      style,
      textStyle,
      text: obj.text,
      imageUrl: obj.imageUrl,
      level: obj.level || 0,
      zIndex: obj.zIndex || 0,
      children,
    });
  }
}
