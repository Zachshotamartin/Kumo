// whiteBoard.tsx
// imports
import React, { useState, useRef, useEffect } from "react";

import { useSelector, useDispatch } from "react-redux";
import styles from "./whiteBoard.module.css";
import { ErrorBoundary } from "../ErrorBoundary";

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

import { initializeHistory } from "../../features/shapeHistory/shapeHistorySlice";
import { handleBoardChange } from "../../helpers/handleBoardChange";
import { ref, onValue, off } from "firebase/database"; // For listening to Realtime Database
import _ from "lodash";
import EnhancedKeyboardHandler from "../eventHandlers/EnhancedKeyboardHandler";
import ShortcutsHelpDialog from "../ui/ShortcutsHelpDialog";
import GeneratePreview from "../../effects/generatePreview";
import Intersections from "../../effects/intersections";
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
  const [shortcutsHelpVisible, setShortcutsHelpVisible] = useState(false);

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
    ctrl z / ctrl shift z useEffect:
    Responsibility -> This updates the whiteboard data when undo or redo is called 
                      and updates the data in the realtime db.
  */
  useEffect(() => {
    if (history?.history?.[history.currentIndex]) {
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
    }
  }, [history.currentIndex]);

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

  // Handle shortcuts help dialog toggle
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Show shortcuts help with Cmd/Ctrl + /
      if ((event.metaKey || event.ctrlKey) && event.key === "/") {
        event.preventDefault();
        setShortcutsHelpVisible(true);
      }
      // Also handle F1 key for help
      if (event.key === "F1") {
        event.preventDefault();
        setShortcutsHelpVisible(true);
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

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
          if (userDoc) {
            const userData = userDoc.data();
            setBoards({
              privateBoards: userData.privateBoardsIds || [],
              publicBoards: userData.publicBoardsIds || [],
              sharedBoards: userData.sharedBoardsIds || [],
            });
          }
        }
      });
      return () => unsubscribe();
    }
    return undefined;
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

      {/* Shape rendering with error boundaries and optimization utilities */}
      <ErrorBoundary
        fallback={
          <div
            style={{ position: "absolute", top: 10, left: 10, color: "red" }}
          >
            ⚠️ Shape rendering error
          </div>
        }
        onError={(error) => console.error("Shape rendering error:", error)}
      >
        <RenderBoxes shapes={shapes} />
        <RenderEllipses shapes={shapes} />
        <RenderText shapes={shapes} />
        <RenderImages shapes={shapes} />
        <RenderCalendars shapes={shapes} />
        <RenderComponents shapes={shapes} />
      </ErrorBoundary>

      {/* UI elements with separate error boundary */}
      <ErrorBoundary
        fallback={
          <div
            style={{ position: "absolute", top: 30, left: 10, color: "orange" }}
          >
            ⚠️ UI rendering error
          </div>
        }
      >
        {dragging && highlighting && <RenderHighlighting />}
        <RenderBorder />
        <RenderHoverBorder />
        <RenderSnappingGuides />
        <RenderCursors />
        <BottomBar />
      </ErrorBoundary>

      {/* Floating help button */}
      <button
        onClick={() => setShortcutsHelpVisible(true)}
        style={{
          position: "fixed",
          bottom: "20px",
          right: "20px",
          width: "48px",
          height: "48px",
          borderRadius: "50%",
          background: "rgba(20, 20, 25, 0.9)",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          border: "1px solid rgba(255, 255, 255, 0.15)",
          color: "rgba(255, 255, 255, 0.8)",
          fontSize: "18px",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 100,
          transition: "all 0.2s ease",
          boxShadow:
            "0 4px 12px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.1)",
          fontFamily: "Inter, -apple-system, BlinkMacSystemFont, sans-serif",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = "rgba(99, 102, 241, 0.2)";
          e.currentTarget.style.color = "rgba(255, 255, 255, 1)";
          e.currentTarget.style.transform = "scale(1.1)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = "rgba(20, 20, 25, 0.9)";
          e.currentTarget.style.color = "rgba(255, 255, 255, 0.8)";
          e.currentTarget.style.transform = "scale(1)";
        }}
        title="Keyboard Shortcuts (Cmd/Ctrl + / or F1)"
      >
        ?
      </button>

      {/* Enhanced keyboard handler with context menu and shortcuts */}
      <EnhancedKeyboardHandler>
        <div style={{ display: "none" }}></div>
      </EnhancedKeyboardHandler>

      {/* Shortcuts help dialog */}
      <ShortcutsHelpDialog
        visible={shortcutsHelpVisible}
        onClose={() => setShortcutsHelpVisible(false)}
      />

      {/* effects */}
      <ComponentVisibility />
      <Intersections />
      <GeneratePreview />
    </div>
  );
};

export default WhiteBoard;
