import { Shape } from "../../../features/whiteBoard/whiteBoardSlice";

export const copyShapes = (shapes: Shape[], selectedShapes: string[]) => {
  const copiedData = shapes.map((shape: Shape) => {
    return selectedShapes.includes(shape.id) ? shape : null;
  });
  navigator.clipboard.writeText(JSON.stringify(copiedData));
};
