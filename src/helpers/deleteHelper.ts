import { useDispatch, useSelector } from "react-redux";
import {
  removeShape,
  Shape,
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
      const newShapes = shapes.filter((shape: Shape) => {
        return shapesCopy.includes(shape.id);
      });
      console.log("newShapes", newShapes);
      newShapes.forEach((shape: Shape) => {
        dispatch(removeShape(shape));
      });
      // Update the z-indices of the remaining shapes
      dispatch(clearSelectedShapes());
    }
  };

  return { handleDelete };
};
