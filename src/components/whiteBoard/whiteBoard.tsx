// whiteBoard.tsx
// imports
import React, { useState, useRef, useEffect } from "react";

import { useSelector, useDispatch } from "react-redux";
import styles from "./whiteBoard.module.css";

import { Shape } from "../../features/whiteBoard/whiteBoardSlice";
import { db, realtimeDb } from "../../config/firebase";
import { query, collection, where, onSnapshot } from "firebase/firestore";
import { AppDispatch } from "../../store";
import { setBoards } from "../../features/boards/boards";
import { setWhiteboardData } from "../../features/whiteBoard/whiteBoardSlice";
import {
  setGridSnappedX,
  setGridSnappedY,
  setGridSnappedDistanceX,
  setGridSnappedDistanceY,
} from "../../features/actions/actionsSlice";

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
import ContextMenu from "../contextMenu/contextMenu";

import { setHideOptions } from "../../features/hide/hide";
import { storage } from "../../config/firebase";
import { ref as storageRef, uploadBytes } from "firebase/storage";
import {
  initializeHistory,
  updateHistory,
} from "../../features/shapeHistory/shapeHistorySlice";
import { handleBoardChange } from "../../helpers/handleBoardChange";
import { ref, onValue, off } from "firebase/database"; // For listening to Realtime Database
import _ from "lodash";
import KeyboardEventHandler from "../eventHandlers/keyboardEventHandler";
const domtoimage = require("dom-to-image");

/*
  WhiteBoard Function:
    Responsibility -> To handle the mouse / keyboard events that occur on the whiteboard and handle
                      board updates to the redux state and board visual updates in browser.
*/
const WhiteBoard = () => {
  // Redux dispatches //
  const dispatch = useDispatch<AppDispatch>();
  const actionsDispatch = useDispatch();

  // Selected Selectors //
  const selectedShapes = useSelector(
    (state: any) => state.selected.selectedShapes
  );
  const selectedTool = useSelector((state: any) => state.selected.selectedTool);
  const borderStartX = useSelector((state: any) => state.selected.borderStartX);
  const borderStartY = useSelector((state: any) => state.selected.borderStartY);
  const borderEndX = useSelector((state: any) => state.selected.borderEndX);
  const borderEndY = useSelector((state: any) => state.selected.borderEndY);

  // WhiteBoard Selectors //
  const shapes = useSelector((state: any) => state.whiteBoard.shapes);
  const board = useSelector((state: any) => state.whiteBoard);

  // Window Selectors //
  const window = useSelector((state: any) => state.window);

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

  const [contextMenuVisible, setContextMenuVisible] = useState(false);
  const [contextMenuX, setContextMenuX] = useState(0);
  const [contextMenuY, setContextMenuY] = useState(0);
  const [contextMenuLabels, setContextMenuLabels] = useState<
    { label: string; onClick: () => void }[]
  >([]);
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
  useEffect(() => {
    setMiddle(middleMouseButton);
  }, [middleMouseButton]);

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
    Intersection useEffect:
    Responsibility -> When a shape is moved or resized, checks for intersections with
                      other shapes.
  */
  useEffect(() => {
    // figure out when the the edge of the border hits the edge of another shape.
    if (borderStartX === -100000 || borderStartY === -100000) {
      return;
    }
    if (borderEndX === -100000 || borderEndY === -100000) {
      return;
    }

    let intersectsX = false;
    let intersectsY = false;
    shapes.forEach((shape: Shape, index: number) => {
      const middleOfShapeX = shape.x1 + Math.floor(shape.width / 2);
      const middleOfBorderX =
        borderStartX + Math.floor((borderEndX - borderStartX) / 2);
      const middleOfShapeY = shape.y1 + Math.floor(shape.height / 2);
      const middleOfBorderY =
        borderStartY + Math.floor((borderEndY - borderStartY) / 2);
      if (
        (shape.x1 === borderStartX ||
          shape.x1 === borderEndX ||
          shape.x1 === middleOfBorderX ||
          middleOfShapeX === borderStartX ||
          middleOfShapeX === middleOfBorderX ||
          middleOfShapeX === borderEndX ||
          shape.x2 === borderStartX ||
          shape.x2 === middleOfBorderX ||
          shape.x2 === borderEndX) &&
        !selectedShapes.includes(shape.id)
      ) {
        intersectsX = true;
      }
      if (
        (shape.y1 === borderStartY ||
          shape.y1 === borderEndY ||
          shape.y1 === middleOfBorderY ||
          middleOfShapeY === borderStartY ||
          middleOfShapeY === middleOfBorderY ||
          middleOfShapeY === borderEndY ||
          shape.y2 === borderStartY ||
          shape.y2 === middleOfBorderY ||
          shape.y2 === borderEndY) &&
        !selectedShapes.includes(shape.id)
      ) {
        intersectsY = true;
      }
    });
    if (intersectsX) {
      actionsDispatch(setGridSnappedX(true));
      actionsDispatch(setGridSnappedDistanceX(0));
    }
    if (intersectsY) {
      actionsDispatch(setGridSnappedY(true));
      actionsDispatch(setGridSnappedDistanceY(0));
    }
  }, [borderStartX, borderStartY, borderEndX, borderEndY]);

  /*
    Preview useEffect:
    Responsibility -> When board is loaded, generates a preview image of the board
                      and sends it to firestore.
  */
  useEffect(() => {
    const generatePreview = () => {
      const element = document.getElementById("whiteboard");
      domtoimage
        .toJpeg(element, { quality: 0.2 })
        .then((dataUrl: string) => {
          const image = new Image();
          image.src = dataUrl;

          // Correctly convert the dataUrl to a Blob
          const byteString = atob(dataUrl.split(",")[1]); // Decode Base64 string
          const arrayBuffer = new ArrayBuffer(byteString.length);
          const uint8Array = new Uint8Array(arrayBuffer);

          for (let i = 0; i < byteString.length; i++) {
            uint8Array[i] = byteString.charCodeAt(i);
          }

          const blob = new Blob([uint8Array], { type: "image/jpeg" });

          // Upload the Blob to Firebase Storage
          const fileRef = storageRef(storage, `boardPreviews/${board.id}.jpg`);
          uploadBytes(fileRef, blob)
            .then((snapshot) => {
              console.log("File uploaded successfully!");
            })
            .catch((error) => {
              console.error("Error uploading file:", error);
            });
        })
        .catch((error: any) => {
          console.error("Error generating preview:", error);
        });
    };

    generatePreview();
  }, [board.id]);

  /*
    Hide useEffect:
    Responsibility -> Allows hiding of the options bar.
  */
  useEffect(() => {
    if (selectedShapes.length === 0) {
      dispatch(setHideOptions(true));
    } else {
      dispatch(setHideOptions(false));
    }
  }, [dispatch, selectedShapes]);

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

  const handleContextMenuClose = () => {
    setContextMenuVisible(false);
  };

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

      {contextMenuVisible && (
        <ContextMenu
          x={contextMenuX}
          y={contextMenuY}
          labels={contextMenuLabels}
          onClose={handleContextMenuClose}
        />
      )}

      {/* handlers */}
      <KeyboardEventHandler />
    </div>
  );
};

export default WhiteBoard;
