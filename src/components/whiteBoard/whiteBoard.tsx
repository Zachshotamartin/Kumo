// whiteBoard.tsx
import React, { useState, useRef, useEffect, useCallback } from "react";
import { throttle, debounce } from "lodash";

import { useSelector, useDispatch } from "react-redux";
import styles from "./whiteBoard.module.css";
import {
  addShape,
  removeShape,
  updateShape,
} from "../../features/whiteBoard/whiteBoardSlice";
import { setWindow, WindowState } from "../../features/window/windowSlice";
import { Shape } from "../../features/whiteBoard/whiteBoardSlice";
import { db } from "../../config/firebase";
import {
  doc,
  query,
  updateDoc,
  collection,
  where,
  onSnapshot,
  getDoc,
} from "firebase/firestore";
import { AppDispatch } from "../../store";
import { setBoards } from "../../features/boards/boards";
import { setWhiteboardData } from "../../features/whiteBoard/whiteBoardSlice";
import {
  setDrawing,
  setDragging,
  setDoubleClicking,
  setMoving,
  setHighlighting,
  setPasting,
} from "../../features/actions/actionsSlice";
import {
  setSelectedShapes,
  setSelectedTool,
  clearSelectedShapes,
  setHighlightStart,
  setHighlightEnd,
  
} from "../../features/selected/selectedSlice";
import BottomBar from "../bottomBar/bottomBar";
import RenderBoxes from "../renderComponents/renderBoxes";
import RenderText from "../renderComponents/renderText";
import RenderBoards from "../renderComponents/renderBoards";
import RenderHighlighting from "../renderComponents/renderHighlighting";
import RenderBorder from "../renderComponents/renderBorder";
import RenderGridLines from "../renderComponents/renderGridLines";
import RenderImages from "../renderComponents/renderImages";
import RenderCalendars from "../renderComponents/renderCalendars";
import boardImage from "../../res/recursive.png";
import calendarImage from "../../res/calendar.png";
import image from "../../res/image.png";
import { setHideOptions } from "../../features/hide/hide";

