import React from "react";
import { BaseShapePlugin } from "../base/BaseShapePlugin";
import { BaseShape, ShapeRenderContext } from "../types";

/**
 * Rectangle shape plugin implementation
 */
export class RectangleShapePlugin extends BaseShapePlugin {
  readonly type = "rectangle";
  readonly name = "Rectangle";
  readonly description = "Create rectangular shapes";
  readonly icon = "square";

  /**
   * Get default properties for rectangles
   */
  getDefaultProperties(): Partial<BaseShape> {
    return {
      borderRadius: 0,
      backgroundColor: "#ffffff",
      borderColor: "#000000",
      borderWidth: 1,
      borderStyle: "solid",
    };
  }

  /**
   * Render the rectangle shape
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
        data-shape-type="rectangle"
        data-shape-id={shape.id}
      />
    );
  }

  /**
   * Validate rectangle-specific properties
   */
  validate(shape: BaseShape): boolean {
    if (!super.validate(shape)) {
      return false;
    }

    // Rectangle-specific validation
    if (
      shape.borderRadius !== undefined &&
      (typeof shape.borderRadius !== "number" || shape.borderRadius < 0)
    ) {
      return false;
    }

    return true;
  }

  /**
   * Get snap points for rectangle (corners and midpoints)
   */
  getSnapPoints(shape: BaseShape) {
    return super.getSnapPoints(shape);
  }
}

// Export singleton instance
export const rectangleShapePlugin = new RectangleShapePlugin();
