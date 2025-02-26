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
    console.log(x, y);
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
        x1: shape.x1 + offsetX,
        y1: shape.y1 + offsetY,
        x2: shape.x2 + offsetX,
        y2: shape.y2 + offsetY,
      });
    } else {
      return ShapeFunctions.updateShape(shape, {
        x1: shape.x1 + offsetX,
        y1: shape.y1 + offsetY,
        x2: shape.x2 + offsetX,
        y2: shape.y2 + offsetY,
        shapes: shape.shapes.map((componentShape: Shape) => {
          return ShapeFunctions.updateShape(componentShape, {
            x1: componentShape.x1 + offsetX,
            y1: componentShape.y1 + offsetY,
            x2: componentShape.x2 + offsetX,
            y2: componentShape.y2 + offsetY,
          });
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
  ): Shape => {
    /*
        Things to consider:
            Current functionality allows resizing of regular shapes, groups of shapes, and components and the shapes within
            Does not work for rounded widths -> This causes shapes to drift from eachother.
            Does not work when anchor edge gets dragged past the other edge to reverse the shape.
    */
    let x1 = shape.x1;
    let x2 = shape.x2;
    let y1 = shape.y1;
    let y2 = shape.y2;
    if (resizingRight) {
      let ratioX1 = (x1 - borderStartX) / (borderEndX - borderStartX);
      let ratioX2 = (x2 - borderStartX) / (borderEndX - borderStartX);
      x1 = borderStartX + ratioX1 * (borderEndX + offsetX - borderStartX);
      x2 = borderStartX + ratioX2 * (borderEndX + offsetX - borderStartX);
    } else if (resizingLeft) {
      let ratioX1 = (borderEndX - x1) / (borderEndX - borderStartX);
      let ratioX2 = (borderEndX - x2) / (borderEndX - borderStartX);
      x1 = borderEndX - ratioX1 * (borderEndX - (borderStartX + offsetX));
      x2 = borderEndX - ratioX2 * (borderEndX - (borderStartX + offsetX));
    }

    if (resizingBottom) {
      let ratioY1 = (y1 - borderStartY) / (borderEndY - borderStartY);
      let ratioY2 = (y2 - borderStartY) / (borderEndY - borderStartY);
      y1 = borderStartY + ratioY1 * (borderEndY + offsetY - borderStartY);
      y2 = borderStartY + ratioY2 * (borderEndY + offsetY - borderStartY);
    } else if (resizingTop) {
      let ratioY1 = (borderEndY - y1) / (borderEndY - borderStartY);
      let ratioY2 = (borderEndY - y2) / (borderEndY - borderStartY);
      y1 = borderEndY - ratioY1 * (borderEndY - (borderStartY + offsetY));
      y2 = borderEndY - ratioY2 * (borderEndY - (borderStartY + offsetY));
    }

    const width = Math.abs(x2 - x1);
    const height = Math.abs(y2 - y1);
    if (shape.shapes === undefined) {
      return (shape = ShapeFunctions.updateShape(shape, {
        x1: x1,
        y1: y1,
        x2: x2,
        y2: y2,
        width,
        height,
      }));
    } else {
      return (shape = ShapeFunctions.updateShape(shape, {
        x1: x1,
        y1: y1,
        x2: x2,
        y2: y2,
        width,
        height,
        shapes: shape.shapes.map((componentShape: Shape, index: number) => {
          let x1 = componentShape.x1;
          let x2 = componentShape.x2;
          let y1 = componentShape.y1;
          let y2 = componentShape.y2;

          if (resizingRight) {
            let ratioX1 = (x1 - borderStartX) / (borderEndX - borderStartX);
            let ratioX2 = (x2 - borderStartX) / (borderEndX - borderStartX);

            x1 = borderStartX + ratioX1 * (borderEndX + offsetX - borderStartX);
            x2 = borderStartX + ratioX2 * (borderEndX + offsetX - borderStartX);
          } else if (resizingLeft) {
            let ratioX1 = (borderEndX - x1) / (borderEndX - borderStartX);
            let ratioX2 = (borderEndX - x2) / (borderEndX - borderStartX);
            x1 = borderEndX - ratioX1 * (borderEndX - (borderStartX + offsetX));
            x2 = borderEndX - ratioX2 * (borderEndX - (borderStartX + offsetX));
          }

          if (resizingBottom) {
            let ratioY1 = (y1 - borderStartY) / (borderEndY - borderStartY);
            let ratioY2 = (y2 - borderStartY) / (borderEndY - borderStartY);
            y1 = borderStartY + ratioY1 * (borderEndY + offsetY - borderStartY);
            y2 = borderStartY + ratioY2 * (borderEndY + offsetY - borderStartY);
          } else if (resizingTop) {
            let ratioY1 = (borderEndY - y1) / (borderEndY - borderStartY);
            let ratioY2 = (borderEndY - y2) / (borderEndY - borderStartY);
            y1 = borderEndY - ratioY1 * (borderEndY - (borderStartY + offsetY));
            y2 = borderEndY - ratioY2 * (borderEndY - (borderStartY + offsetY));
          }

          const width = Math.abs(x2 - x1);
          const height = Math.abs(y2 - y1);
          return {
            ...componentShape,
            x1: x1,
            y1: y1,
            x2: x2,
            y2: y2,
            width,
            height,
          };
        }),
      }));
    }
  },
  createComponent: (
    selectedShapesArray: Shape[],
    selectedShapes: string[],
    shapes: Shape[]
  ): Shape[] => {
    const x1 = selectedShapesArray.reduce(
      (minX: number, shape: Shape) => Math.min(minX, shape.x1),
      Infinity
    );
    const y1 = selectedShapesArray.reduce(
      (minY: number, shape: Shape) => Math.min(minY, shape.y1),
      Infinity
    );
    const x2 = selectedShapesArray.reduce(
      (maxX: number, shape: Shape) => Math.max(maxX, shape.x2),
      -Infinity
    );
    const y2 = selectedShapesArray.reduce(
      (maxY: number, shape: Shape) => Math.max(maxY, shape.y2),
      -Infinity
    );

    if (selectedShapes.length > 0) {
      let zIndexFixedShapes = shapes.filter((shape: Shape, index: number) => {
        return !selectedShapes.includes(shape.id);
      });

      zIndexFixedShapes = zIndexFixedShapes.sort(
        (a: Shape, b: Shape) => (a.zIndex ?? 0) - (b.zIndex ?? 0)
      );

      zIndexFixedShapes = zIndexFixedShapes.map(
        (shape: Shape, index: number) => {
          if (shape.type !== "component") {
            return {
              ...shape,
              zIndex: index,
            };
          } else {
            return {
              ...shape,
              zIndex: index,
              shapes: shape.shapes?.map((innerShape: Shape, idx: number) => {
                return {
                  ...innerShape,
                  zIndex: index + idx + 1,
                };
              }),
            };
          }
        }
      );
      let zIndex = 0;

      zIndex = ShapeFunctions.getLargestZIndex(zIndexFixedShapes) + 1;

      const component = selectedShapesArray.map(
        (shape: Shape, index: number) => {
          return {
            ...shape,
            level: shape.level + 1,
            zIndex: zIndex + index + 1,
          };
        }
      );
      const newComponent: Shape = {
        type: "component",
        shapes: component,
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
        zIndex: zIndex,
        backgroundColor: "none",
        borderColor: "none",
        borderRadius: 0,
        borderStyle: "none",
        borderWidth: 0,
        color: "none",
      };
      zIndexFixedShapes.push(newComponent);
      zIndexFixedShapes = zIndexFixedShapes.sort(
        (a: Shape, b: Shape) => (a.zIndex ?? 0) - (b.zIndex ?? 0)
      );
      return zIndexFixedShapes;
    } else {
      return [];
    }
  },
};
