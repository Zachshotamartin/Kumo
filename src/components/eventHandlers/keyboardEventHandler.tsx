import { useEffect } from "react";
import { useSelector, useDispatch } from "react-redux";
import { AppDispatch } from "../../store";
import { setPasting } from "../../features/actions/actionsSlice";
import { copyShapes } from "./keyboardEvents/copyShapes";
import { pasteShapes } from "./keyboardEvents/pasteShapes";
import { deleteShapes } from "./keyboardEvents/deleteShapes";
import { undoAndRedo } from "./keyboardEvents/undoAndRedo";

/*
    Key Listener useEffect:
    Responsibility -> Adds an event listener for relevent key press events.
                      Includes copy, paste, redo, undo, backspace.
*/
const KeyboardEventHandler = () => {
  const selectedShapes = useSelector(
    (state: any) => state.selected.selectedShapes
  );
  const shapes = useSelector((state: any) => state.whiteBoard.shapes);
  const board = useSelector((state: any) => state.whiteBoard);
  const history = useSelector((state: any) => state.shapeHistory);

  const dispatch = useDispatch<AppDispatch>();

  useEffect(() => {
    let debounceTimeoutCopy: any;
    let debounceTimeoutPaste: any;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey && event.key === "c") {
        // Debounced copy function
        if (debounceTimeoutCopy) return; // Ignore if already debounced for copy
        debounceTimeoutCopy = setTimeout(
          () => (debounceTimeoutCopy = null),
          300
        ); // Reset after 300ms

        event.preventDefault();
        copyShapes(shapes, selectedShapes);
      } else if (event.metaKey && event.key === "v") {
        event.preventDefault();
        // Debounced paste function
        if (debounceTimeoutPaste) return; // Ignore if already debounced for paste
        debounceTimeoutPaste = setTimeout(
          () => (debounceTimeoutPaste = null),
          300
        ); // Reset after 300ms

        dispatch(setPasting(true));
        pasteShapes(shapes, selectedShapes, dispatch, board);
      } else if (event.key === "Backspace") {
        deleteShapes(shapes, selectedShapes, board, dispatch, event);
      } else if ((event.metaKey || event.ctrlKey) && event.key === "z") {
        undoAndRedo(history, dispatch, event);
      }
    };

    // Add event listener
    document.addEventListener("keydown", handleKeyDown);

    // Cleanup function to remove event listener when the component unmounts
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dispatch, selectedShapes, shapes, history]);

  return null;
};

export default KeyboardEventHandler;
