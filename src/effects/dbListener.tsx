import { useEffect } from "react";
import { useSelector, useDispatch } from "react-redux";
import {
  setWhiteboardData,

} from "../features/whiteBoard/whiteBoardSlice";
import { Shape } from "../classes/shape";
import { AppDispatch } from "../store";
import { realtimeDb } from "../config/firebase";
import { ref, onValue, off } from "firebase/database"; // For listening to Realtime Database
import _ from "lodash";

const DBListener = () => {
  const board = useSelector((state: any) => state.whiteBoard);
  const shapes = useSelector((state: any) => state.whiteBoard.shapes);
  const selectedShapes = useSelector(
    (state: any) => state.selected.selectedShapes
  );
  const user = useSelector((state: any) => state.auth);
  const dispatch = useDispatch<AppDispatch>();

  /*
    DB update useEffect:
    Responsiblity -> Listens for changes made to the realtime DB and implements changes if made.
  */
  useEffect(() => {
    console.log("board", board);
    if (!board?.id) {
      console.error("Board ID is missing or invalid!");
      return;
    }
    const boardsRef = ref(realtimeDb, `boards/${board.id}`); // Ensure board.id is valid
    const handleSnapshot = (snapshot: any) => {
      if (!snapshot.exists()) {
        console.log("No such board!");
        return;
      }

      const boardData = snapshot.val();
      let nonSelectedShapes: Shape[] = [];
      if (boardData.shapes) {
        nonSelectedShapes = (boardData?.shapes).filter(
          (shape: Shape) => !selectedShapes.includes(shape.id)
        );
      }

      // Sort and merge shapes
      const sortedShapes = boardData?.shapes
        ? [
            ...nonSelectedShapes,
            ...shapes.filter((shape: Shape) =>
              selectedShapes.includes(shape.id)
            ),
          ]
        : [];

      // Update the state only if the user is not the last editor
      if (!_.isEqual(boardData.shapes ? boardData.shapes : [], board.shapes)) {
        if (user.uid !== boardData.lastChangedBy) {
          console.log("not last changed by");
          dispatch(
            setWhiteboardData({
              ...boardData,
              shapes: sortedShapes,
              title: boardData.title,
              type: boardData.type,
              uid: boardData.uid,
              sharedWith: boardData.sharedWith,
              backGroundColor: boardData.backGroundColor,
              lastChangedBy: user,
            })
          );
        }
      }
    };

    const unsubscribe = onValue(boardsRef, handleSnapshot, (error: any) => {
      console.error("Error listening to board data: ", error);
    });

    // Cleanup the listener when the component unmounts
    return () => {
      off(boardsRef); // Properly remove the listener
    };
  }, [dispatch, selectedShapes, shapes, user]);
  return null;
};

export default DBListener;
