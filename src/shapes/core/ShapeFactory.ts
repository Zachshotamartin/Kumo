import {
  ShapeFactory,
  BaseShape,
  ShapeCreationOptions,
  ShapeRegistry,
} from "../types";

/**
 * Factory for creating and manipulating shapes using the registry
 */
export class ShapeFactoryImpl implements ShapeFactory {
  private registry: ShapeRegistry;

  constructor(registry: ShapeRegistry) {
    this.registry = registry;
  }

  /**
   * Create a shape using the registry
   */
  create(type: string, options: ShapeCreationOptions): BaseShape | null {
    return this.registry.createShape(type, options);
  }

  /**
   * Create a shape with default size and position
   */
  createDefault(
    type: string,
    x: number,
    y: number,
    zIndex?: number
  ): BaseShape | null {
    const options: ShapeCreationOptions = {
      x,
      y,
      zIndex: zIndex ?? 0,
      defaultSize: this.getDefaultSize(type),
    };

    return this.create(type, options);
  }

  /**
   * Create a shape with specified dimensions
   */
  createWithDimensions(
    type: string,
    x: number,
    y: number,
    width: number,
    height: number,
    zIndex?: number
  ): BaseShape | null {
    const shape = this.createDefault(type, x, y, zIndex);
    if (!shape) return null;

    return {
      ...shape,
      x2: Math.round(x + width),
      y2: Math.round(y + height),
      width: Math.round(width),
      height: Math.round(height),
    };
  }

  /**
   * Clone an existing shape with new ID
   */
  clone(shape: BaseShape): BaseShape {
    const newId = this.generateId();

    const clonedShape: BaseShape = {
      ...shape,
      id: newId,
    };

    // If the shape has child shapes (component), clone them too
    if (shape.shapes && shape.shapes.length > 0) {
      clonedShape.shapes = shape.shapes.map((childShape) =>
        this.clone(childShape)
      );
    }

    return clonedShape;
  }

  /**
   * Update shape properties
   */
  updateShape(shape: BaseShape, updates: Partial<BaseShape>): BaseShape {
    const updatedShape = { ...shape, ...updates };

    // Update computed properties if position changed (rounded to integers)
    if (
      updates.x1 !== undefined ||
      updates.y1 !== undefined ||
      updates.x2 !== undefined ||
      updates.y2 !== undefined
    ) {
      updatedShape.x1 = Math.round(updatedShape.x1);
      updatedShape.y1 = Math.round(updatedShape.y1);
      updatedShape.x2 = Math.round(updatedShape.x2);
      updatedShape.y2 = Math.round(updatedShape.y2);
      updatedShape.width = Math.abs(updatedShape.x2 - updatedShape.x1);
      updatedShape.height = Math.abs(updatedShape.y2 - updatedShape.y1);
    }

    return updatedShape;
  }

  /**
   * Create a batch of shapes
   */
  createBatch(
    requests: Array<{ type: string; options: ShapeCreationOptions }>
  ): BaseShape[] {
    const shapes: BaseShape[] = [];

    requests.forEach(({ type, options }) => {
      const shape = this.create(type, options);
      if (shape) {
        shapes.push(shape);
      }
    });

    return shapes;
  }

  /**
   * Create a shape with custom properties
   */
  createWithProperties(
    type: string,
    x: number,
    y: number,
    customProperties: Partial<BaseShape>
  ): BaseShape | null {
    const shape = this.createDefault(type, x, y);
    if (!shape) return null;

    return this.updateShape(shape, customProperties);
  }

  /**
   * Create a component/group from multiple shapes
   */
  createComponent(shapes: BaseShape[], zIndex?: number): BaseShape | null {
    if (shapes.length === 0) return null;

    // Calculate bounding box
    const bounds = this.calculateBounds(shapes);

    const componentShape: BaseShape = {
      type: "component",
      id: this.generateId(),
      x1: Math.round(bounds.x1),
      y1: Math.round(bounds.y1),
      x2: Math.round(bounds.x2),
      y2: Math.round(bounds.y2),
      width: Math.round(bounds.x2 - bounds.x1),
      height: Math.round(bounds.y2 - bounds.y1),
      level: 0,
      zIndex: zIndex ?? this.getMaxZIndex(shapes) + 1,

      // Component styling
      backgroundColor: "transparent",
      borderColor: "transparent",
      borderRadius: 0,
      borderStyle: "none",
      borderWidth: 0,
      color: "transparent",
      opacity: 1,

      // Text properties (not used but required by interface)
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

      // Child shapes
      shapes: shapes.map((shape) => ({ ...shape, level: shape.level + 1 })),
    };

    return componentShape;
  }

  /**
   * Extract shapes from a component
   */
  extractFromComponent(component: BaseShape): BaseShape[] {
    if (component.type !== "component" || !component.shapes) {
      return [component];
    }

    return component.shapes.map((shape) => ({
      ...shape,
      level: shape.level - 1,
    }));
  }

  /**
   * Get default size for a shape type
   */
  private getDefaultSize(type: string): { width: number; height: number } {
    switch (type) {
      case "text":
        return { width: 100, height: 30 };
      case "rectangle":
      case "ellipse":
        return { width: 100, height: 100 };
      case "calendar":
      case "image":
        return { width: 150, height: 150 };
      default:
        return { width: 100, height: 100 };
    }
  }

  /**
   * Generate unique ID
   */
  private generateId(): string {
    return (
      Math.random().toString(36).substring(2, 10) +
      new Date().getTime().toString(36)
    );
  }

  /**
   * Calculate bounding box for multiple shapes
   */
  private calculateBounds(shapes: BaseShape[]) {
    const x1 = Math.min(...shapes.map((s) => Math.min(s.x1, s.x2)));
    const y1 = Math.min(...shapes.map((s) => Math.min(s.y1, s.y2)));
    const x2 = Math.max(...shapes.map((s) => Math.max(s.x1, s.x2)));
    const y2 = Math.max(...shapes.map((s) => Math.max(s.y1, s.y2)));

    return { x1, y1, x2, y2 };
  }

  /**
   * Get maximum z-index from shapes
   */
  private getMaxZIndex(shapes: BaseShape[]): number {
    return Math.max(0, ...shapes.map((s) => s.zIndex));
  }

  /**
   * Validate a shape using its plugin
   */
  validateShape(shape: BaseShape): boolean {
    const plugin = this.registry.getPlugin(shape.type);
    return plugin ? plugin.validate(shape) : false;
  }

  /**
   * Get all available shape types from registry
   */
  getAvailableTypes(): string[] {
    return this.registry.getEnabledTypes();
  }

  /**
   * Check if a shape type is available
   */
  isTypeAvailable(type: string): boolean {
    return this.registry.isEnabled(type);
  }
}
