import { useDispatch, useSelector } from "react-redux";
import {
  removeShape,
  updateShape,
} from "../features/whiteBoard/whiteBoardSlice";
import { AppDispatch } from "../store";
import { clearSelectedShapes } from "../features/selected/selectedSlice";
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
      dispatch(clearSelectedShapes());
    }
  };

  return { handleDelete };
};
