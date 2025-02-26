import { Shape } from "../../../classes/shape";

export const copyShapes = (shapes: Shape[], selectedShapes: string[]) => {
  const copiedData = shapes.map((shape: Shape) => {
    return selectedShapes.includes(shape.id) ? shape : null;
  });
  navigator.clipboard.writeText(JSON.stringify(copiedData));
};
