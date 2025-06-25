import calendarImage from "../res/calendar.png";
import image from "../res/image.png";

export interface Shape {
  // type (image, text, calendar, rectangle)
  type: string;
  // positioning
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  id: string;
  // dimensions
  width: number;
  height: number;
  level: number;
  // transforms
  rotation?: number;
  flipX?: boolean;
  flipY?: boolean;
  shapes?: Shape[];
  // box styling
  borderRadius?: number;
  borderWidth?: number;
  borderStyle?: string;

  // text styling
  text?: string;
  fontSize?: number;
  fontFamily?: string;
  fontWeight?: string;
  textAlign?: string;
  alignItems?: string;
  textDecoration?: string;
  lineHeight?: number;
  letterSpacing?: number;
  rows?: number;

  // color styling
  color?: string;
  opacity?: number;
  backgroundColor?: string;
  borderColor?: string;
  backgroundImage?: string;
  zIndex: number;
  // recursive whiteboard
  boardId?: string | null;
  title?: string | null;
  uid?: string | null;
}

export const ShapeFunctions = {
  createShape: (type: string, x: number, y: number, shapes: Shape[]): Shape => {
    // console.log(x, y);
    return {
      // type
      type: type,
      // position
      id:
        Math.random().toString(36).substring(2, 10) +
        new Date().getTime().toString(36),
      x1: x,
      y1: y,
      x2: x,
      y2: y,

      //dimension
      width: 0,
      height: 0,
      level: 0,
      // transform
      rotation: 0,

      // box styling
      borderRadius: type === "ellipse" ? 1000 : 0,
      borderWidth: 0,
      borderStyle: "solid",

      // font styling
      fontSize: 12,
      fontFamily: "Arial",
      fontWeight: "normal",
      textAlign: "left",
      alignItems: "flex-start",
      textDecoration: "none",
      lineHeight: 1.2,
      letterSpacing: 0,
      rows: 1,

      // color
      color: "#ffffff",
      backgroundColor:
        type === "text" || type === "calendar" || type === "image"
          ? "transparent"
          : "#ffffff",
      borderColor: "#000000",
      opacity: 1,
      zIndex: ShapeFunctions.getLargestZIndex(shapes) + 1,
      text: "",
      backgroundImage:
        type === "calendar" ? calendarImage : type === "image" ? image : "",
    };
  },

  getZIndex: (shape: Shape): number => {
    return shape.zIndex;
  },

  getLargestZIndex: (shapes: Shape[]): number => {
    if (shapes.length === 0) {
      return 0;
    } else {
      const largestZIndexShape = shapes.reduce(
        (largest: Shape, shape: Shape) => {
          return shape.zIndex > largest.zIndex ? shape : largest;
        }
      );
      if (largestZIndexShape.shapes === undefined) {
        return largestZIndexShape.zIndex;
      } else {
        return largestZIndexShape.shapes.reduce((largest, shape) => {
          const zIndex = shape.zIndex;
          return zIndex > largest ? zIndex : largest;
        }, 0);
      }
    }
  },
  //   getLargestZIndexShape() {
  //     if (shapes === undefined) {
  //       return this;
  //     } else {
  //       return shapes.reduce((largestShape, shape) => {
  //         const zIndex = shape.getZIndex();
  //         const largestZIndex = largestShape.getZIndex();
  //         return zIndex > largestZIndex ? shape : largestShape;
  //       });
  //     }
  //   }

  updateShape: (shape: Shape, updates: Partial<Shape>): Shape => {
    return { ...shape, ...updates };
  },

  moveShape: (shape: Shape, offsetX: number, offsetY: number): Shape => {
    if (shape.shapes === undefined) {
      return ShapeFunctions.updateShape(shape, {
        x1: Math.round(shape.x1 + offsetX),
        y1: Math.round(shape.y1 + offsetY),
        x2: Math.round(shape.x2 + offsetX),
        y2: Math.round(shape.y2 + offsetY),
      });
    } else {
      return ShapeFunctions.updateShape(shape, {
        x1: Math.round(shape.x1 + offsetX),
        y1: Math.round(shape.y1 + offsetY),
        x2: Math.round(shape.x2 + offsetX),
        y2: Math.round(shape.y2 + offsetY),
        shapes: shape.shapes.map((componentShape: Shape) => {
          return ShapeFunctions.updateShape(componentShape, {
            x1: Math.round(componentShape.x1 + offsetX),
            y1: Math.round(componentShape.y1 + offsetY),
            x2: Math.round(componentShape.x2 + offsetX),
            y2: Math.round(componentShape.y2 + offsetY),
          });
        }),
      });
    }
  },

  resizeShapeSimple: (
    shape: Shape,
    offsetX: number,
    offsetY: number,
    resizingTop: boolean,
    resizingBottom: boolean,
    resizingLeft: boolean,
    resizingRight: boolean
  ): Shape => {
    /*
        Proportional resize approach for groups:
        - Calculate how much the overall group size changes
        - Apply proportional scaling to all shapes within the group
        - Use floating-point math for accurate proportions
        - Round only the final coordinates to integers
    */

    if (shape.shapes === undefined) {
      // Regular shape - simple edge-based resizing
      let x1 = shape.x1;
      let x2 = shape.x2;
      let y1 = shape.y1;
      let y2 = shape.y2;

      // Apply horizontal resizing offsets
      if (resizingLeft) {
        x1 = Math.round(x1 + offsetX);
      }
      if (resizingRight) {
        x2 = Math.round(x2 + offsetX);
      }

      // Apply vertical resizing offsets
      if (resizingTop) {
        y1 = Math.round(y1 + offsetY);
      }
      if (resizingBottom) {
        y2 = Math.round(y2 + offsetY);
      }

      const width = Math.abs(x2 - x1);
      const height = Math.abs(y2 - y1);

      return ShapeFunctions.updateShape(shape, {
        x1,
        y1,
        x2,
        y2,
        width,
        height,
      });
    } else {
      // Component shape - proportional scaling for group resize
      const originalX1 = shape.x1;
      const originalY1 = shape.y1;
      const originalX2 = shape.x2;
      const originalY2 = shape.y2;
      const originalWidth = Math.abs(originalX2 - originalX1);
      const originalHeight = Math.abs(originalY2 - originalY1);

      // Calculate new group bounds based on which edges are being resized
      let newX1 = originalX1;
      let newX2 = originalX2;
      let newY1 = originalY1;
      let newY2 = originalY2;

      if (resizingLeft) {
        newX1 = originalX1 + offsetX;
      }
      if (resizingRight) {
        newX2 = originalX2 + offsetX;
      }
      if (resizingTop) {
        newY1 = originalY1 + offsetY;
      }
      if (resizingBottom) {
        newY2 = originalY2 + offsetY;
      }

      const newWidth = Math.abs(newX2 - newX1);
      const newHeight = Math.abs(newY2 - newY1);

      // Calculate scale factors (floating point for accurate proportions)
      const scaleX = originalWidth > 0 ? newWidth / originalWidth : 1;
      const scaleY = originalHeight > 0 ? newHeight / originalHeight : 1;

      // Determine the transformation origin based on which edges are being resized
      let originX = originalX1; // Default to left edge
      let originY = originalY1; // Default to top edge

      if (resizingRight && !resizingLeft) {
        originX = originalX1; // Scale from left edge
      } else if (resizingLeft && !resizingRight) {
        originX = originalX2; // Scale from right edge
      } else if (resizingLeft && resizingRight) {
        originX = (originalX1 + originalX2) / 2; // Scale from center
      }

      if (resizingBottom && !resizingTop) {
        originY = originalY1; // Scale from top edge
      } else if (resizingTop && !resizingBottom) {
        originY = originalY2; // Scale from bottom edge
      } else if (resizingTop && resizingBottom) {
        originY = (originalY1 + originalY2) / 2; // Scale from center
      }

      // Calculate the new origin position after scaling
      let newOriginX = originX;
      let newOriginY = originY;

      if (resizingLeft && !resizingRight) {
        newOriginX = newX2; // Origin stays at right edge
      } else if (resizingRight && !resizingLeft) {
        newOriginX = newX1; // Origin stays at left edge
      } else if (resizingLeft && resizingRight) {
        newOriginX = (newX1 + newX2) / 2; // Origin at new center
      }

      if (resizingTop && !resizingBottom) {
        newOriginY = newY2; // Origin stays at bottom edge
      } else if (resizingBottom && !resizingTop) {
        newOriginY = newY1; // Origin stays at top edge
      } else if (resizingTop && resizingBottom) {
        newOriginY = (newY1 + newY2) / 2; // Origin at new center
      }

      return ShapeFunctions.updateShape(shape, {
        x1: Math.round(newX1),
        y1: Math.round(newY1),
        x2: Math.round(newX2),
        y2: Math.round(newY2),
        width: Math.round(newWidth),
        height: Math.round(newHeight),
        shapes: shape.shapes.map((componentShape: Shape) => {
          // Calculate the shape's position relative to the origin (floating point)
          const relativeX1 = componentShape.x1 - originX;
          const relativeY1 = componentShape.y1 - originY;
          const relativeX2 = componentShape.x2 - originX;
          const relativeY2 = componentShape.y2 - originY;

          // Apply scaling (floating point)
          const scaledX1 = relativeX1 * scaleX;
          const scaledY1 = relativeY1 * scaleY;
          const scaledX2 = relativeX2 * scaleX;
          const scaledY2 = relativeY2 * scaleY;

          // Calculate final positions (floating point)
          const finalX1 = newOriginX + scaledX1;
          const finalY1 = newOriginY + scaledY1;
          const finalX2 = newOriginX + scaledX2;
          const finalY2 = newOriginY + scaledY2;

          // Round only the final coordinates to integers
          const roundedX1 = Math.round(finalX1);
          const roundedY1 = Math.round(finalY1);
          const roundedX2 = Math.round(finalX2);
          const roundedY2 = Math.round(finalY2);

          return {
            ...componentShape,
            x1: roundedX1,
            y1: roundedY1,
            x2: roundedX2,
            y2: roundedY2,
            width: Math.abs(roundedX2 - roundedX1),
            height: Math.abs(roundedY2 - roundedY1),
          };
        }),
      });
    }
  },

  resizeShape: (
    shape: Shape,
    borderStartX: number,
    borderEndX: number,
    borderStartY: number,
    borderEndY: number,
    offsetX: number,
    offsetY: number,
    resizingTop: boolean,
    resizingBottom: boolean,
    resizingLeft: boolean,
    resizingRight: boolean
  ): Shape & {
    flipStateChanged?: {
      flipX?: boolean;
      flipY?: boolean;
      switchResize?: {
        newResizingLeft?: boolean;
        newResizingRight?: boolean;
        newResizingTop?: boolean;
        newResizingBottom?: boolean;
      };
    };
  } => {
    /*
        Flip-based resizing approach:
        1. Detect when an edge crosses the opposite edge
        2. Flip the shape using flipX/flipY properties
        3. Switch which edge is being resized
        4. Keep coordinates stable to prevent shape movement
        5. All coordinates are rounded to integers
    */
    let x1 = Math.round(shape.x1);
    let x2 = Math.round(shape.x2);
    let y1 = Math.round(shape.y1);
    let y2 = Math.round(shape.y2);
    let flipX = shape.flipX || false;
    let flipY = shape.flipY || false;

    // Track if we need to switch resize directions
    let switchResize: {
      newResizingLeft?: boolean;
      newResizingRight?: boolean;
      newResizingTop?: boolean;
      newResizingBottom?: boolean;
    } = {};
    let flipStateChanged = false;

    const currentWidth = borderEndX - borderStartX;
    const currentHeight = borderEndY - borderStartY;

    // Handle horizontal resizing
    if (resizingRight) {
      const newWidth = currentWidth + offsetX;
      if (newWidth < 0) {
        // Crossed the left edge - flip horizontally and switch to resizing left
        flipX = !flipX;
        flipStateChanged = true;
        switchResize = {
          newResizingLeft: true,
          newResizingRight: false,
          newResizingTop: resizingTop,
          newResizingBottom: resizingBottom,
        };
        // Keep the shape in the same position by adjusting coordinates
        x1 = Math.round(borderStartX);
        x2 = Math.round(borderStartX - newWidth); // newWidth is negative, so this extends to the left
      } else {
        // Normal resize right
        x1 = Math.round(borderStartX);
        x2 = Math.round(borderStartX + newWidth);
      }
    } else if (resizingLeft) {
      const newWidth = currentWidth - offsetX;
      if (newWidth < 0) {
        // Crossed the right edge - flip horizontally and switch to resizing right
        flipX = !flipX;
        flipStateChanged = true;
        switchResize = {
          newResizingLeft: false,
          newResizingRight: true,
          newResizingTop: resizingTop,
          newResizingBottom: resizingBottom,
        };
        // Keep the shape in the same position by adjusting coordinates
        x1 = Math.round(borderEndX + newWidth); // newWidth is negative, so this extends to the right
        x2 = Math.round(borderEndX);
      } else {
        // Normal resize left
        x1 = Math.round(borderStartX + offsetX);
        x2 = Math.round(borderEndX);
      }
    } else {
      // Not resizing horizontally, keep current X coordinates
      x1 = Math.round(borderStartX);
      x2 = Math.round(borderEndX);
    }

    // Handle vertical resizing
    if (resizingBottom) {
      const newHeight = currentHeight + offsetY;
      if (newHeight < 0) {
        // Crossed the top edge - flip vertically and switch to resizing top
        flipY = !flipY;
        flipStateChanged = true;
        switchResize = {
          ...switchResize,
          newResizingTop: true,
          newResizingBottom: false,
          newResizingLeft: switchResize.newResizingLeft ?? resizingLeft,
          newResizingRight: switchResize.newResizingRight ?? resizingRight,
        };
        // Keep the shape in the same position by adjusting coordinates
        y1 = Math.round(borderStartY);
        y2 = Math.round(borderStartY - newHeight); // newHeight is negative, so this extends upward
      } else {
        // Normal resize bottom
        y1 = Math.round(borderStartY);
        y2 = Math.round(borderStartY + newHeight);
      }
    } else if (resizingTop) {
      const newHeight = currentHeight - offsetY;
      if (newHeight < 0) {
        // Crossed the bottom edge - flip vertically and switch to resizing bottom
        flipY = !flipY;
        flipStateChanged = true;
        switchResize = {
          ...switchResize,
          newResizingTop: false,
          newResizingBottom: true,
          newResizingLeft: switchResize.newResizingLeft ?? resizingLeft,
          newResizingRight: switchResize.newResizingRight ?? resizingRight,
        };
        // Keep the shape in the same position by adjusting coordinates
        y1 = Math.round(borderEndY + newHeight); // newHeight is negative, so this extends downward
        y2 = Math.round(borderEndY);
      } else {
        // Normal resize top
        y1 = Math.round(borderStartY + offsetY);
        y2 = Math.round(borderEndY);
      }
    } else {
      // Not resizing vertically, keep current Y coordinates
      y1 = Math.round(borderStartY);
      y2 = Math.round(borderEndY);
    }

    const width = Math.abs(x2 - x1);
    const height = Math.abs(y2 - y1);

    if (shape.shapes === undefined) {
      // Regular shape
      const updatedShape = ShapeFunctions.updateShape(shape, {
        x1: x1,
        y1: y1,
        x2: x2,
        y2: y2,
        width,
        height,
        flipX,
        flipY,
      });

      // Return shape with flip state change information if needed
      if (flipStateChanged) {
        return {
          ...updatedShape,
          flipStateChanged: { flipX, flipY, switchResize },
        };
      }

      return updatedShape;
    } else {
      // Component shape - update child shapes proportionally
      const scaleX = width / currentWidth;
      const scaleY = height / currentHeight;

      const updatedShape = ShapeFunctions.updateShape(shape, {
        x1: x1,
        y1: y1,
        x2: x2,
        y2: y2,
        width,
        height,
        flipX,
        flipY,
        shapes: shape.shapes.map((componentShape: Shape) => {
          // Scale child shape relative to the component's center
          const centerX = Math.round((borderStartX + borderEndX) / 2);
          const centerY = Math.round((borderStartY + borderEndY) / 2);

          // Calculate relative position from center
          const relativeX1 = componentShape.x1 - centerX;
          const relativeY1 = componentShape.y1 - centerY;
          const relativeX2 = componentShape.x2 - centerX;
          const relativeY2 = componentShape.y2 - centerY;

          // Apply scaling and flip
          const newCenterX = Math.round((x1 + x2) / 2);
          const newCenterY = Math.round((y1 + y2) / 2);

          const newX1 = Math.round(
            newCenterX + relativeX1 * scaleX * (flipX ? -1 : 1)
          );
          const newY1 = Math.round(
            newCenterY + relativeY1 * scaleY * (flipY ? -1 : 1)
          );
          const newX2 = Math.round(
            newCenterX + relativeX2 * scaleX * (flipX ? -1 : 1)
          );
          const newY2 = Math.round(
            newCenterY + relativeY2 * scaleY * (flipY ? -1 : 1)
          );

          return {
            ...componentShape,
            x1: newX1,
            y1: newY1,
            x2: newX2,
            y2: newY2,
            width: Math.abs(newX2 - newX1),
            height: Math.abs(newY2 - newY1),
            flipX: componentShape.flipX ? !flipX : flipX,
            flipY: componentShape.flipY ? !flipY : flipY,
          };
        }),
      });

      // Return shape with flip state change information if needed
      if (flipStateChanged) {
        return {
          ...updatedShape,
          flipStateChanged: { flipX, flipY, switchResize },
        };
      }

      return updatedShape;
    }
  },
  createComponent: (
    selectedShapesArray: Shape[],
    selectedShapes: string[],
    shapes: Shape[]
  ): Shape[] => {
    if (selectedShapes.length === 0) {
      return [];
    }

    // Calculate component bounds (rounded to integers)
    const x1 = Math.round(
      selectedShapesArray.reduce(
        (minX: number, shape: Shape) =>
          Math.min(minX, Math.min(shape.x1, shape.x2)),
        Infinity
      )
    );
    const y1 = Math.round(
      selectedShapesArray.reduce(
        (minY: number, shape: Shape) =>
          Math.min(minY, Math.min(shape.y1, shape.y2)),
        Infinity
      )
    );
    const x2 = Math.round(
      selectedShapesArray.reduce(
        (maxX: number, shape: Shape) =>
          Math.max(maxX, Math.max(shape.x1, shape.x2)),
        -Infinity
      )
    );
    const y2 = Math.round(
      selectedShapesArray.reduce(
        (maxY: number, shape: Shape) =>
          Math.max(maxY, Math.max(shape.y1, shape.y2)),
        -Infinity
      )
    );

    // Get all non-selected shapes
    const nonSelectedShapes = shapes.filter(
      (shape: Shape) => !selectedShapes.includes(shape.id)
    );

    // Find the highest z-index among selected shapes
    const maxSelectedZIndex = selectedShapesArray.reduce(
      (maxZ: number, shape: Shape) => Math.max(maxZ, shape.zIndex ?? 0),
      0
    );

    // Create component with child shapes maintaining their relative z-indices
    const componentChildren = selectedShapesArray.map((shape: Shape) => ({
      ...shape,
      level: shape.level + 1, // Increase level to indicate it's inside a component
    }));

    const newComponent: Shape = {
      type: "component",
      shapes: componentChildren,
      id:
        Math.random().toString(36).substring(2, 10) +
        new Date().getTime().toString(36),
      x1: x1,
      y1: y1,
      x2: x2,
      y2: y2,
      width: x2 - x1,
      height: y2 - y1,
      level: 0,
      zIndex: maxSelectedZIndex, // Use the highest z-index from selected shapes
      backgroundColor: "transparent",
      borderColor: "transparent",
      borderRadius: 0,
      borderStyle: "none",
      borderWidth: 0,
      color: "transparent",
    };

    // Return all non-selected shapes plus the new component
    return [...nonSelectedShapes, newComponent].sort(
      (a: Shape, b: Shape) => (a.zIndex ?? 0) - (b.zIndex ?? 0)
    );
  },

  /**
   * Ungroup a component back into individual shapes
   * Restores child shapes to the main shapes array with proper z-indices
   */
  ungroupComponent: (component: Shape, allShapes: Shape[]): Shape[] => {
    if (component.type !== "component" || !component.shapes) {
      console.warn("Cannot ungroup: not a valid component");
      return allShapes;
    }

    // Get all shapes except the component being ungrouped
    const otherShapes = allShapes.filter((shape) => shape.id !== component.id);

    // Extract child shapes and restore them to level 0
    const extractedShapes = component.shapes.map((childShape: Shape) => ({
      ...childShape,
      level: Math.max(0, childShape.level - 1), // Decrease level back to main level
    }));

    // Find the position in z-order where the component was
    const componentZIndex = component.zIndex ?? 0;

    // Adjust z-indices: shapes above the component need to move up to make room
    const adjustedShapes = otherShapes.map((shape: Shape) => {
      if ((shape.zIndex ?? 0) > componentZIndex) {
        return {
          ...shape,
          zIndex: (shape.zIndex ?? 0) + extractedShapes.length - 1,
        };
      }
      return shape;
    });

    // Insert extracted shapes at the component's z-index position
    const finalShapes = [...adjustedShapes];
    extractedShapes.forEach((shape: Shape, index: number) => {
      finalShapes.push({
        ...shape,
        zIndex: componentZIndex + index,
      });
    });

    // Sort by z-index and return
    return finalShapes.sort(
      (a: Shape, b: Shape) => (a.zIndex ?? 0) - (b.zIndex ?? 0)
    );
  },

  /**
   * Check if a shape is a component that can be ungrouped
   */
  canUngroup: (shape: Shape): boolean => {
    return (
      shape.type === "component" &&
      shape.shapes !== undefined &&
      shape.shapes.length > 0
    );
  },

  /**
   * Get preview information about ungrouping a component
   */
  getUngroupPreview: (
    component: Shape
  ): {
    canUngroup: boolean;
    childCount: number;
    childTypes: string[];
    message: string;
  } => {
    if (!ShapeFunctions.canUngroup(component)) {
      return {
        canUngroup: false,
        childCount: 0,
        childTypes: [],
        message: "Cannot ungroup: not a valid component",
      };
    }

    const childShapes = component.shapes || [];
    const childTypes = [...new Set(childShapes.map((shape) => shape.type))];

    return {
      canUngroup: true,
      childCount: childShapes.length,
      childTypes,
      message: `Will ungroup ${childShapes.length} shape${
        childShapes.length === 1 ? "" : "s"
      } of type${childTypes.length === 1 ? "" : "s"}: ${childTypes.join(", ")}`,
    };
  },

  /**
   * Resize multiple shapes as a group with proportional scaling and flip support
   */
  resizeShapeGroup: (
    shapes: Shape[],
    groupBounds: { startX: number; startY: number; endX: number; endY: number },
    offsetX: number,
    offsetY: number,
    resizingTop: boolean,
    resizingBottom: boolean,
    resizingLeft: boolean,
    resizingRight: boolean
  ): { shapes: Shape[] } => {
    if (shapes.length === 0) return { shapes };

    /*
        Group proportional resizing:
        - Calculate the overall group bounding box
        - Determine how the group is being resized
        - Apply proportional scaling to each shape within the group
        - Use floating-point math for accurate proportions
        - Round only the final coordinates to integers
    */

    const originalX1 = groupBounds.startX;
    const originalY1 = groupBounds.startY;
    const originalX2 = groupBounds.endX;
    const originalY2 = groupBounds.endY;
    const originalWidth = Math.abs(originalX2 - originalX1);
    const originalHeight = Math.abs(originalY2 - originalY1);

    // Calculate new group bounds based on which edges are being resized
    let newX1 = originalX1;
    let newX2 = originalX2;
    let newY1 = originalY1;
    let newY2 = originalY2;

    if (resizingLeft) {
      newX1 = originalX1 + offsetX;
    }
    if (resizingRight) {
      newX2 = originalX2 + offsetX;
    }
    if (resizingTop) {
      newY1 = originalY1 + offsetY;
    }
    if (resizingBottom) {
      newY2 = originalY2 + offsetY;
    }

    // Use SIGNED dimensions to avoid discontinuity at flip point
    const newWidth = newX2 - newX1; // Can be negative when flipped
    const newHeight = newY2 - newY1; // Can be negative when flipped

    // Calculate scale factors (floating point for accurate proportions)
    // Scale factors will naturally become negative when flipped
    const scaleX = originalWidth > 0 ? newWidth / originalWidth : 1;
    const scaleY = originalHeight > 0 ? newHeight / originalHeight : 1;

    // Determine the transformation origin based on which edges are being resized
    let originX = originalX1; // Default to left edge
    let originY = originalY1; // Default to top edge

    if (resizingRight && !resizingLeft) {
      originX = originalX1; // Scale from left edge
    } else if (resizingLeft && !resizingRight) {
      originX = originalX2; // Scale from right edge
    } else if (resizingLeft && resizingRight) {
      originX = (originalX1 + originalX2) / 2; // Scale from center
    }

    if (resizingBottom && !resizingTop) {
      originY = originalY1; // Scale from top edge
    } else if (resizingTop && !resizingBottom) {
      originY = originalY2; // Scale from bottom edge
    } else if (resizingTop && resizingBottom) {
      originY = (originalY1 + originalY2) / 2; // Scale from center
    }

    // Calculate the new origin position after scaling
    let newOriginX = originX;
    let newOriginY = originY;

    if (resizingLeft && !resizingRight) {
      newOriginX = newX2; // Origin stays at right edge
    } else if (resizingRight && !resizingLeft) {
      newOriginX = newX1; // Origin stays at left edge
    } else if (resizingLeft && resizingRight) {
      newOriginX = (newX1 + newX2) / 2; // Origin at new center
    }

    if (resizingTop && !resizingBottom) {
      newOriginY = newY2; // Origin stays at bottom edge
    } else if (resizingBottom && !resizingTop) {
      newOriginY = newY1; // Origin stays at top edge
    } else if (resizingTop && resizingBottom) {
      newOriginY = (newY1 + newY2) / 2; // Origin at new center
    }

    // No flip detection needed - let negative scaling handle everything naturally

    // Use the natural signed scale factors - no artificial manipulation needed
    // Scale factors are naturally negative when flipped due to signed dimension calculation
    const finalScaleX = scaleX;
    const finalScaleY = scaleY;

    // Apply proportional scaling to each shape
    const resizedShapes = shapes.map((shape: Shape) => {
      // Calculate the shape's position relative to the origin (floating point)
      const relativeX1 = shape.x1 - originX;
      const relativeY1 = shape.y1 - originY;
      const relativeX2 = shape.x2 - originX;
      const relativeY2 = shape.y2 - originY;

      // Apply scaling (flip is already built into the scale factors)
      const scaledX1 = relativeX1 * finalScaleX;
      const scaledY1 = relativeY1 * finalScaleY;
      const scaledX2 = relativeX2 * finalScaleX;
      const scaledY2 = relativeY2 * finalScaleY;

      // Use the calculated origin position (no coordinate swapping needed)
      const finalOriginX = newOriginX;
      const finalOriginY = newOriginY;

      // Calculate final positions (floating point)
      const finalX1 = finalOriginX + scaledX1;
      const finalY1 = finalOriginY + scaledY1;
      const finalX2 = finalOriginX + scaledX2;
      const finalY2 = finalOriginY + scaledY2;

      // Round only the final coordinates to integers
      const roundedX1 = Math.round(finalX1);
      const roundedY1 = Math.round(finalY1);
      const roundedX2 = Math.round(finalX2);
      const roundedY2 = Math.round(finalY2);

      return ShapeFunctions.updateShape(shape, {
        x1: roundedX1,
        y1: roundedY1,
        x2: roundedX2,
        y2: roundedY2,
        width: Math.abs(roundedX2 - roundedX1),
        height: Math.abs(roundedY2 - roundedY1),
      });
    });

    // Return the resized shapes without flip state (no longer needed)
    return { shapes: resizedShapes };
  },
};
