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
import RenderBoards from "../renderComponents/renderBoards";
import RenderHighlighting from "../renderComponents/renderHighlighting";
import RenderBorder from "../renderComponents/renderBorder";
import RenderGridLines from "../renderComponents/renderGridLines";
import RenderImages from "../renderComponents/renderImages";
import RenderCalendars from "../renderComponents/renderCalendars";
import RenderHoverBorder from "../renderComponents/renderHoverBorder";
import RenderSnappingGuides from "../renderComponents/renderSnappingGuides";
import boardImage from "../../res/recursive.png";
import calendarImage from "../../res/calendar.png";
import image from "../../res/image.png";
import { setHideOptions } from "../../features/hide/hide";
import { storage } from "../../config/firebase";
import { ref, uploadBytes } from "firebase/storage";
import {
  initializeHistory,
  updateHistory,
  undo,
  redo,
} from "../../features/shapeHistory/shapeHistorySlice";
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
    dispatch(initializeHistory(shapes));
  }, []);

  useEffect(() => {
    console.log("history", history);
    dispatch(
      setWhiteboardData({
        ...board,
        shapes: history.history[history.currentIndex],
      })
    );
  }, [history]);

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
          sharedWith: board.sharedWith,
          backGroundColor: board.backGroundColor,
        });
      } catch (error) {
        console.error("Error updating document:", error);
      }
    };
    updateFirebase();
  }, [
    user.uid,
    board.id,
    board.shapes,
    board.title,
    board.type,
    board.uid,
    drawing,
    dragging,
    doubleClicking,
    docRef,
    board.sharedWith,
  ]);

  // useEffect(() => {
  //   if (!docRef) {
  //     return;
  //   }
  //   const unsub = onSnapshot(
  //     docRef,
  //     (doc: { exists: () => any; data: () => any; id: any }) => {
  //       if (doc.exists()) {
  //         const data = doc.data();
  //         dispatch(
  //           setWhiteboardData({
  //             id: doc.id,
  //             shapes: data?.shapes || [],
  //             title: data?.title || "",
  //             type: data?.type || "",
  //             uid: data?.uid || "",
  //             sharedWith: data?.sharedWith || [],
  //           })
  //         );
  //       }
  //     }
  //   );
  //   return () => {
  //     unsub();
  //   };
  // }, [docRef, dispatch]);

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
        !selectedShapes.includes(index)
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
        !selectedShapes.includes(index)
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
          const fileRef = ref(storage, `boardPreviews/${board.id}.jpg`);
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
    console.log("generating Preview");
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
            const pastedShapes = JSON.parse(copiedData);
            pastedShapes.forEach((shape: Shape) => {
              dispatch(addShape(shape));
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
            
            const shapesCopy = [...selectedShapes];
            const newShapes = shapesCopy.sort((a: number, b: number) => b - a);

            newShapes.forEach((index: number) => {
              dispatch(removeShape(index));
            });
            dispatch(clearSelectedShapes());
          }
        }
      } else if (event.metaKey && event.key === "z") {
        // Undo/Redo: Command + Z

        if (event.shiftKey) {
          event.preventDefault();

          if (history.currentIndex < history.history.length - 1) {
            dispatch(redo());
          }
        } else {
          event.preventDefault();
          if (history.currentIndex > 0) {
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
    const target = e.target as HTMLElement;
    if (target.closest("button")) {
      return; // Ignore clicks on buttons
    }
    actionsDispatch(setMouseDown(true));
    const boundingRect = canvasRef.current?.getBoundingClientRect();
    const x = Math.round(
      (e.clientX - (boundingRect?.left ?? 0)) * window.percentZoomed + window.x1
    );
    const y = Math.round(
      (e.clientY - (boundingRect?.top ?? 0)) * window.percentZoomed + window.y1
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
          selected = i;
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
            x >= borderEndX - 4 / window.percentZoomed &&
            x <= borderEndX &&
            y <= borderEndY &&
            y >= borderStartY
          ) {
            resizing = true;
            actionsDispatch(setResizingRight(true));
          }
          if (
            x >= borderStartX &&
            x <= borderStartX + 4 / window.percentZoomed &&
            y <= borderEndY &&
            y >= borderStartY
          ) {
            resizing = true;
            actionsDispatch(setResizingLeft(true));
          }
          if (
            y >= borderEndY - 4 / window.percentZoomed &&
            y <= borderEndY &&
            x <= borderEndX &&
            x >= borderStartX
          ) {
            resizing = true;
            actionsDispatch(setResizingBottom(true));
          }
          if (
            y >= borderStartY &&
            y <= borderStartY + 4 / window.percentZoomed &&
            x <= borderEndX &&
            x >= borderStartX
          ) {
            resizing = true;
            actionsDispatch(setResizingTop(true));
          }
          if (
            x >= borderStartX + 4 / window.percentZoomed &&
            x <= borderEndX - 4 / window.percentZoomed &&
            y >= borderStartY + 4 / window.percentZoomed &&
            y <= borderEndY - 4 / window.percentZoomed
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
            console.log("resizing");
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
          console.log("selected Shapes", selected);
          dispatch(setSelectedShapes([selected]));
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
        color: "white",
        backgroundColor:
          selectedTool === "text" ||
          selectedTool === "calendar" ||
          selectedTool === "image"
            ? "transparent"
            : "white",
        borderColor: "black",
        opacity: 1,
        zIndex: shapes.length,
        text: "",
      };

      if (selectedTool === "calendar") {
        shape.backgroundImage = calendarImage;
      }
      if (selectedTool === "image") {
        shape.backgroundImage = image;
      }
      console.log(shape.zIndex);
      dispatch(addShape(shape));
      dispatch(setSelectedShapes([shapes.length]));
    }
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const debouncedMouseMove = useCallback(
    throttle(
      debounce((e: React.MouseEvent<HTMLDivElement>) => {
        const selectedShapesArray = shapes.filter(
          (shape: Shape, index: number) => selectedShapes.includes(index)
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
            (x >= borderEndX - 4 / window.percentZoomed &&
              x <= borderEndX &&
              y <= borderEndY - 4 / window.percentZoomed &&
              y >= borderStartY + 4 / window.percentZoomed) ||
            (x >= borderStartX &&
              x <= borderStartX + 4 / window.percentZoomed &&
              y <= borderEndY - 4 / window.percentZoomed &&
              y >= borderStartY + 4 / window.percentZoomed)
          ) {
            (e.target as HTMLElement).style.cursor = "ew-resize";
          } else if (
            (y >= borderEndY - 4 / window.percentZoomed &&
              y <= borderEndY &&
              x <= borderEndX - 4 / window.percentZoomed &&
              x >= borderStartX + 4 / window.percentZoomed) ||
            (y >= borderStartY &&
              y <= borderStartY + 4 / window.percentZoomed &&
              x <= borderEndX - 4 / window.percentZoomed &&
              x >= borderStartX + 4 / window.percentZoomed)
          ) {
            (e.target as HTMLElement).style.cursor = "ns-resize";
          } else if (
            (x >= borderStartX &&
              x <= borderStartX + 4 / window.percentZoomed &&
              y >= borderStartY &&
              y <= borderStartY + 4 / window.percentZoomed) ||
            (x >= borderEndX - 4 / window.percentZoomed &&
              x <= borderEndX &&
              y >= borderEndY - 4 / window.percentZoomed &&
              y <= borderEndY)
          ) {
            (e.target as HTMLElement).style.cursor = "nwse-resize";
          } else if (
            (x >= borderStartX &&
              x <= borderStartX + 4 / window.percentZoomed &&
              y >= borderEndY - 4 / window.percentZoomed &&
              y <= borderEndY) ||
            (x >= borderEndX - 4 / window.percentZoomed &&
              x <= borderEndX &&
              y >= borderStartY &&
              y <= borderStartY + 4 / window.percentZoomed)
          ) {
            (e.target as HTMLElement).style.cursor = "nesw-resize";
          } else {
            (e.target as HTMLElement).style.cursor = "default";
          }
        }

        if (dragging && moving) {
          if (dragOffset) {
            selectedShapesArray.forEach((shape: Shape, index: number) => {
              const width = Math.abs(shape.x2 - shape.x1);
              const height = Math.abs(shape.y2 - shape.y1);
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
              const updatedShape: Shape = {
                ...shape,
                x1: shape.x1 + offsetX,
                y1: shape.y1 + offsetY,
                x2: shape.x2 + offsetX,
                y2: shape.y2 + offsetY,
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
          if (
            (gridSnappedX && gridSnappedDistanceX >= 2) ||
            gridSnappedDistanceX <= -2
          ) {
            actionsDispatch(setGridSnappedX(false));
            actionsDispatch(setGridSnappedDistanceX(0));
          }
          if (
            gridSnappedY &&
            (gridSnappedDistanceY >= 2 || gridSnappedDistanceY <= -2)
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
            const x1 = resizingLeft ? shape.x1 + offsetX : shape.x1;
            const y1 = resizingTop ? shape.y1 + offsetY : shape.y1;
            const x2 = resizingRight ? shape.x2 + offsetX : shape.x2;
            const y2 = resizingBottom ? shape.y2 + offsetY : shape.y2;
            const width = Math.abs(x2 - x1);
            const height = Math.abs(y2 - y1);

            const updatedShape: Shape = {
              ...shape,
              x1: x1,
              y1: y1,
              x2: x2,
              y2: y2,
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
          if (
            gridSnappedX &&
            (gridSnappedDistanceX >= 2 || gridSnappedDistanceX <= -2)
          ) {
            actionsDispatch(setGridSnappedX(false));
            actionsDispatch(setGridSnappedDistanceX(0));
          }
          if (
            gridSnappedY &&
            (gridSnappedDistanceY >= 2 || gridSnappedDistanceY <= -2)
          ) {
            actionsDispatch(setGridSnappedY(false));
            actionsDispatch(setGridSnappedDistanceY(0));
          }
          setPrevMouseX(x);
          setPrevMouseY(y);
        }

        if (drawing) {
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
            updateShape({ index: shapes.length - 1, update: updatedShape })
          );

          if (
            gridSnappedX &&
            (gridSnappedDistanceX >= 2 || gridSnappedDistanceX <= -2)
          ) {
            actionsDispatch(setGridSnappedX(false));
            actionsDispatch(setGridSnappedDistanceX(0));
          }
          if (
            gridSnappedY &&
            (gridSnappedDistanceY >= 2 || gridSnappedDistanceY <= -2)
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

  // Use the throttled version in the event listener
  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    debouncedMouseMove(e);
  };

  const handleMouseUp = () => {
    if (dragging || resizing || drawing) {
      dispatch(updateHistory(shapes));
    }
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
                sharedWith: boardData.sharedWith || [],
                backGroundColor: boardData.backGroundColor || "#313131",
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
    >
      {grid && <RenderGridLines />}
      <RenderBoxes />
      <RenderEllipses />
      <RenderText />
      <RenderBoards />
      <RenderImages />
      <RenderCalendars />
      {dragging && highlighting && <RenderHighlighting />}
      <RenderBorder />
      <RenderHoverBorder />
      <RenderSnappingGuides />

      <BottomBar />
    </div>
  );
};

export default WhiteBoard;