const WhiteBoard = () => {
  const dispatch = useDispatch<AppDispatch>();
  const actionsDispatch = useDispatch();
  const selectedShapes = useSelector(
    (state: any) => state.selected.selectedShapes
  );
  const selectedTool = useSelector((state: any) => state.selected.selectedTool);
  const [snap, setSnap] = useState(false);
  const [distance, setDistance] = useState(0);
  const shapes = useSelector((state: any) => state.whiteBoard.shapes);
  const board = useSelector((state: any) => state.whiteBoard);
  const window = useSelector((state: any) => state.window);
  const user = useSelector((state: any) => state.user); // Add this line to get the user data from the Redux store
  const drawing = useSelector((state: any) => state.actions.drawing);
  const dragging = useSelector((state: any) => state.actions.dragging);
  const doubleClicking = useSelector(
    (state: any) => state.actions.doubleClicking
  );
  const moving = useSelector((state: any) => state.actions.moving);
  const highlighting = useSelector((state: any) => state.actions.highlighting);

  const borderStartX = useSelector((state: any) => state.selected.borderStartX);
  const borderStartY = useSelector((state: any) => state.selected.borderStartY);
  const borderEndX = useSelector((state: any) => state.selected.borderEndX);
  const borderEndY = useSelector((state: any) => state.selected.borderEndY);
  const grid = useSelector((state: any) => state.actions.grid);

  const [docRef, setDocRef] = useState<any>(doc(db, "boards", board.id));

  const [prevMouseX, setPrevMouseX] = useState(0);
  const [prevMouseY, setPrevMouseY] = useState(0);

  const [dragOffset, setDragOffset] = useState<{ x: number; y: number } | null>(
    null
  ); // Offset between cursor and shape position
  const canvasRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  const usersCollectionRef = collection(db, "users");

  useEffect(() => {
    if (drawing || dragging || doubleClicking) {
      return;
    }
    if (docRef.id !== board.id) {
      return;
    }
    const updateFirebase = async () => {
      try {
        await updateDoc(docRef, {
          shapes: board.shapes,
          title: board.title,
          type: board.type,
          uid: board.uid,
        });
      } catch (error) {
        console.error("Error updating document:", error);
      }
    };

    updateFirebase();
  }, [
    user?.uid,
    board.id,
    board.shapes,
    board.title,
    board.type,
    board.uid,
    drawing,
    dragging,
    doubleClicking,
  ]);

  useEffect(() => {
    if (selectedShapes.length === 0) {
      dispatch(setHideOptions(true));
    } else {
      dispatch(setHideOptions(false));
    }
  }, [selectedShapes]);

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

  useEffect(() => {
    let debounceTimeoutCopy: any;
    let debounceTimeoutPaste: any;

    const handleKeyDown = (event: KeyboardEvent) => {
      
      if (event.metaKey && event.key === "c") {
        const copyShapes = () => {
          const copiedData = selectedShapes.map((index: number) => {
            return shapes[index];
          });
          navigator.clipboard.writeText(JSON.stringify(copiedData));
        };

        // Debounced copy function
        if (debounceTimeoutCopy) return; // Ignore if already debounced for copy
        debounceTimeoutCopy = setTimeout(
          () => (debounceTimeoutCopy = null),
          300
        ); // Reset after 300ms

        event.preventDefault();
        copyShapes();
      } else if (event.metaKey && event.key === "b") {
        event.preventDefault();
        // Debounced paste function
        if (debounceTimeoutPaste) return; // Ignore if already debounced for paste
        debounceTimeoutPaste = setTimeout(
          () => (debounceTimeoutPaste = null),
          300
        ); // Reset after 300ms
        const pasteShapes = () => {
          navigator.clipboard.readText().then((copiedData) => {
            const pastedShapes = JSON.parse(copiedData);
            pastedShapes.forEach((shape: Shape) => {
              dispatch(addShape(shape));
            });
          });
        };
        event.preventDefault();
        actionsDispatch(setPasting(true));
        pasteShapes();
      } else if (event.key === "Backspace") {
        // make sure that this is not focused on a textbox
        event.preventDefault();
 
        if (selectedShapes.length > 0) {
          const shapesCopy = [...selectedShapes];
          const newShapes = shapesCopy.sort((a: number, b: number) => b - a);

          newShapes.forEach((index: number) => {
            dispatch(removeShape(index));
          });
          dispatch(clearSelectedShapes());
        }
      }
    };

    // Add event listener
    document.addEventListener("keydown", handleKeyDown);

    // Cleanup function to remove event listener when the component unmounts
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [selectedShapes, shapes]);

  const SNAP_THRESHOLD = 5; // Define snapping threshold

  const CheckCollision = () => {
    let collision = false;

    shapes.forEach((shape: Shape, index: number) => {
      if (!selectedShapes.includes(index)) {
        // Check if any edge is within the snapping threshold
        const isColliding =
          Math.abs(shape.x1 - borderStartX) <= SNAP_THRESHOLD ||
          Math.abs(shape.x2 - borderStartX) <= SNAP_THRESHOLD ||
          Math.abs(shape.x1 - borderEndX) <= SNAP_THRESHOLD ||
          Math.abs(shape.x2 - borderEndX) <= SNAP_THRESHOLD ||
          Math.abs(shape.y1 - borderStartY) <= SNAP_THRESHOLD ||
          Math.abs(shape.y2 - borderStartY) <= SNAP_THRESHOLD ||
          Math.abs(shape.y1 - borderEndY) <= SNAP_THRESHOLD ||
          Math.abs(shape.y2 - borderEndY) <= SNAP_THRESHOLD;

        if (isColliding) {
          collision = true;
        }
      }
    });
    return collision;
  };

  const nearestEdge = () => {
    let minDistance = Infinity;
    let closestEdge = "";

    shapes.forEach((shape: Shape, index: number) => {
      if (!selectedShapes.includes(index)) {
        // Calculate distances for all edges
        const distances = {
          x1Start: Math.abs(shape.x1 - borderStartX),
          x1End: Math.abs(shape.x1 - borderEndX),
          x2Start: Math.abs(shape.x2 - borderStartX),
          x2End: Math.abs(shape.x2 - borderEndX),
          y1Start: Math.abs(shape.y1 - borderStartY),
          y1End: Math.abs(shape.y1 - borderEndY),
          y2Start: Math.abs(shape.y2 - borderStartY),
          y2End: Math.abs(shape.y2 - borderEndY),
        };

        for (const [edge, distance] of Object.entries(distances)) {
          if (distance < minDistance && distance <= SNAP_THRESHOLD) {
            minDistance = distance;
            closestEdge = edge;
          }
        }
      }
    });
    return { minDistance, closestEdge };
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    if (target.closest("button")) {
      return; // Ignore clicks on buttons
    }

    const boundingRect = canvasRef.current?.getBoundingClientRect();
    const x = Math.round(
      (e.clientX - (boundingRect?.left ?? 0)) * window.percentZoomed + window.x1
    );
    const y = Math.round(
      (e.clientY - (boundingRect?.top ?? 0)) * window.percentZoomed + window.y1
    );

    if (selectedTool === "pointer") {
      let selected: number = -1;

      for (let i = shapes.length - 1; i >= 0; i--) {
        let shape = shapes[i];
        if (
          x >= Math.min(shape.x1, shape.x2) &&
          x <= Math.max(shape.x1, shape.x2) &&
          y >= Math.min(shape.y1, shape.y2) &&
          y <= Math.max(shape.y1, shape.y2)
        ) {
          selected = i;
        }
      }

      if (selectedShapes.length > 0) {
        if (
          x < Math.min(borderStartX, borderEndX) ||
          x > Math.max(borderStartX, borderEndX) ||
          y < Math.min(borderStartY, borderEndY) ||
          y > Math.max(borderStartY, borderEndY)
        ) {
          dispatch(clearSelectedShapes());
          actionsDispatch(setHighlighting(false));
        }
      }

      if (selected !== -1) {
        // Calculate the offset between the cursor and the top-left corner of the shape

        setPrevMouseX(x);
        setPrevMouseY(y);

        setDragOffset({ x: 0, y: 0 });
        actionsDispatch(setDragging(true));
        actionsDispatch(setMoving(true));
        if (!selectedShapes.includes(selected)) {
          dispatch(setSelectedShapes([selected]));
        }
      } else {
        if (
          x > Math.min(borderStartX, borderEndX) &&
          x < Math.max(borderStartX, borderEndX) &&
          y > Math.min(borderStartY, borderEndY) &&
          y < Math.max(borderStartY, borderEndY)
        ) {
          setPrevMouseX(x);
          setPrevMouseY(y);

          setDragOffset({ x: 0, y: 0 });
          actionsDispatch(setDragging(true));
          actionsDispatch(setMoving(true));
        } else {
          dispatch(clearSelectedShapes());

          actionsDispatch(setDragging(true));
          actionsDispatch(setHighlighting(true));

          dispatch(setHighlightStart([x, y]));
          dispatch(setHighlightEnd([x, y]));
        }
      }
      return;
    }

    actionsDispatch(setDrawing(true));

    if (
      selectedTool === "rectangle" ||
      selectedTool === "text" ||
      selectedTool === "board" ||
      selectedTool === "calendar" ||
      selectedTool === "image"
    ) {
      const shape: Shape = {
        // type
        type: selectedTool,

        // position
        x1: x,
        y1: y,
        x2: x,
        y2: y,

        //dimension
        width: 0,
        height: 0,

        // transform
        rotation: 0,

        // box styling
        borderRadius: 0,
        borderWidth: 0,
        borderStyle: "solid",

        // font styling
        fontSize: 12,
        fontFamily: "Arial",
        fontWeight: "normal",
        textAlign: "left",
        alignItems: "flex-start",
        textDecoration: "none",
        lineHeight: 1.2,
        letterSpacing: 0,
        rows: 1,

        // color
        color: "white",
        backgroundColor:
          selectedTool === "text" ||
          selectedTool === "board" ||
          selectedTool === "calendar" ||
          selectedTool === "image"
            ? "transparent"
            : "white",
        borderColor: "black",
        opacity: 1,

        text: "",
      };
      if (selectedTool === "board") {
        shape.backgroundImage = boardImage;
      }
      if (selectedTool === "calendar") {
        shape.backgroundImage = calendarImage;
      }
      if (selectedTool === "image") {
        shape.backgroundImage = image;
      }
      dispatch(addShape(shape));
      dispatch(setSelectedShapes([shapes.length])); // Select the newly created shape
    }
  };

  const debouncedMouseMove = useCallback(
    throttle(
      debounce((e: React.MouseEvent<HTMLDivElement>) => {
        if (dragging && moving) {
          const boundingRect = canvasRef.current?.getBoundingClientRect();
          const x = Math.round(
            (e.clientX - (boundingRect?.left ?? 0)) * window.percentZoomed +
              window.x1
          );
          const y = Math.round(
            (e.clientY - (boundingRect?.top ?? 0)) * window.percentZoomed +
              window.y1
          );

          const selectedShapesArray = shapes.filter(
            (shape: Shape, index: number) => selectedShapes.includes(index)
          );

          // if (CheckCollision()) {
          //   const { minDistance, closestEdge } = nearestEdge();

          //   selectedShapesArray.forEach((shape: Shape, index: number) => {
          //     const width = Math.abs(shape.x2 - shape.x1);
          //     const height = Math.abs(shape.y2 - shape.y1);

          //     // Adjust shape based on the nearest edge
          //     const newX1 =
          //       closestEdge.startsWith("x") && closestEdge.includes("Start")
          //         ? shape.x1 + minDistance
          //         : shape.x1;
          //     const newY1 =
          //       closestEdge.startsWith("y") && closestEdge.includes("Start")
          //         ? shape.y1 + minDistance
          //         : shape.y1;

          //     const updatedShape: Shape = {
          //       ...shape,
          //       x1: newX1,
          //       y1: newY1,
          //       x2: newX1 + width,
          //       y2: newY1 + height,
          //     };

          //     dispatch(
          //       updateShape({
          //         index: selectedShapes[index],
          //         update: updatedShape,
          //       })
          //     );
          //   });
          //}

          if (!snap) {
            if (dragOffset) {
              selectedShapesArray.forEach((shape: Shape, index: number) => {
                const width = Math.abs(shape.x2 - shape.x1);
                const height = Math.abs(shape.y2 - shape.y1);

                const updatedShape: Shape = {
                  ...shape,
                  x1: shape.x1 + x - prevMouseX,
                  y1: shape.y1 + y - prevMouseY,
                  x2: shape.x2 + x - prevMouseX,
                  y2: shape.y2 + y - prevMouseY,
                  width,
                  height,
                };

                dispatch(
                  updateShape({
                    index: selectedShapes[index],
                    update: updatedShape,
                  })
                );
              });
            }
          }
          setPrevMouseX(x);
          setPrevMouseY(y);
        }

        if (dragging && highlighting) {
          const boundingRect = canvasRef.current?.getBoundingClientRect();
          const x =
            (e.clientX - (boundingRect?.left ?? 0)) * window.percentZoomed +
            window.x1;
          const y =
            (e.clientY - (boundingRect?.top ?? 0)) * window.percentZoomed +
            window.y1;

          dispatch(setHighlightEnd([x, y]));
        }

        if (drawing) {
          const boundingRect = canvasRef.current?.getBoundingClientRect();
          const x = Math.round(
            (e.clientX - (boundingRect?.left ?? 0)) * window.percentZoomed +
              window.x1
          );
          const y = Math.round(
            (e.clientY - (boundingRect?.top ?? 0)) * window.percentZoomed +
              window.y1
          );

          const lastShape = shapes[shapes.length - 1];
          const updatedShape: Shape = {
            ...lastShape,
            x2: x,
            y2: y,
            width: Math.abs(x - lastShape.x1),
            height: Math.abs(y - lastShape.y1),
            rotation: 0,
          };
          dispatch(
            updateShape({ index: shapes.length - 1, update: updatedShape })
          );
        }
      }, 10),
      10
    ), // Adjust the throttle delay (100ms in this case)
    [dragging, selectedShapes, dragOffset, shapes, drawing, canvasRef, dispatch]
  );

  // Use the throttled version in the event listener
  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    debouncedMouseMove(e);
  };

  const handleMouseUp = () => {
    actionsDispatch(setDrawing(false));
    actionsDispatch(setDragging(false));
    setDragOffset(null);
    if (selectedTool === "text") {
      setTimeout(() => {
        actionsDispatch(setHighlighting(false));
        actionsDispatch(setMoving(false));
      }, 10);

      inputRef?.current?.focus();
    }
    // if (shapes.length > 0) {
    //   const lastShape = shapes[shapes.length - 1];
    //   const x2 = lastShape?.x2;
    //   const y2 = lastShape?.y2;
    //   const updatedShape: Shape = {
    //     ...lastShape,
    //     x2: lastShape?.x2 > lastShape?.x1 ? x2 : lastShape?.x1,
    //     y2: lastShape?.y2 > lastShape?.y1 ? y2 : lastShape?.y1,
    //     x1: x2 > lastShape?.x1 ? lastShape?.x1 : x2,
    //     y1: y2 > lastShape?.y1 ? lastShape?.y1 : y2,
    //     width: Math.abs(x2 - lastShape?.x1),
    //     height: Math.abs(y2 - lastShape?.y1),
    //     rotation: 0,
    //   };
    //   dispatch(updateShape({ index: shapes.length - 1, update: updatedShape }));
    // }
    actionsDispatch(setSelectedTool("pointer"));
    actionsDispatch(setHighlighting(false));
    actionsDispatch(setMoving(false));
    dispatch(setSelectedShapes(selectedShapes));
  };

  const handleDoubleClick = async (e: React.MouseEvent<HTMLDivElement>) => {
    actionsDispatch(setDoubleClicking(true));
    const boundingRect = canvasRef.current?.getBoundingClientRect();
    const x =
      (e.clientX - (boundingRect?.left ?? 0)) * window.percentZoomed +
      window.x1;
    const y =
      (e.clientY - (boundingRect?.top ?? 0)) * window.percentZoomed + window.y1;

    if (selectedTool === "pointer") {
      let selected = shapes
        .slice()
        .reverse()
        .findIndex(
          (shape: Shape) =>
            x >= Math.min(shape.x1, shape.x2) &&
            x <= Math.max(shape.x1, shape.x2) &&
            y >= Math.min(shape.y1, shape.y2) &&
            y <= Math.max(shape.y1, shape.y2)
        );
      if (selected !== -1) {
        selected = shapes.length - 1 - selected;
        const shape = shapes[selected];

        const shapeType = shape.type;
        if (shapeType === "board") {
          if (shape.id) {
            const documentRef = doc(db, "boards", shape.id);

            try {
              // Fetch document snapshot

              const docSnap = await getDoc(documentRef);
              setDocRef(documentRef);

              if (docSnap.exists()) {
                const boardData = docSnap.data();

                const data = {
                  shapes: boardData.shapes || [],
                  title: boardData.title || "Untitled",
                  type: boardData.type || "default",
                  uid: boardData.uid,
                  id: shape.id,
                };

                dispatch(setWhiteboardData(data));

                dispatch(clearSelectedShapes());
              } else {
                console.error(`No document found for board ID: ${board.id}`);
              }
            } catch (error) {
              console.error("Error getting document:", error);
            }
          }
        }
      } else {
        dispatch(clearSelectedShapes());
      }

      actionsDispatch(setDoubleClicking(false));
      return;
    }
  };

  const handleWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    const deltaY = event.deltaY;

    if (event.ctrlKey) {
      // Zoom logic
      const zoomFactor = deltaY > 0 ? 1.1 : 0.9;

      const boundingRect = canvasRef.current?.getBoundingClientRect();
      const cursorX =
        (event.clientX - (boundingRect?.left ?? 0)) * window.percentZoomed +
        window.x1;
      const cursorY =
        (event.clientY - (boundingRect?.top ?? 0)) * window.percentZoomed +
        window.y1;
      if (
        window.percentZoomed * zoomFactor < 2 &&
        window.percentZoomed * zoomFactor > 0.2
      ) {
        const newWindow: WindowState = {
          x1: Math.round(cursorX - (cursorX - window.x1) * zoomFactor),
          y1: Math.round(cursorY - (cursorY - window.y1) * zoomFactor),
          x2: Math.round(cursorX + (window.x2 - cursorX) * zoomFactor),
          y2: Math.round(cursorY + (window.y2 - cursorY) * zoomFactor),
          percentZoomed: Math.round(window.percentZoomed * zoomFactor),
        };
        dispatch(setWindow(newWindow));
      } else if (window.percentZoomed * zoomFactor > 2) {
        const newWindow: WindowState = {
          x1: Math.round(cursorX - (cursorX - window.x1)),
          y1: Math.round(cursorY - (cursorY - window.y1)),
          x2: Math.round(cursorX + (window.x2 - cursorX)),
          y2: Math.round(cursorY + (window.y2 - cursorY)),
          percentZoomed: Math.round(window.percentZoomed),
        };
        dispatch(setWindow(newWindow));
      } else {
        const newWindow: WindowState = {
          x1: Math.round(cursorX - (cursorX - window.x1)),
          y1: Math.round(cursorY - (cursorY - window.y1)),
          x2: Math.round(cursorX + (window.x2 - cursorX)),
          y2: Math.round(cursorY + (window.y2 - cursorY)),
          percentZoomed: Math.round(window.percentZoomed),
        };
        dispatch(setWindow(newWindow));
      }
    } else {
      // Pan logic
      const deltaX = event.deltaX * window.percentZoomed;
      const deltaY = event.deltaY * window.percentZoomed;

      const newWindow: WindowState = {
        x1: window.x1 + deltaX,
        y1: window.y1 + deltaY,
        x2: window.x2 + deltaX,
        y2: window.y2 + deltaY,
        percentZoomed: window.percentZoomed,
      };
      dispatch(setWindow(newWindow));
    }
  };
 
  return (
    <div
      ref={canvasRef}
      style={{
        cursor: selectedTool === "pointer" ? "crosshair" : "default",
        overflow: "hidden",
      }}
      className={styles.whiteBoard}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onWheel={handleWheel}
      onDoubleClick={handleDoubleClick}
    >
      {grid && <RenderGridLines />}
      <RenderBoxes />
      <RenderText />
      <RenderBoards />
      <RenderImages />
      <RenderCalendars />
      {dragging && highlighting && <RenderHighlighting />}
      <RenderBorder />

      <BottomBar />
    </div>
  );
};

export default WhiteBoard;
