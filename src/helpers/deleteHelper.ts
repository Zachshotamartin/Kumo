import { useDispatch, useSelector } from "react-redux";
import {
  removeShape,
  updateShape,
} from "../features/whiteBoard/whiteBoardSlice";
import { AppDispatch } from "../store";

export const useDeleteSelectedShapes = () => {
  const dispatch = useDispatch<AppDispatch>();
  const selectedShapes = useSelector(
    (state: any) => state.selected.selectedShapes
  );
  const shapes = useSelector((state: any) => state.whiteBoard.shapes);

  const handleDelete = () => {
    if (selectedShapes.length > 0) {
      console.log(shapes.length);
      const shapesCopy = [...selectedShapes];
      const newShapes = shapesCopy.sort((a: number, b: number) => b - a);
      newShapes.forEach((index: number) => {
        dispatch(removeShape(index));
      });
      // Update the z-indices of the remaining shapes
      const updatedShapes = shapes.map((shape: any, i: any) => ({
        ...shape,
        zIndex: i,
      }));
      for (let i = 0; i < updatedShapes.length; i++) {
        const shape = updatedShapes[i];
        dispatch(updateShape({ index: i, update: shape }));
      }
    }
  };

  return { handleDelete };
};
