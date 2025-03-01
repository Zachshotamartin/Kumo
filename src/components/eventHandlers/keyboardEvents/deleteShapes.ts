import { Dispatch } from "react";
import { Shape } from "../../../classes/shape";
import { setWhiteboardData } from "../../../features/whiteBoard/whiteBoardSlice";
import { handleBoardChange } from "../../../helpers/handleBoardChange";
import { clearSelectedShapes } from "../../../features/selected/selectedSlice";

export const deleteShapes = (
  shapes: Shape[],
  selectedShapes: string[],
  board: any,
  dispatch: Dispatch<any>,
  event: KeyboardEvent
) => {
  // Ensure this is not focused on a textbox
  const target = event.target as HTMLElement | null;
  console.log(target);
  if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) {
  } else {
    event.preventDefault();
    if (selectedShapes.length > 0) {
      const shapesCopy = shapes.filter((shape: Shape, index: number) => {
        return !selectedShapes.includes(shape.id);
      });
      const data = {
        ...board,
        shapes: shapesCopy,
      };
      dispatch(setWhiteboardData(data));
      handleBoardChange(data);
      dispatch(clearSelectedShapes());
    }
  }
};
