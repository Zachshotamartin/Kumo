// whiteBoard.tsx
import React, { useState, useRef, useEffect, useCallback } from "react";
import { throttle, debounce, set } from "lodash";

import { useSelector, useDispatch } from "react-redux";
import styles from "./whiteBoard.module.css";
import {
  addShape,
  updateShape,
  removeShape,
} from "../../features/whiteBoard/whiteBoardSlice";
import { setWindow, WindowState } from "../../features/window/windowSlice";
import image from "../../res/image.png";
import text from "../../res/text.png";
import pointer from "../../res/select.png";
import remove from "../../res/delete.png";
import calendar from "../../res/calendar.png";
import rectangle from "../../res/rectangle.png";
import recursive from "../../res/recursive.png";
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
  addSelectedShape,
  setSelectedTool,
} from "../../features/selected/selectedSlice";

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
  const [focusedShape, setFocusedShape] = useState<number | null>(null);
  const user = useSelector((state: any) => state.user); // Add this line to get the user data from the Redux store
  const drawing = useSelector((state: any) => state.actions.drawing);
  const dragging = useSelector((state: any) => state.actions.dragging);
  const doubleClicking = useSelector(
    (state: any) => state.actions.doubleClicking
  );
  const moving = useSelector((state: any) => state.actions.moving);
  const highlighting = useSelector((state: any) => state.actions.highlighting);
  const pasting = useSelector((state: any) => state.actions.pasting);
  const [docRef, setDocRef] = useState<any>(doc(db, "boards", board.id));
  const [highlightStartX, setHighlightStartX] = useState(0);
  const [highlightStartY, setHighlightStartY] = useState(0);
  const [highlightEndX, setHighlightEndX] = useState(0);
  const [highlightEndY, setHighlightEndY] = useState(0);
  const [copiedShapes, setCopiedShapes] = useState<Shape[]>([]);
  let currentPasteAction: any = null;

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
    // search the shapes array to find all the shapes that intersect this bounding box
    const minx = Math.min(highlightStartX, highlightEndX);
    const maxx = Math.max(highlightStartX, highlightEndX);
    const miny = Math.min(highlightStartY, highlightEndY);
    const maxy = Math.max(highlightStartY, highlightEndY);
    /*************  ✨ Codeium Command 🌟  *************/
    const intersectingShapeIndices = shapes.reduce(
      (indices: number[], shape: Shape, index: number) => {
        if (
          shape.x1 < maxx &&
          shape.x2 > minx &&
          shape.y1 < maxy &&
          shape.y2 > miny
        ) {
          indices.push(index);
        }
        return indices;
      },
      []
    );
    dispatch(setSelectedShapes(intersectingShapeIndices));
  }, [highlightEndX, highlightEndY]);

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
      console.log(selectedShapes);
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
        console.log(selectedShapes);
        console.log("copied to clipboard");
        console.log(copiedShapes);
      } else if (event.metaKey && event.key === "b") {
        // Debounced paste function
        if (debounceTimeoutPaste) return; // Ignore if already debounced for paste
        debounceTimeoutPaste = setTimeout(
          () => (debounceTimeoutPaste = null),
          300
        ); // Reset after 300ms

        event.preventDefault();
        actionsDispatch(setPasting(true));
        pasteShapes();
        console.log("pasted from clipboard");
      }
    };

    // Add event listener
    document.addEventListener("keydown", handleKeyDown);

    // Cleanup function to remove event listener when the component unmounts
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [selectedShapes]);

  const handleToolSwitch = (newTool: string) => {
    actionsDispatch(setDrawing(false));
    if (newTool !== "pointer") {
      dispatch(setSelectedShapes([]));
    }

    actionsDispatch(setSelectedTool(newTool));
    if (
      newTool === "calendar" ||
      newTool === "image" ||
      newTool === "pointer"
    ) {
      actionsDispatch(setSelectedTool("pointer"));
    }
    if (newTool === "text") {
      setFocusedShape(shapes.length - 1);
      setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.focus();
        }
      }, 0);
    }
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    if (target.closest("button")) {
      return; // Ignore clicks on buttons
    }

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
        // Calculate the offset between the cursor and the top-left corner of the shape
        const offsetX = x - Math.min(shape.x1, shape.x2);
        const offsetY = y - Math.min(shape.y1, shape.y2);
        setDragOffset({ x: offsetX, y: offsetY });
        actionsDispatch(setDragging(true));
        dispatch(setSelectedShapes([selected]));
        actionsDispatch(setMoving(true));
      } else {
        dispatch(setSelectedShapes([]));
        actionsDispatch(setDragging(true));
        actionsDispatch(setHighlighting(true));

        setHighlightStartX(x);
        setHighlightStartY(y);
        setHighlightEndX(x);
        setHighlightEndY(y);
      }
      return;
    }

    actionsDispatch(setDrawing(true));

    if (
      selectedTool === "rectangle" ||
      selectedTool === "text" ||
      selectedTool === "board"
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
        backgroundColor: selectedTool === "text" ? "transparent" : "white",
        borderColor: "black",
        opacity: 1,

        text: "",
      };
      dispatch(addShape(shape));
      dispatch(setSelectedShapes([shapes.length])); // Select the newly created shape
    }
  };

  const debouncedMouseMove = useCallback(
    throttle(
      debounce((e: React.MouseEvent<HTMLDivElement>) => {
        if (dragging && moving) {
          const boundingRect = canvasRef.current?.getBoundingClientRect();
          const x =
            (e.clientX - (boundingRect?.left ?? 0)) * window.percentZoomed +
            window.x1;
          const y =
            (e.clientY - (boundingRect?.top ?? 0)) * window.percentZoomed +
            window.y1;

          if (dragOffset) {
            const shape = shapes[selectedShapes[0]];
            const width = Math.abs(shape.x2 - shape.x1);
            const height = Math.abs(shape.y2 - shape.y1);

            const updatedShape: Shape = {
              ...shape,
              x1: x - dragOffset.x,
              y1: y - dragOffset.y,
              x2: x - dragOffset.x + width,
              y2: y - dragOffset.y + height,
              width,
              height,
            };
            dispatch(
              updateShape({ index: selectedShapes[0], update: updatedShape })
            );
          }
        }

        if (dragging && highlighting) {
          const boundingRect = canvasRef.current?.getBoundingClientRect();
          const x =
            (e.clientX - (boundingRect?.left ?? 0)) * window.percentZoomed +
            window.x1;
          const y =
            (e.clientY - (boundingRect?.top ?? 0)) * window.percentZoomed +
            window.y1;

          setHighlightEndX(x);
          setHighlightEndY(y);
        }

        if (drawing) {
          const boundingRect = canvasRef.current?.getBoundingClientRect();
          const x =
            (e.clientX - (boundingRect?.left ?? 0)) * window.percentZoomed +
            window.x1;
          const y =
            (e.clientY - (boundingRect?.top ?? 0)) * window.percentZoomed +
            window.y1;

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
    [
      dragging,
      selectedShapes[0],
      dragOffset,
      shapes,
      drawing,
      canvasRef,
      dispatch,
    ]
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
      setFocusedShape(shapes.length - 1);
      setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.focus();
        }
      }, 0);
    }
    if (shapes.length > 0) {
      const lastShape = shapes[shapes.length - 1];
      const x2 = lastShape?.x2;
      const y2 = lastShape?.y2;
      const updatedShape: Shape = {
        ...lastShape,
        x2: lastShape?.x2 > lastShape?.x1 ? x2 : lastShape?.x1,
        y2: lastShape?.y2 > lastShape?.y1 ? y2 : lastShape?.y1,
        x1: x2 > lastShape?.x1 ? lastShape?.x1 : x2,
        y1: y2 > lastShape?.y1 ? lastShape?.y1 : y2,
        width: Math.abs(x2 - lastShape?.x1),
        height: Math.abs(y2 - lastShape?.y1),
        rotation: 0,
      };
      dispatch(updateShape({ index: shapes.length - 1, update: updatedShape }));
    }
    actionsDispatch(setSelectedTool("pointer"));
    actionsDispatch(setHighlighting(false));
    actionsDispatch(setMoving(false));
    console.log(selectedShapes);
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
                dispatch(setSelectedShapes([]));
              } else {
                console.error(`No document found for board ID: ${board.id}`);
              }
            } catch (error) {
              console.error("Error getting document:", error);
            }
          }
        }
      } else {
        dispatch(setSelectedShapes([]));
      }

      actionsDispatch(setDoubleClicking(false));
      return;
    }
  };

  const handleBlur = (index: number) => {
    if (!shapes[index].text) {
      dispatch(removeShape(index));
    }
    setFocusedShape(null);
  };

  const handleInputChange = (
    index: number,
    e: React.ChangeEvent<HTMLTextAreaElement>,
    rows: number
  ) => {
    const updatedShape: Shape = {
      ...shapes[index],
      text: e.target.value,
      rows: rows,
    };
    dispatch(updateShape({ index, update: updatedShape }));
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

      const newWindow: WindowState = {
        x1: cursorX - (cursorX - window.x1) * zoomFactor,
        y1: cursorY - (cursorY - window.y1) * zoomFactor,
        x2: cursorX + (window.x2 - cursorX) * zoomFactor,
        y2: cursorY + (window.y2 - cursorY) * zoomFactor,
        percentZoomed: window.percentZoomed * zoomFactor,
      };
      dispatch(setWindow(newWindow));
    } else {
      // Pan logic
      const deltaX = event.deltaX;
      const deltaY = event.deltaY;

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

  const handleDelete = () => {
    if (selectedShapes.length > 0) {
      dispatch(removeShape(selectedShapes[0]));
      dispatch(setSelectedShapes([]));

      setFocusedShape(null);
    }
  };

  const calculateUsedRows = (
    text: string,
    lineHeight: number,
    fontSize: number,
    width: number,
    fontFamily: string
  ) => {
    const div = document.createElement("div");
    div.style.position = "absolute";
    div.style.visibility = "hidden";
    div.style.whiteSpace = "pre-wrap";
    div.style.wordWrap = "break-word";
    div.style.fontSize = `${fontSize}px`;
    div.style.lineHeight = `${lineHeight}`;
    div.style.width = `${width}px`;
    div.style.fontFamily = fontFamily;

    div.textContent = text;
    document.body.appendChild(div);
    const height = div.offsetHeight;
    document.body.removeChild(div);
    const endingCharacter = text.endsWith("\n") ? 1 : 0;
    return Math.ceil(height / lineHeight) + endingCharacter;
  };

  // Add event listeners for copy and paste

  // Copy function

  // Paste function
  const pasteShapes = () => {
    navigator.clipboard.readText().then((copiedData) => {
      const pastedShapes = JSON.parse(copiedData);

      pastedShapes.forEach((shape: Shape) => {
        dispatch(addShape(shape));
      });
    });
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
      {shapes.map((shape: Shape, index: number) => (
        <div
          key={index}
          style={{
            // type
            position: "absolute",
            zIndex: selectedShapes.includes(index) ? 50 : 0,

            // position
            top: `${
              ((shape.y1 > shape.y2 ? shape.y2 : shape.y1) - window.y1) /
                window.percentZoomed -
              (selectedShapes.includes(index) ? 1 : 0)
            }px`,
            left: `${
              ((shape.x1 > shape.x2 ? shape.x2 : shape.x1) - window.x1) /
                window.percentZoomed -
              (selectedShapes.includes(index) ? 1 : 0)
            }px`,

            // dimension
            width: `${shape.width / window.percentZoomed}px`,
            height: `${shape.height / window.percentZoomed}px`,

            // transforms
            transform: `rotate(${shape.rotation || 0}deg)`,
            // flipX?: boolean;
            // flipY?: boolean;

            // box styling
            borderRadius: `${shape.borderRadius}%`,
            borderWidth: `${shape.borderWidth}px`,
            borderStyle: `${shape.borderStyle}`,
            border: selectedShapes.includes(index)
              ? "blue 1px solid"
              : `${shape.borderColor} ${shape.borderWidth}px ${shape.borderStyle}`,

            // color styling

            backgroundColor:
              shape.type === "rectangle"
                ? `${shape.backgroundColor}`
                : shape.type === "board"
                ? "pink"
                : "",

            borderColor: selectedShapes.includes(index)
              ? "blue"
              : shape.borderColor,

            opacity: `${shape.opacity}`,
          }}
        >
          {shape.type === "text" ? (
            <textarea
              ref={inputRef}
              style={{
                display: "flex",
                width: "100%",
                height: "100%",

                backgroundColor: "transparent",
                resize: "none",
                outline: "none",
                padding:
                  shape.alignItems === "flex-start"
                    ? "0 0 0 0"
                    : shape.alignItems === "flex-end"
                    ? `${
                        shape.height / window.percentZoomed -
                        (shape.lineHeight * shape.rows) / window.percentZoomed
                      }px 0 0 0`
                    : shape.alignItems === "center"
                    ? `${
                        shape.height / 2 / window.percentZoomed -
                        shape.lineHeight / 2 / window.percentZoomed
                      }px 0 ${
                        shape.height / 2 / window.percentZoomed -
                        shape.lineHeight / 2 / window.percentZoomed
                      }px 0`
                    : "0 0 0 0",

                border: "1px, solid, transparent",
                overflow: "hidden",
                whiteSpace: "nowrap",
                textOverflow: "ellipsis",

                // text styling
                fontSize: `${shape.fontSize / window.percentZoomed}px`,
                fontFamily: `${shape.fontFamily}`,
                fontWeight: `${shape.fontWeight}`,
                textAlign: shape.textAlign as "left" | "right" | "center",
                textDecoration: `${shape.textDecoration}`,
                lineHeight: `${shape.lineHeight}`,
                letterSpacing: `${
                  shape.letterSpacing / window.percentZoomed
                }px`,
                color: `${shape.color}`,
              }}
              value={shape.text}
              onChange={(e) => {
                const usedRows = calculateUsedRows(
                  e.target.value,
                  shape.lineHeight * window.percentZoomed,
                  shape.fontSize * window.percentZoomed,
                  shape.width / window.percentZoomed,
                  shape.fontFamily
                );
                handleInputChange(index, e, usedRows);
              }}
              onBlur={() => handleBlur(index)}
            />
          ) : null}
        </div>
      ))}
      {dragging && highlighting && (
        <div
          style={{
            position: "absolute",
            top: `${
              (Math.min(highlightStartY, highlightEndY) - window.y1) /
              window.percentZoomed
            }px`,
            left: `${
              (Math.min(highlightStartX, highlightEndX) - window.x1) /
              window.percentZoomed
            }px`,
            width: `${
              Math.abs(highlightEndX - highlightStartX) / window.percentZoomed
            }px`,
            height: `${
              Math.abs(highlightEndY - highlightStartY) / window.percentZoomed
            }px`,
            border: "2px solid blue",
            zIndex: 51,
          }}
        ></div>
      )}
      <div className={styles.tools}>
        <button
          onClick={() => handleToolSwitch("pointer")}
          style={{
            backgroundColor: selectedTool === "pointer" ? "red" : "transparent",
          }}
        >
          <img className={styles.icon} src={pointer} alt="" />
        </button>
        <button
          onClick={() => handleToolSwitch("rectangle")}
          style={{
            backgroundColor:
              selectedTool === "rectangle" ? "red" : "transparent",
          }}
        >
          <img className={styles.icon} src={rectangle} alt="" />
        </button>
        <button
          onClick={() => handleToolSwitch("text")}
          style={{
            backgroundColor: selectedTool === "text" ? "red" : "transparent",
          }}
        >
          <img className={styles.icon} src={text} alt="" />
        </button>
        <button
          onClick={handleDelete}
          style={{ backgroundColor: "transparent" }}
        >
          <img className={styles.icon} src={remove} alt="" />
        </button>
        <button
          onClick={() => handleToolSwitch("calendar")}
          style={{
            backgroundColor:
              selectedTool === "calendar" ? "red" : "transparent",
          }}
        >
          <img className={styles.icon} src={calendar} alt="" />
        </button>
        <button
          onClick={() => handleToolSwitch("image")}
          style={{
            backgroundColor: selectedTool === "image" ? "red" : "transparent",
          }}
        >
          <img className={styles.icon} src={image} alt="" />
        </button>
        <button
          onClick={() => handleToolSwitch("board")}
          style={{
            backgroundColor: selectedTool === "board" ? "red" : "transparent",
          }}
        >
          <img className={styles.icon} src={recursive} alt="" />
        </button>
      </div>
    </div>
  );
};

export default WhiteBoard;
