import { Dispatch } from "react";
import { undo, redo } from "../../../features/shapeHistory/shapeHistorySlice";

export const undoAndRedo = (
  history: any,
  dispatch: Dispatch<any>,
  event: KeyboardEvent
) => {
  // Undo: Command + Z
  if (event.shiftKey) {
    event.preventDefault();

    if (history.currentIndex < history.history.length - 1) {
      console.log("trying to redo");
      dispatch(redo());
    }
  }
  // Redo: Command + Shift + Z
  else {
    event.preventDefault();
    if (history.currentIndex > 0) {
      console.log("trying to undo");
      dispatch(undo());
    }
  }
};
