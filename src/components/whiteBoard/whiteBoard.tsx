// whiteBoard.tsx
// imports
import React, { useState, useRef, useEffect } from "react";

import { useSelector, useDispatch } from "react-redux";
import styles from "./whiteBoard.module.css";

import { Shape } from "../../classes/shape";
import { db, realtimeDb } from "../../config/firebase";
import { query, collection, where, onSnapshot } from "firebase/firestore";
import { AppDispatch } from "../../store";
import { setBoards } from "../../features/boards/boards";
import { setWhiteboardData } from "../../features/whiteBoard/whiteBoardSlice";

import BottomBar from "../bottomBar/bottomBar";
import RenderBoxes from "../renderComponents/renderBoxes";
import RenderEllipses from "../renderComponents/renderEllipses";
import RenderText from "../renderComponents/renderText";
import RenderHighlighting from "../renderComponents/renderHighlighting";
import RenderBorder from "../renderComponents/renderBorder";
import RenderGridLines from "../renderComponents/renderGridLines";
import RenderImages from "../renderComponents/renderImages";
import RenderCalendars from "../renderComponents/renderCalendars";
import RenderHoverBorder from "../renderComponents/renderHoverBorder";
import RenderSnappingGuides from "../renderComponents/renderSnappingGuides";
import RenderComponents from "../renderComponents/renderComponents";
import RenderCursors from "../renderComponents/renderCursors";

import {
  initializeHistory,
  updateHistory,
} from "../../features/shapeHistory/shapeHistorySlice";
import { handleBoardChange } from "../../helpers/handleBoardChange";
import { ref, onValue, off } from "firebase/database"; // For listening to Realtime Database
import _ from "lodash";
import KeyboardEventHandler from "../eventHandlers/keyboardEventHandler";
import GeneratePreview from "../../effects/generatePreview";
import Intersections from "../../effects/intersections";
import History from "../../effects/history";
import DBListener from "../../effects/dbListener";
import ComponentVisibility from "../../effects/visibilityEffects";

/*
  WhiteBoard Function:
    Responsibility -> To handle the mouse / keyboard events that occur on the whiteboard and handle
                      board updates to the redux state and board visual updates in browser.
*/
const WhiteBoard = () => {
  // Redux dispatches //
  const dispatch = useDispatch<AppDispatch>();

  // Selected Selectors //
  const selectedShapes = useSelector(
    (state: any) => state.selected.selectedShapes
  );
  const selectedTool = useSelector((state: any) => state.selected.selectedTool);

  // WhiteBoard Selectors //
  const shapes = useSelector((state: any) => state.whiteBoard.shapes);
  const board = useSelector((state: any) => state.whiteBoard);

  // History Selectors //
  const history = useSelector((state: any) => state.shapeHistory);

  // Authentication Selectors //
  const user = useSelector((state: any) => state.auth);

  // Actions Selectors //
  const drawing = useSelector((state: any) => state.actions.drawing);
  const dragging = useSelector((state: any) => state.actions.dragging);
  const resizing = useSelector((state: any) => state.actions.resizing);

  const highlighting = useSelector((state: any) => state.actions.highlighting);
  const grid = useSelector((state: any) => state.actions.grid);

  const middleMouseButton = useSelector(
    (state: any) => state.actions.middleMouseButton
  );

  // UseStates //
  const [middle, setMiddle] = useState(false);

  // Use Refs //
  const canvasRef = useRef<HTMLDivElement>(null);
  // const inputRef = useRef<HTMLTextAreaElement | null>(null);

  // Realtime DB
  const usersCollectionRef = collection(db, "users");

  /*
    History UseEffect:
    Responsibility -> To initialize the history on first render
  */
  useEffect(() => {
    dispatch(initializeHistory(shapes));
  }, []);

  /*
    Middle Mouse Triggered UseEffect:
    Responsibility -> To allow checking if the middle mouse button is pressed down.
  */

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
      console.log("updating history");
      if (shapes !== history.history[history.currentIndex]) {
        dispatch(updateHistory(shapes));
      }
    }
  }, [dragging, resizing, drawing]);

  /*
    DB update useEffect:
    Responsiblity -> After a valid change has been made to the board, sends the new board
                     to be updated in the realtime DB.
  */
  useEffect(() => {
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

  /*
    userBoards useEffect:
    Responsibility -> Gets the available boards for the user to change to.
  */
  useEffect(() => {
    if (user?.uid) {
      const q = query(usersCollectionRef, where("uid", "==", user?.uid));
      const unsubscribe = onSnapshot(q, (querySnapshot) => {
        if (!querySnapshot.empty) {
          const userDoc = querySnapshot.docs[0];
          const userData = userDoc.data();
          setBoards({
            privateBoards: userData.privateBoardsIds || [],
            publicBoards: userData.publicBoardsIds || [],
            sharedBoards: userData.sharedBoardsIds || [],
          });
        }
      });
      return () => unsubscribe();
    }
  }, [board, user?.uid, usersCollectionRef]);

  return (
    <div
      id="whiteboard"
      ref={canvasRef}
      style={{
        cursor: selectedTool === "pointer" ? "crosshair" : "default",
        overflow: "hidden",
        backgroundColor: board.backGroundColor,
      }}
      className={styles.whiteBoard}
    >
      {grid && <RenderGridLines />}
      <RenderBoxes shapes={shapes} />
      <RenderEllipses shapes={shapes} />
      <RenderText shapes={shapes} />
      <RenderImages shapes={shapes} />
      <RenderCalendars shapes={shapes} />
      {dragging && highlighting && <RenderHighlighting />}
      <RenderBorder />
      <RenderHoverBorder />
      <RenderSnappingGuides />
      <RenderComponents shapes={shapes} />
      <RenderCursors />
      <BottomBar />

      {/* handlers */}
      <KeyboardEventHandler />

      {/* effects */}
      <ComponentVisibility />
      <Intersections />
      <GeneratePreview />
      {/* <History /> */}
    </div>
  );
};

export default WhiteBoard;
