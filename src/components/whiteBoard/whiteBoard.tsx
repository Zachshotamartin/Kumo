// whiteBoard.tsx
import React, { useState, useRef, useEffect, useCallback } from "react";
import { throttle, debounce, last } from "lodash";

import { useSelector, useDispatch } from "react-redux";
import styles from "./whiteBoard.module.css";
import {
  addShape,
  removeShape,
  updateShape,
} from "../../features/whiteBoard/whiteBoardSlice";
import { setWindow, WindowState } from "../../features/window/windowSlice";
import { Shape } from "../../features/whiteBoard/whiteBoardSlice";
import { db, realtimeDb } from "../../config/firebase";
import {
  doc,
  query,
  updateDoc,
  collection,
  where,
  onSnapshot,
  getDoc,
  runTransaction,
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
  setResizing,
  setResizingLeft,
  setResizingRight,
  setResizingTop,
  setResizingBottom,
  setMouseDown,
  setGridSnappedX,
  setGridSnappedY,
  setGridSnappedDistanceX,
  setGridSnappedDistanceY,
  setMiddleMouseButton,
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
import calendarImage from "../../res/calendar.png";

import image from "../../res/image.png";
import { setHideOptions } from "../../features/hide/hide";
import { storage } from "../../config/firebase";
import { ref as storageRef, uploadBytes } from "firebase/storage";
import {
  initializeHistory,
  updateHistory,
  undo,
  redo,
} from "../../features/shapeHistory/shapeHistorySlice";
import { handleBoardChange } from "../../helpers/handleBoardChange";

import { ref, onValue, off, update } from "firebase/database"; // For listening to Realtime Database
import _ from "lodash";
const domtoimage = require("dom-to-image");

const WhiteBoard = () => {
  const dispatch = useDispatch<AppDispatch>();
  const actionsDispatch = useDispatch();
  const selectedShapes = useSelector(
    (state: any) => state.selected.selectedShapes
  );
  const selectedTool = useSelector((state: any) => state.selected.selectedTool);
  const shapes = useSelector((state: any) => state.whiteBoard.shapes);

  const board = useSelector((state: any) => state.whiteBoard);
  const window = useSelector((state: any) => state.window);
  const history = useSelector((state: any) => state.shapeHistory);
  const user = useSelector((state: any) => state.auth);
  const drawing = useSelector((state: any) => state.actions.drawing);
  const dragging = useSelector((state: any) => state.actions.dragging);
  const resizing = useSelector((state: any) => state.actions.resizing);
  const resizingLeft = useSelector((state: any) => state.actions.resizingLeft);
  const resizingRight = useSelector(
    (state: any) => state.actions.resizingRight
  );
  const resizingTop = useSelector((state: any) => state.actions.resizingTop);
  const resizingBottom = useSelector(
    (state: any) => state.actions.resizingBottom
  );
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
  const gridSnappedX = useSelector((state: any) => state.actions.gridSnappedX);
  const gridSnappedY = useSelector((state: any) => state.actions.gridSnappedY);
  const gridSnappedDistanceX = useSelector(
    (state: any) => state.actions.gridSnappedDistanceX
  );
  const gridSnappedDistanceY = useSelector(
    (state: any) => state.actions.gridSnappedDistanceY
  );
  const middleMouseButton = useSelector(
    (state: any) => state.actions.middleMouseButton
  );
  const [docRef, setDocRef] = useState<any>(doc(db, "boards", board.id));

  const [prevMouseX, setPrevMouseX] = useState(0);
  const [prevMouseY, setPrevMouseY] = useState(0);
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number } | null>(
    null
  ); // Offset between cursor and shape position
  const [contextMenuVisible, setContextMenuVisible] = useState(false);
  const [contextMenuX, setContextMenuX] = useState(0);
  const [contextMenuY, setContextMenuY] = useState(0);
  const [contextMenuLabels, setContextMenuLabels] = useState<
    { label: string; onClick: () => void }[]
  >([]);
  const [middle, setMiddle] = useState(false);
  const canvasRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const usersCollectionRef = collection(db, "users");

  useEffect(() => {
    dispatch(initializeHistory(shapes));
  }, []);

  useEffect(() => {
    setMiddle(middleMouseButton);
  }, [middleMouseButton]);

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

  useEffect(() => {
    if (!dragging && !resizing && !drawing) {
      if (shapes !== history.history[history.currentIndex]) {
        dispatch(updateHistory(shapes));
      }
    }
  }, [shapes, dragging, resizing, drawing]);

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
        console.log("Board data changed!");
        if (user.uid !== boardData.lastChangedBy) {
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

  useEffect(() => {
    if (selectedShapes.length === 0) {
      dispatch(setHideOptions(true));
    } else {
      dispatch(setHideOptions(false));
    }
  }, [dispatch, selectedShapes]);

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
          const copiedData = shapes.map((shape: Shape) => {
            return selectedShapes.includes(shape.id) ? shape : null;
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
      } else if (event.metaKey && event.key === "v") {
        event.preventDefault();
        // Debounced paste function
        if (debounceTimeoutPaste) return; // Ignore if already debounced for paste
        debounceTimeoutPaste = setTimeout(
          () => (debounceTimeoutPaste = null),
          300
        ); // Reset after 300ms

        const pasteShapes = () => {
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
            dispatch(
              setWhiteboardData({
                ...board,
                shapes: [...shapes, ...pastedShapes],
              })
            );
            handleBoardChange({
              ...board,
              shapes: [...shapes, ...pastedShapes],
            });
          });
        };

        actionsDispatch(setPasting(true));
        pasteShapes();
      } else if (event.key === "Backspace") {
        // Ensure this is not focused on a textbox
        const target = event.target as HTMLElement | null;

        if (
          target &&
          (target.tagName === "INPUT" || target.tagName === "TEXTAREA")
        ) {
        } else {
          event.preventDefault();
          if (selectedShapes.length > 0) {
            const shapesCopy = shapes.filter((shape: Shape, index: number) => {
              return !selectedShapes.includes(shape.id);
            });

            dispatch(
              setWhiteboardData({
                ...board,
                shapes: shapesCopy,
              })
            );
            handleBoardChange({
              ...board,
              shapes: shapesCopy,
            });
            dispatch(clearSelectedShapes());
          }
        }
      } else if ((event.metaKey || event.ctrlKey) && event.key === "z") {
        // Undo/Redo: Command + Z

        if (event.shiftKey) {
          event.preventDefault();

          if (history.currentIndex < history.history.length - 1) {
            console.log("trying to redo");
            dispatch(redo());
          }
        } else {
          event.preventDefault();
          if (history.currentIndex > 0) {
            console.log("trying to undo");
            dispatch(undo());
          }
        }
      }
    };

    // Add event listener
    document.addEventListener("keydown", handleKeyDown);

    // Cleanup function to remove event listener when the component unmounts
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [actionsDispatch, dispatch, selectedShapes, shapes]);

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.button === 1) {
      const boundingRect = canvasRef.current?.getBoundingClientRect();
      const x = Math.round(
        (e.clientX - (boundingRect?.left ?? 0)) * window.percentZoomed
      );
      const y = Math.round(
        (e.clientY - (boundingRect?.top ?? 0)) * window.percentZoomed
      );
      actionsDispatch(setMiddleMouseButton(true));

      setPrevMouseX(x);
      setPrevMouseY(y);
      setDragOffset({ x: 0, y: 0 });
    } else if (e.button === 0) {
      const target = e.target as HTMLElement;
      if (target.closest("button")) {
        return; // Ignore clicks on buttons
      }
      if (
        document.getElementById("contextMenu") === target ||
        document.getElementById("contextMenu")?.contains(target)
      ) {
        return;
      } else {
        if (contextMenuVisible) {
          setContextMenuVisible(false);
        }
      }

      actionsDispatch(setMouseDown(true));
      const boundingRect = canvasRef.current?.getBoundingClientRect();
      const x = Math.round(
        (e.clientX - (boundingRect?.left ?? 0)) * window.percentZoomed +
          window.x1
      );
      const y = Math.round(
        (e.clientY - (boundingRect?.top ?? 0)) * window.percentZoomed +
          window.y1
      );

      if (selectedTool === "pointer") {
        let selected: number = -1;

        for (let i = 0; i < shapes.length; i++) {
          let shape = shapes[i];
          if (
            x >= Math.min(shape.x1, shape.x2) &&
            x <= Math.max(shape.x1, shape.x2) &&
            y >= Math.min(shape.y1, shape.y2) &&
            y <= Math.max(shape.y1, shape.y2)
          ) {
            // if cursor is within a shape.
            selected = shape.id;
            if (e.shiftKey) {
              if (!selectedShapes.includes(selected)) {
                dispatch(setSelectedShapes([...selectedShapes, selected]));
              }
            }
            actionsDispatch(setDrawing(false));
          }
        }

        if (selectedShapes.length > 0) {
          if (
            x < Math.min(borderStartX, borderEndX) ||
            x > Math.max(borderStartX, borderEndX) ||
            y < Math.min(borderStartY, borderEndY) ||
            y > Math.max(borderStartY, borderEndY)
          ) {
            // if cursor is outside the bounding box
            dispatch(clearSelectedShapes());
            actionsDispatch(setHighlighting(false));
          }

          let resizing = false;
          if (selectedShapes.length > 0) {
            if (
              x >= borderEndX - 10 / window.percentZoomed &&
              x <= borderEndX &&
              y <= borderEndY &&
              y >= borderStartY
            ) {
              resizing = true;
              actionsDispatch(setResizingRight(true));
            }
            if (
              x >= borderStartX &&
              x <= borderStartX + 10 / window.percentZoomed &&
              y <= borderEndY &&
              y >= borderStartY
            ) {
              resizing = true;
              actionsDispatch(setResizingLeft(true));
            }
            if (
              y >= borderEndY - 10 / window.percentZoomed &&
              y <= borderEndY &&
              x <= borderEndX &&
              x >= borderStartX
            ) {
              resizing = true;
              actionsDispatch(setResizingBottom(true));
            }
            if (
              y >= borderStartY &&
              y <= borderStartY + 10 / window.percentZoomed &&
              x <= borderEndX &&
              x >= borderStartX
            ) {
              resizing = true;
              actionsDispatch(setResizingTop(true));
            }
            if (
              x >= borderStartX + 10 / window.percentZoomed &&
              x <= borderEndX - 10 / window.percentZoomed &&
              y >= borderStartY + 10 / window.percentZoomed &&
              y <= borderEndY - 10 / window.percentZoomed
            ) {
              actionsDispatch(setDragging(true));
              actionsDispatch(setMoving(true));
              setPrevMouseX(x);
              setPrevMouseY(y);
              setDragOffset({ x: 0, y: 0 });
              return;
            }
            if (resizing) {
              // if cursor is on the border of the bounding box to resize shape
              actionsDispatch(setResizing(true));
              setPrevMouseX(x);
              setPrevMouseY(y);
              setDragOffset({ x: 0, y: 0 });
              actionsDispatch(setDragging(true));

              return;
            }
          }
        }

        if (selected !== -1) {
          // if something is selected

          setPrevMouseX(x);
          setPrevMouseY(y);

          setDragOffset({ x: 0, y: 0 });
          actionsDispatch(setDragging(true));
          actionsDispatch(setMoving(true));

          if (!selectedShapes.includes(selected)) {
            // if something is selected but not already within the bounding box
            if (e.shiftKey) {
              dispatch(setSelectedShapes([...selectedShapes, selected]));
            }
            if (!e.shiftKey) {
              dispatch(setSelectedShapes([selected]));
            }
          }
        } else {
          if (
            x > Math.min(borderStartX, borderEndX) &&
            x < Math.max(borderStartX, borderEndX) &&
            y > Math.min(borderStartY, borderEndY) &&
            y < Math.max(borderStartY, borderEndY)
          ) {
            // if nothing is selected but cursor is still in the selected bounding box
            setPrevMouseX(x);
            setPrevMouseY(y);

            setDragOffset({ x: 0, y: 0 });
            actionsDispatch(setDragging(true));
            actionsDispatch(setMoving(true));
          } else {
            // if nothing is selected
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
        selectedTool === "ellipse" ||
        selectedTool === "text" ||
        selectedTool === "calendar" ||
        selectedTool === "image"
      ) {
        const shape: Shape = {
          // type
          type: selectedTool,
          // position
          id:
            Math.random().toString(36).substring(2, 10) +
            new Date().getTime().toString(36),
          x1: x,
          y1: y,
          x2: x,
          y2: y,

          //dimension
          width: 0,
          height: 0,
          level: 0,
          // transform
          rotation: 0,

          // box styling
          borderRadius: selectedTool === "ellipse" ? 1000 : 0,
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
          color: "#ffffff",
          backgroundColor:
            selectedTool === "text" ||
            selectedTool === "calendar" ||
            selectedTool === "image"
              ? "transparent"
              : "#ffffff",
          borderColor: "#000000",
          opacity: 1,
          zIndex:
            shapes.length === 0
              ? 0
              : shapes[shapes.length - 1].type !== "component"
              ? shapes[shapes.length - 1].zIndex + 1
              : shapes[shapes.length - 1].shapes[
                  shapes[shapes.length - 1].shapes.length - 1
                ].zIndex + 1,
          text: "",
        };

        if (selectedTool === "calendar") {
          shape.backgroundImage = calendarImage;
        }
        if (selectedTool === "image") {
          shape.backgroundImage = image;
        }
        dispatch(
          setWhiteboardData({
            ...board,
            shapes: [...shapes, shape],
            currentUsers: [
              ...(board.currentUsers || []).filter(
                (curUser: any) => curUser?.user !== user.uid
              ),
              { user: user.uid, cursorX: x, cursorY: y },
            ],
          })
        );
        handleBoardChange({
          ...board,
          shapes: [...shapes, shape],
          currentUsers: [
            ...(board.currentUsers || []).filter(
              (curUser: any) => curUser?.user !== user.uid
            ),
            { user: user.uid, cursorX: x, cursorY: y },
          ],
        });
        dispatch(setSelectedShapes([shape.id]));
      }
    }
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const debouncedMouseMove = useCallback(
    throttle(
      debounce((e: React.MouseEvent<HTMLDivElement>) => {
        const selectedShapesArray = shapes.filter(
          (shape: Shape, index: number) => {
            return selectedShapes.includes(shape.id);
          }
        );

        const boundingRect = canvasRef.current?.getBoundingClientRect();
        const x = Math.round(
          (e.clientX - (boundingRect?.left ?? 0)) * window.percentZoomed +
            window.x1
        );
        const y = Math.round(
          (e.clientY - (boundingRect?.top ?? 0)) * window.percentZoomed +
            window.y1
        );

        if (selectedShapesArray.length > 0) {
          if (
            (x >= borderEndX - 10 / window.percentZoomed &&
              x <= borderEndX &&
              y <= borderEndY - 10 / window.percentZoomed &&
              y >= borderStartY + 10 / window.percentZoomed) ||
            (x >= borderStartX &&
              x <= borderStartX + 10 / window.percentZoomed &&
              y <= borderEndY - 10 / window.percentZoomed &&
              y >= borderStartY + 10 / window.percentZoomed)
          ) {
            (e.target as HTMLElement).style.cursor = "ew-resize";
          } else if (
            (y >= borderEndY - 10 / window.percentZoomed &&
              y <= borderEndY &&
              x <= borderEndX - 10 / window.percentZoomed &&
              x >= borderStartX + 10 / window.percentZoomed) ||
            (y >= borderStartY &&
              y <= borderStartY + 10 / window.percentZoomed &&
              x <= borderEndX - 10 / window.percentZoomed &&
              x >= borderStartX + 10 / window.percentZoomed)
          ) {
            (e.target as HTMLElement).style.cursor = "ns-resize";
          } else if (
            (x >= borderStartX &&
              x <= borderStartX + 10 / window.percentZoomed &&
              y >= borderStartY &&
              y <= borderStartY + 10 / window.percentZoomed) ||
            (x >= borderEndX - 10 / window.percentZoomed &&
              x <= borderEndX &&
              y >= borderEndY - 10 / window.percentZoomed &&
              y <= borderEndY)
          ) {
            (e.target as HTMLElement).style.cursor = "nwse-resize";
          } else if (
            (x >= borderStartX &&
              x <= borderStartX + 10 / window.percentZoomed &&
              y >= borderEndY - 10 / window.percentZoomed &&
              y <= borderEndY) ||
            (x >= borderEndX - 10 / window.percentZoomed &&
              x <= borderEndX &&
              y >= borderStartY &&
              y <= borderStartY + 10 / window.percentZoomed)
          ) {
            (e.target as HTMLElement).style.cursor = "nesw-resize";
          } else {
            (e.target as HTMLElement).style.cursor = "default";
          }
        }

        if (dragging && moving) {
          console.log("moving");
          if (dragOffset) {
            const updatedShapes: Shape[] = [];
            selectedShapesArray.forEach((shape: Shape, index: number) => {
              let offsetX = x - prevMouseX;
              let offsetY = y - prevMouseY;

              if (gridSnappedX) {
                actionsDispatch(
                  setGridSnappedDistanceX(offsetX + gridSnappedDistanceX)
                );
                offsetX = 0;
              }
              if (gridSnappedY) {
                actionsDispatch(
                  setGridSnappedDistanceY(offsetY + gridSnappedDistanceY)
                );
                offsetY = 0;
              }
              let updatedShape: Shape = {
                ...shape,
                x1: shape.x1 + offsetX,
                y1: shape.y1 + offsetY,
                x2: shape.x2 + offsetX,
                y2: shape.y2 + offsetY,
              };
              if (shape.type === "component") {
                updatedShape = {
                  ...updatedShape,
                  shapes: updatedShape.shapes?.map((componentShape: Shape) => {
                    return {
                      ...componentShape,
                      x1: componentShape.x1 + offsetX,
                      y1: componentShape.y1 + offsetY,
                      x2: componentShape.x2 + offsetX,
                      y2: componentShape.y2 + offsetY,
                    };
                  }),
                };
              }
              updatedShapes.push(updatedShape);
            });

            dispatch(
              setWhiteboardData({
                ...board,
                shapes: [
                  ...board.shapes.filter((shape: Shape, index: number) => {
                    return !selectedShapes.includes(shape.id);
                  }),
                  ...updatedShapes,
                ],

                currentUsers: [
                  ...(board.currentUsers || []).filter(
                    (curUser: any) => curUser?.user !== user.uid
                  ),
                  { user: user.uid, cursorX: x, cursorY: y },
                ],
                lastChangedBy: user.uid,
              })
            );

            handleBoardChange({
              ...board,
              shapes: [
                ...board.shapes.filter((shape: Shape, index: number) => {
                  return !selectedShapes.includes(shape.id);
                }),
                ...updatedShapes,
              ],
              currentUsers: [
                ...(board.currentUsers || []).filter(
                  (curUser: any) => curUser?.user !== user.uid
                ),
                { user: user.uid, cursorX: x, cursorY: y },
              ],
              lastChangedBy: user.uid,
            });
          }
          if (
            gridSnappedX &&
            (gridSnappedDistanceX / window.percentZoomed >= 5 ||
              gridSnappedDistanceX / window.percentZoomed <= -5)
          ) {
            actionsDispatch(setGridSnappedX(false));
            actionsDispatch(setGridSnappedDistanceX(0));
          }
          if (
            gridSnappedY &&
            (gridSnappedDistanceY / window.percentZoomed >= 5 ||
              gridSnappedDistanceY / window.percentZoomed <= -5)
          ) {
            actionsDispatch(setGridSnappedY(false));
            actionsDispatch(setGridSnappedDistanceY(0));
          }
          setPrevMouseX(x);
          setPrevMouseY(y);
        }

        if (dragging && highlighting) {
          dispatch(setHighlightEnd([x, y]));
        }

        if (dragging && resizing) {
          console.log("resizing");
          let updatedShapes: Shape[] = [];
          selectedShapesArray.forEach((shape: Shape, index: number) => {
            let offsetX = x - prevMouseX;
            let offsetY = y - prevMouseY;

            if (gridSnappedX) {
              actionsDispatch(
                setGridSnappedDistanceX(offsetX + gridSnappedDistanceX)
              );
              offsetX = 0;
            }
            if (gridSnappedY) {
              actionsDispatch(
                setGridSnappedDistanceY(offsetY + gridSnappedDistanceY)
              );
              offsetY = 0;
            }

            let x1 = shape.x1;
            let x2 = shape.x2;
            let y1 = shape.y1;
            let y2 = shape.y2;

            if (resizingRight) {
              let ratioX1 = (x1 - borderStartX) / (borderEndX - borderStartX);
              let ratioX2 = (x2 - borderStartX) / (borderEndX - borderStartX);
              x1 =
                borderStartX + ratioX1 * (borderEndX + offsetX - borderStartX);
              x2 =
                borderStartX + ratioX2 * (borderEndX + offsetX - borderStartX);
            } else if (resizingLeft) {
              let ratioX1 = (borderEndX - x1) / (borderEndX - borderStartX);
              let ratioX2 = (borderEndX - x2) / (borderEndX - borderStartX);
              x1 =
                borderEndX - ratioX1 * (borderEndX - (borderStartX + offsetX));
              x2 =
                borderEndX - ratioX2 * (borderEndX - (borderStartX + offsetX));
            }

            if (resizingBottom) {
              let ratioY1 = (y1 - borderStartY) / (borderEndY - borderStartY);
              let ratioY2 = (y2 - borderStartY) / (borderEndY - borderStartY);
              y1 =
                borderStartY + ratioY1 * (borderEndY + offsetY - borderStartY);
              y2 =
                borderStartY + ratioY2 * (borderEndY + offsetY - borderStartY);
            } else if (resizingTop) {
              let ratioY1 = (borderEndY - y1) / (borderEndY - borderStartY);
              let ratioY2 = (borderEndY - y2) / (borderEndY - borderStartY);
              y1 =
                borderEndY - ratioY1 * (borderEndY - (borderStartY + offsetY));
              y2 =
                borderEndY - ratioY2 * (borderEndY - (borderStartY + offsetY));
            }

            const width = Math.abs(x2 - x1);
            const height = Math.abs(y2 - y1);

            let updatedShape: Shape = {
              ...shape,
              x1: x1,
              y1: y1,
              x2: x2,
              y2: y2,
              width,
              height,
            };
            if (shape.type === "component") {
              updatedShape = {
                ...updatedShape,
                shapes: updatedShape.shapes?.map(
                  (componentShape: Shape, index: number) => {
                    let x1 = componentShape.x1;
                    let x2 = componentShape.x2;
                    let y1 = componentShape.y1;
                    let y2 = componentShape.y2;

                    if (resizingRight) {
                      let ratioX1 =
                        (x1 - borderStartX) / (borderEndX - borderStartX);
                      let ratioX2 =
                        (x2 - borderStartX) / (borderEndX - borderStartX);

                      x1 =
                        borderStartX +
                        ratioX1 * (borderEndX + offsetX - borderStartX);
                      x2 =
                        borderStartX +
                        ratioX2 * (borderEndX + offsetX - borderStartX);
                    } else if (resizingLeft) {
                      let ratioX1 =
                        (borderEndX - x1) / (borderEndX - borderStartX);
                      let ratioX2 =
                        (borderEndX - x2) / (borderEndX - borderStartX);
                      x1 =
                        borderEndX -
                        ratioX1 * (borderEndX - (borderStartX + offsetX));
                      x2 =
                        borderEndX -
                        ratioX2 * (borderEndX - (borderStartX + offsetX));
                    }

                    if (resizingBottom) {
                      let ratioY1 =
                        (y1 - borderStartY) / (borderEndY - borderStartY);
                      let ratioY2 =
                        (y2 - borderStartY) / (borderEndY - borderStartY);
                      y1 =
                        borderStartY +
                        ratioY1 * (borderEndY + offsetY - borderStartY);
                      y2 =
                        borderStartY +
                        ratioY2 * (borderEndY + offsetY - borderStartY);
                    } else if (resizingTop) {
                      let ratioY1 =
                        (borderEndY - y1) / (borderEndY - borderStartY);
                      let ratioY2 =
                        (borderEndY - y2) / (borderEndY - borderStartY);
                      y1 =
                        borderEndY -
                        ratioY1 * (borderEndY - (borderStartY + offsetY));
                      y2 =
                        borderEndY -
                        ratioY2 * (borderEndY - (borderStartY + offsetY));
                    }

                    const width = Math.abs(x2 - x1);
                    const height = Math.abs(y2 - y1);
                    return {
                      ...componentShape,
                      x1: x1,
                      y1: y1,
                      x2: x2,
                      y2: y2,
                      width,
                      height,
                    };
                  }
                ),
              };
            }
            updatedShapes.push(updatedShape);
          });

          dispatch(
            setWhiteboardData({
              ...board,
              shapes: [
                ...board.shapes.filter((shape: Shape, index: number) => {
                  return !selectedShapes.includes(shape.id);
                }),
                ...updatedShapes,
              ],
              currentUsers: [
                ...(board.currentUsers || []).filter(
                  (curUser: any) => curUser?.user !== user.uid
                ),
                { user: user.uid, cursorX: x, cursorY: y },
              ],
            })
          );
          handleBoardChange({
            ...board,
            shapes: [
              ...board.shapes.filter((shape: Shape, index: number) => {
                return !selectedShapes.includes(shape.id);
              }),
              ...updatedShapes,
            ],
            currentUsers: [
              ...(board.currentUsers || []).filter(
                (curUser: any) => curUser?.user !== user.uid
              ),
              { user: user.uid, cursorX: x, cursorY: y },
            ],
          });
          if (
            gridSnappedX &&
            (gridSnappedDistanceX / window.percentZoomed >= 5 ||
              gridSnappedDistanceX / window.percentZoomed <= -5)
          ) {
            actionsDispatch(setGridSnappedX(false));
            actionsDispatch(setGridSnappedDistanceX(0));
          }
          if (
            gridSnappedY &&
            (gridSnappedDistanceY / window.percentZoomed >= 5 ||
              gridSnappedDistanceY / window.percentZoomed <= -5)
          ) {
            actionsDispatch(setGridSnappedY(false));
            actionsDispatch(setGridSnappedDistanceY(0));
          }
          setPrevMouseX(x);
          setPrevMouseY(y);
        }

        if (drawing) {
          console.log("drawing");
          const lastShape = shapes[shapes.length - 1];
          let offsetX = x - lastShape.x2;
          let offsetY = y - lastShape.y2;
          if (gridSnappedX) {
            actionsDispatch(
              setGridSnappedDistanceX(offsetX + gridSnappedDistanceX)
            );
            offsetX = 0;
          }
          if (gridSnappedY) {
            actionsDispatch(
              setGridSnappedDistanceY(offsetY + gridSnappedDistanceY)
            );
            offsetY = 0;
          }

          const updatedShape: Shape = {
            ...lastShape,
            x2: lastShape.x2 + offsetX,
            y2: lastShape.y2 + offsetY,
            width: Math.abs(lastShape.x2 + offsetX - lastShape.x1),
            height: Math.abs(lastShape.y2 + offsetY - lastShape.y1),
            rotation: 0,
          };
          dispatch(
            setWhiteboardData({
              ...board,
              shapes: [
                ...board.shapes.slice(0, shapes.length - 1),
                updatedShape,
              ],
              currentUsers: [
                ...(board.currentUsers || []).filter(
                  (curUser: any) => curUser?.user !== user.uid
                ),
                { user: user.uid, cursorX: x, cursorY: y },
              ],
            })
          );
          handleBoardChange({
            ...board,
            shapes: [...board.shapes.slice(0, shapes.length - 1), updatedShape],
            currentUsers: [
              ...(board.currentUsers || []).filter(
                (curUser: any) => curUser?.user !== user.uid
              ),
              { user: user.uid, cursorX: x, cursorY: y },
            ],
          });

          if (
            gridSnappedX &&
            (gridSnappedDistanceX / window.percentZoomed >= 5 ||
              gridSnappedDistanceX / window.percentZoomed <= -5)
          ) {
            actionsDispatch(setGridSnappedX(false));
            actionsDispatch(setGridSnappedDistanceX(0));
          }
          if (
            gridSnappedY &&
            (gridSnappedDistanceY / window.percentZoomed >= 5 ||
              gridSnappedDistanceY / window.percentZoomed <= -5)
          ) {
            actionsDispatch(setGridSnappedY(false));
            actionsDispatch(setGridSnappedDistanceY(0));
          }
        }
      }, 10),
      10
    ), // Adjust the throttle delay (100ms in this case)
    [dragging, selectedShapes, dragOffset, shapes, drawing, canvasRef, dispatch]
  );
  const debouncedMiddleMouseMove = useCallback(
    throttle(
      debounce((e: React.MouseEvent<HTMLDivElement>) => {
        const boundingRect = canvasRef.current?.getBoundingClientRect();
        const x = Math.round(
          (e.clientX - (boundingRect?.left ?? 0)) * window.percentZoomed
        );
        const y = Math.round(
          (e.clientY - (boundingRect?.top ?? 0)) * window.percentZoomed
        );

        let offsetX = x - prevMouseX;
        let offsetY = y - prevMouseY;

        const deltaX = offsetX * window.percentZoomed;
        const deltaY = offsetY * window.percentZoomed;

        const newWindow: WindowState = {
          x1: window.x1 - deltaX,
          y1: window.y1 - deltaY,
          x2: window.x2 - deltaX,
          y2: window.y2 - deltaY,
          percentZoomed: window.percentZoomed,
        };
        dispatch(setWindow(newWindow));
        setPrevMouseX(x);
        setPrevMouseY(y);
      }, 1),
      1
    ),
    [prevMouseX, prevMouseY]
  );
  // Use the throttled version in the event listener
  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!middle) {
      debouncedMouseMove(e);
    } else if (middle) {
      debouncedMiddleMouseMove(e);
    }
  };

  const handleMouseUp = () => {
    if (!middleMouseButton) {
      actionsDispatch(setMouseDown(false));
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

      actionsDispatch(setSelectedTool("pointer"));
      actionsDispatch(setHighlighting(false));
      actionsDispatch(setMoving(false));
      actionsDispatch(setResizing(false));
      actionsDispatch(setResizingLeft(false));
      actionsDispatch(setResizingRight(false));
      actionsDispatch(setResizingTop(false));
      actionsDispatch(setResizingBottom(false));
      dispatch(setSelectedShapes(selectedShapes));
    } else {
      actionsDispatch(setMiddleMouseButton(false));
    }
  };

  const handleDoubleClick = async (e: React.MouseEvent<HTMLDivElement>) => {
    console.log("double click");
    actionsDispatch(setDoubleClicking(true));

    const boundingRect = canvasRef.current?.getBoundingClientRect();
    const x =
      (e.clientX - (boundingRect?.left ?? 0)) * window.percentZoomed +
      window.x1;
    const y =
      (e.clientY - (boundingRect?.top ?? 0)) * window.percentZoomed + window.y1;

    if (selectedTool !== "pointer") {
      actionsDispatch(setDoubleClicking(false));
      return;
    }

    const selectedShape = shapes
      .slice()
      .reverse()
      .find(
        (shape: Shape) =>
          x >= Math.min(shape.x1, shape.x2) &&
          x <= Math.max(shape.x1, shape.x2) &&
          y >= Math.min(shape.y1, shape.y2) &&
          y <= Math.max(shape.y1, shape.y2)
      );

    if (!selectedShape?.boardId) {
      dispatch(clearSelectedShapes());
      actionsDispatch(setDoubleClicking(false));
      return;
    }

    const nextBoardId = selectedShape.boardId;
    const nextBoardRef = ref(realtimeDb, `boards/${nextBoardId}`);
    const curBoardRef = ref(realtimeDb, `boards/${board.id}`);

    if (!board?.id || typeof board.id !== "string") {
      console.error("Invalid current board ID:", board?.id);
      actionsDispatch(setDoubleClicking(false));
      return;
    }

    try {
      onValue(nextBoardRef, (snapshot) => {
        if (!snapshot.exists()) {
          console.error(`No data found for board ID: ${nextBoardId}`);
          actionsDispatch(setDoubleClicking(false));
          return;
        }

        const boardData = snapshot.val();
        if (!boardData || typeof boardData !== "object") {
          console.error("Invalid board data:", boardData);
          actionsDispatch(setDoubleClicking(false));
          return;
        }

        const useruid = localStorage.getItem("user");
        const updatedCurrentUsers =
          board.currentUsers?.filter(
            (curUser: any) => curUser.user !== useruid
          ) || [];

        const updatedCurrentBoard = {
          ...board,
          lastChangedBy: user?.uid,
          currentUsers: updatedCurrentUsers,
        };

        console.log("Switching to board:", nextBoardId, boardData);

        update(curBoardRef, updatedCurrentBoard);
        dispatch(clearSelectedShapes());
        dispatch(setWhiteboardData({ ...boardData, id: nextBoardId }));

        actionsDispatch(setDoubleClicking(false));
      });
    } catch (error) {
      console.error("Error switching boards:", error);
      actionsDispatch(setDoubleClicking(false));
    }
  };

  const handleWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    const deltaY = event.deltaY;

    if (event.metaKey || event.ctrlKey) {
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
        window.percentZoomed * zoomFactor < 4 &&
        window.percentZoomed * zoomFactor > 0.05
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

  const handleContextMenu = (event: React.MouseEvent<HTMLDivElement>) => {
    const boundingRect = canvasRef.current?.getBoundingClientRect();
    const x = Math.round(
      (event.clientX - (boundingRect?.left ?? 0)) * window.percentZoomed +
        window.x1
    );
    const y = Math.round(
      (event.clientY - (boundingRect?.top ?? 0)) * window.percentZoomed +
        window.y1
    );
    let contextMenuLabels: { label: string; onClick: () => void }[] = [];

    const target = event.target as HTMLElement;

    if (
      x > borderStartX &&
      x < borderEndX &&
      y > borderStartY &&
      y < borderEndY
    ) {
      contextMenuLabels = [
        {
          label: "delete",
          onClick: () => {
            event.preventDefault();
            if (selectedShapes.length > 0) {
              const shapesCopy = shapes.filter(
                (shape: Shape, index: number) => {
                  return selectedShapes.includes(shape.id);
                }
              );

              shapesCopy.forEach((shape: Shape) => {
                dispatch(removeShape(shape));
              });
              dispatch(clearSelectedShapes());
            }
          },
        },
        {
          label: "copy",
          onClick: () => {
            const copiedData = selectedShapes.map((index: number) => {
              return shapes[index];
            });
            navigator.clipboard.writeText(JSON.stringify(copiedData));
          },
        },
        {
          label: "move to top",
          onClick: () => {
            const endIndex = shapes.length - 1;
            const startIndex = selectedShapes[0];

            let newShapes: Shape[] = [];
            if (endIndex === startIndex) {
              return;
            }
            shapes.forEach((shape: Shape, i: number) => {
              if (startIndex !== null) {
                if (i > endIndex && i > startIndex) {
                  newShapes.push(shape);
                } else if (i < endIndex && i < startIndex) {
                  newShapes.push(shape);
                } else {
                  if (i === startIndex) {
                    newShapes.push({
                      ...shapes[startIndex],
                      zIndex: endIndex,
                    });
                  } else if (endIndex < startIndex) {
                    newShapes.push({
                      ...shapes[i],
                      zIndex: i + 1,
                    });
                  } else if (endIndex > startIndex) {
                    newShapes.push({
                      ...shapes[i],
                      zIndex: i - 1,
                    });
                  }
                }
              }
            });
            dispatch(
              setWhiteboardData({
                ...board,
                shapes: newShapes.sort(
                  (a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0)
                ),
                currentUsers: [
                  ...(board.currentUsers || []).filter(
                    (curUser: any) => curUser?.user !== user.uid
                  ),
                  { user: user.uid, cursorX: x, cursorY: y },
                ],
              })
            );
            handleBoardChange({
              ...board,
              shapes: newShapes.sort(
                (a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0)
              ),
              currentUsers: [
                ...(board.currentUsers || []).filter(
                  (curUser: any) => curUser?.user !== user.uid
                ),
                { user: user.uid, cursorX: x, cursorY: y },
              ],
            });

            dispatch(setSelectedShapes([endIndex]));
          },
        },
        {
          label: "move to bottom",
          onClick: () => {
            const endIndex = 0;
            const startIndex = selectedShapes[0];

            let newShapes: Shape[] = [];
            if (endIndex === startIndex) {
              return;
            }
            shapes.forEach((shape: Shape, i: number) => {
              if (startIndex !== null) {
                if (i > endIndex && i > startIndex) {
                  newShapes.push(shape);
                } else if (i < endIndex && i < startIndex) {
                  newShapes.push(shape);
                } else {
                  if (i === startIndex) {
                    newShapes.push({
                      ...shapes[startIndex],
                      zIndex: endIndex,
                    });
                  } else if (endIndex < startIndex) {
                    newShapes.push({
                      ...shapes[i],
                      zIndex: i + 1,
                    });
                  } else if (endIndex > startIndex) {
                    newShapes.push({
                      ...shapes[i],
                      zIndex: i - 1,
                    });
                  }
                }
              }
            });
            dispatch(
              setWhiteboardData({
                ...board,
                shapes: newShapes.sort(
                  (a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0)
                ),
                currentUsers: [
                  ...(board.currentUsers || []).filter(
                    (curUser: any) => curUser?.user !== user.uid
                  ),
                  { user: user.uid, cursorX: x, cursorY: y },
                ],
              })
            );
            handleBoardChange({
              ...board,
              shapes: newShapes.sort(
                (a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0)
              ),
              currentUsers: [
                ...(board.currentUsers || []).filter(
                  (curUser: any) => curUser?.user !== user.uid
                ),
                { user: user.uid, cursorX: x, cursorY: y },
              ],
            });

            dispatch(setSelectedShapes([endIndex]));
          },
        },
      ];

      if (
        shapes.filter((shape: Shape) => {
          return selectedShapes.includes(shape.id);
        })[0].type === "component"
      ) {
        contextMenuLabels.push({
          label: "unwrap component",
          onClick: () => {
            dispatch(
              setWhiteboardData({
                ...board,
                shapes: [
                  ...shapes.filter((shape: Shape, index: number) => {
                    return shape.id !== selectedShapes[0];
                  }),
                  ...shapes.filter(
                    (shape: Shape) => shape.id === selectedShapes[0]
                  )[0].shapes,
                ],
                currentUsers: [
                  ...(board.currentUsers || []).filter(
                    (curUser: any) => curUser?.user !== user.uid
                  ),
                  { user: user.uid, cursorX: x, cursorY: y },
                ],
              })
            );
            handleBoardChange({
              ...board,
              shapes: [
                ...shapes.filter((shape: Shape, index: number) => {
                  return shape.id !== selectedShapes[0];
                }),
                ...shapes.filter(
                  (shape: Shape) => shape.id === selectedShapes[0]
                )[0].shapes,
              ],
              currentUsers: [
                ...(board.currentUsers || []).filter(
                  (curUser: any) => curUser?.user !== user.uid
                ),
                { user: user.uid, cursorX: x, cursorY: y },
              ],
            });

            dispatch(clearSelectedShapes());
          },
        });
      } else {
        contextMenuLabels.push({
          label: "create component",
          onClick: () => {
            event.preventDefault();
            const selectedShapesArray = shapes.filter((shape: Shape) =>
              selectedShapes.includes(shape.id)
            );
            const hasComponent = selectedShapesArray.some(
              (shape: Shape) => shape.type === "component"
            );

            if (hasComponent) {
              alert(
                "cannot make a component with a component: not implemented as of now"
              );
              return;
            }

            const x1 = selectedShapesArray.reduce(
              (minX: number, shape: Shape) => Math.min(minX, shape.x1),
              Infinity
            );
            const y1 = selectedShapesArray.reduce(
              (minY: number, shape: Shape) => Math.min(minY, shape.y1),
              Infinity
            );
            const x2 = selectedShapesArray.reduce(
              (maxX: number, shape: Shape) => Math.max(maxX, shape.x2),
              -Infinity
            );
            const y2 = selectedShapesArray.reduce(
              (maxY: number, shape: Shape) => Math.max(maxY, shape.y2),
              -Infinity
            );

            if (selectedShapes.length > 0) {
              const shapesCopy = shapes.filter(
                (shape: Shape, index: number) => {
                  return selectedShapes.includes(shape.id);
                }
              );

              let zIndexFixedShapes = shapes.filter(
                (shape: Shape, index: number) => {
                  return !selectedShapes.includes(shape.id);
                }
              );

              zIndexFixedShapes = zIndexFixedShapes.sort(
                (a: Shape, b: Shape) => (a.zIndex ?? 0) - (b.zIndex ?? 0)
              );

              zIndexFixedShapes = zIndexFixedShapes.map(
                (shape: Shape, index: number) => {
                  if (shape.type !== "component") {
                    return {
                      ...shape,
                      zIndex: index,
                    };
                  } else {
                    return {
                      ...shape,
                      zIndex: index,
                      shapes: shape.shapes?.map(
                        (innerShape: Shape, idx: number) => {
                          return {
                            ...innerShape,
                            zIndex: index + idx + 1,
                          };
                        }
                      ),
                    };
                  }
                }
              );
              let zIndex = 1;

              if (zIndexFixedShapes.length > 0) {
                zIndex =
                  zIndexFixedShapes[zIndexFixedShapes.length - 1]?.zIndex + 1;

                if (
                  zIndexFixedShapes[zIndexFixedShapes.length - 1]?.type ===
                  "component"
                ) {
                  zIndex =
                    zIndexFixedShapes[zIndexFixedShapes.length - 1]?.shapes[
                      zIndexFixedShapes[zIndexFixedShapes.length - 1]?.shapes
                        .length - 1
                    ]?.zIndex + 1;
                }
              }

              const component = selectedShapesArray.map(
                (shape: Shape, index: number) => {
                  return {
                    ...shape,
                    level: shape.level + 1,
                    zIndex: zIndex + index + 1,
                  };
                }
              );
              const newComponent = {
                type: "component",
                shapes: component,
                id:
                  Math.random().toString(36).substring(2, 10) +
                  new Date().getTime().toString(36),
                x1: x1,
                y1: y1,
                x2: x2,
                y2: y2,
                width: x2 - x1,
                height: y2 - y1,
                level: 0,
                zIndex: zIndex,
                backgroundColor: "none",
                borderColor: "none",
                borderRadius: 0,
                borderStyle: "none",
                borderWidth: "none",
                color: "none",
              };
              zIndexFixedShapes.push(newComponent);
              zIndexFixedShapes = zIndexFixedShapes.sort(
                (a: Shape, b: Shape) => (a.zIndex ?? 0) - (b.zIndex ?? 0)
              );

              shapesCopy.forEach((shape: Shape) => {
                dispatch(removeShape(shape));
              });
              dispatch(clearSelectedShapes());
              dispatch(
                setWhiteboardData({
                  ...board,
                  shapes: zIndexFixedShapes,
                  currentUsers: [
                    ...(board.currentUsers || []).filter(
                      (curUser: any) => curUser?.user !== user.uid
                    ),
                    { user: user.uid, cursorX: x, cursorY: y },
                  ],
                })
              );
              handleBoardChange({
                ...board,
                shapes: zIndexFixedShapes,
                currentUsers: [
                  ...(board.currentUsers || []).filter(
                    (curUser: any) => curUser?.user !== user.uid
                  ),
                  { user: user.uid, cursorX: x, cursorY: y },
                ],
              });
            }
          },
        });
      }
    } else {
      contextMenuLabels = [
        {
          label: "paste",
          onClick: () => {
            navigator.clipboard.readText().then((copiedData) => {
              const pastedShapes = JSON.parse(copiedData);
              dispatch(
                setWhiteboardData({
                  ...board,
                  shapes: [...shapes, ...pastedShapes],
                  currentUsers: [
                    ...(board.currentUsers || []).filter(
                      (curUser: any) => curUser?.user !== user.uid
                    ),
                    { user: user.uid, cursorX: x, cursorY: y },
                  ],
                })
              );
              handleBoardChange({
                ...board,
                shapes: [...shapes, ...pastedShapes],
                currentUsers: [
                  ...(board.currentUsers || []).filter(
                    (curUser: any) => curUser?.user !== user.uid
                  ),
                  { user: user.uid, cursorX: x, cursorY: y },
                ],
              });
            });
          },
        },
        {
          label: "undo",
          onClick: () => {
            if (history.currentIndex > 0) {
              dispatch(undo());
            }
          },
        },
        {
          label: "redo",
          onClick: () => {
            if (history.currentIndex < history.history.length - 1) {
              dispatch(redo());
            }
          },
        },
      ];
    }

    event.preventDefault();
    setContextMenuVisible(true);
    setContextMenuLabels(contextMenuLabels);
    setContextMenuX(event.clientX);
    setContextMenuY(event.clientY);
  };
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
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onWheel={handleWheel}
      onDoubleClick={handleDoubleClick}
      onContextMenu={handleContextMenu}
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
    </div>
  );
};

export default WhiteBoard;
