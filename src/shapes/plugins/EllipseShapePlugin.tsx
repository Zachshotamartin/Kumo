import React from "react";
import { BaseShapePlugin } from "../base/BaseShapePlugin";
import { BaseShape, ShapeRenderContext, Point } from "../types";

/**
 * Ellipse shape plugin implementation
 */
export class EllipseShapePlugin extends BaseShapePlugin {
  readonly type = "ellipse";
  readonly name = "Ellipse";
  readonly description = "Create elliptical and circular shapes";
  readonly icon = "circle";

  /**
   * Get default properties for ellipses
   */
  getDefaultProperties(): Partial<BaseShape> {
    return {
      borderRadius: 1000, // Makes it fully rounded
      backgroundColor: "#ffffff",
      borderColor: "#000000",
      borderWidth: 1,
      borderStyle: "solid",
    };
  }

  /**
   * Render the ellipse shape
   */
  render(context: ShapeRenderContext): React.ReactElement {
    const { shape, onMouseEnter, onMouseLeave } = context;
    const style = this.getComputedStyle(shape, context);

    const handleMouseEnter = () => {
      if (onMouseEnter && shape.level === 0) {
        onMouseEnter(shape);
      }
    };

    const handleMouseLeave = () => {
      if (onMouseLeave && shape.level === 0) {
        onMouseLeave();
      }
    };

    return (
      <div
        key={shape.id}
        style={style}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        data-shape-type="ellipse"
        data-shape-id={shape.id}
      />
    );
  }

  /**
   * Validate ellipse-specific properties
   */
  validate(shape: BaseShape): boolean {
    if (!super.validate(shape)) {
      return false;
    }

    // Ellipse should have high border radius to be circular
    if (shape.borderRadius !== undefined && shape.borderRadius < 50) {
      console.warn(
        "Ellipse should have borderRadius >= 50 for proper circular appearance"
      );
    }

    return true;
  }

  /**
   * Check if point is within ellipse (more precise than rectangular bounds)
   */
  protected isPointInShape(point: Point, shape: BaseShape): boolean {
    const bounds = this.getBounds(shape);
    const centerX = bounds.x + bounds.width / 2;
    const centerY = bounds.y + bounds.height / 2;
    const radiusX = bounds.width / 2;
    const radiusY = bounds.height / 2;

    // Use ellipse equation: (x-h)²/a² + (y-k)²/b² <= 1
    const normalizedX = (point.x - centerX) / radiusX;
    const normalizedY = (point.y - centerY) / radiusY;

    return normalizedX * normalizedX + normalizedY * normalizedY <= 1;
  }

  /**
   * Get snap points for ellipse (center and cardinal points)
   */
  getSnapPoints(shape: BaseShape): Point[] {
    const bounds = this.getBounds(shape);
    const centerX = bounds.x + bounds.width / 2;
    const centerY = bounds.y + bounds.height / 2;
    const radiusX = bounds.width / 2;
    const radiusY = bounds.height / 2;

    return [
      // Center
      { x: centerX, y: centerY },
      // Cardinal points (top, right, bottom, left)
      { x: centerX, y: bounds.y },
      { x: bounds.x + bounds.width, y: centerY },
      { x: centerX, y: bounds.y + bounds.height },
      { x: bounds.x, y: centerY },
      // Additional points for better snapping
      { x: bounds.x, y: bounds.y },
      { x: bounds.x + bounds.width, y: bounds.y },
      { x: bounds.x, y: bounds.y + bounds.height },
      { x: bounds.x + bounds.width, y: bounds.y + bounds.height },
    ];
  }
}

// Export singleton instance
export const ellipseShapePlugin = new EllipseShapePlugin();
