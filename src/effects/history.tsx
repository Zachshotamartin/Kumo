import { useEffect } from "react";
import { useSelector, useDispatch } from "react-redux";
import { initializeHistory } from "../features/shapeHistory/shapeHistorySlice";
import { AppDispatch } from "../store";
import { setWhiteboardData } from "../features/whiteBoard/whiteBoardSlice";
import { handleBoardChange } from "../helpers/handleBoardChange";
import { updateHistory } from "../features/shapeHistory/shapeHistorySlice";


const History = () => {
  const dispatch = useDispatch<AppDispatch>();
  const shapes = useSelector((state: any) => state.whiteBoard.shapes);
  const board = useSelector((state: any) => state.whiteBoard.board);
  const history = useSelector((state: any) => state.shapeHistory);
  const dragging = useSelector((state: any) => state.actions.dragging);
  const resizing = useSelector((state: any) => state.actions.resizing);
  const drawing = useSelector((state: any) => state.actions.drawing);
  /*
        History UseEffect:
        Responsibility -> To initialize the history on first render
      */
  useEffect(() => {
    dispatch(initializeHistory(shapes));
    console.log("board initialized with ", shapes);
  }, []);

  /*
      ctrl z / ctrl shift z useEffect:
      Responsibility -> This updates the whiteboard data to previous or next in the history
                        when undo or redo is called and updates the data in the realtime db.
    */
  useEffect(() => {
    dispatch(
      setWhiteboardData({
        ...board,
        shapes: history.history[history.currentIndex],
      })
    );

    handleBoardChange({
      ...board,
      shapes: history.history[history.currentIndex],
    });
  }, [history]);

  /*
      Update History useEffect:
      Responsibility -> Updates the history state with a new board update when 
                        a change is made. Can only happen if the no further actions
                        such as any mouse clicks are currently occurring.
    */
  useEffect(() => {
    if (!dragging && !resizing && !drawing) {
      if (shapes !== history.history[history.currentIndex]) {
        dispatch(updateHistory(shapes));
      }
    }
  }, [shapes, dragging, resizing, drawing]);

  return null;
};

export default History;
