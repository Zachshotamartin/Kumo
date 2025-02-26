import { Dispatch } from "react";
import { Shape } from "../../../classes/shape";
import { setWhiteboardData } from "../../../features/whiteBoard/whiteBoardSlice";
import { handleBoardChange } from "../../../helpers/handleBoardChange";

export const pasteShapes = (
  shapes: Shape[],
  selectedShapes: string[],
  board: any,
  dispatch: Dispatch<any>
) => {
  navigator.clipboard.readText().then((copiedData) => {
    let pastedShapes = JSON.parse(copiedData);
    pastedShapes.forEach((shape: Shape, index: number) => {
      if (shape) {
        pastedShapes[index] = {
          ...shape,
          id:
            Math.random().toString(36).substring(2, 10) +
            new Date().getTime().toString(36),
        };
      }
    });
    const data = {
      ...board,
      shapes: [...shapes, ...pastedShapes],
    }
    dispatch(
      setWhiteboardData(data)
    );
    handleBoardChange(data);
  });
};
