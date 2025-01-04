import { useDispatch, useSelector } from "react-redux";
import { removeShape } from "../features/whiteBoard/whiteBoardSlice";
import { AppDispatch } from "../store";

export const useDeleteSelectedShapes = () => {
  const dispatch = useDispatch<AppDispatch>();
  const selectedShapes = useSelector(
    (state: any) => state.selected.selectedShapes
  );

  const handleDelete = () => {
    if (selectedShapes.length > 0) {
      const shapesCopy = [...selectedShapes];
      const newShapes = shapesCopy.sort((a: number, b: number) => b - a);
      newShapes.forEach((index: number) => {
        dispatch(removeShape(index));
      });
    }
  };

  return { handleDelete };
};
