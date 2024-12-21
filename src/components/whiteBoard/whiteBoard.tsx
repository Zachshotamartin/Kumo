// whiteBoard.tsx
import React, { useState, useRef } from "react";
import { useSelector, useDispatch } from "react-redux";
import styles from "./whiteBoard.module.css";
import {
  addShape,
  updateShape,
  removeShape,
  setSelectedShape,
} from "../../features/whiteBoard/whiteBoardSlice";
import { setWindow, WindowState } from "../../features/window/windowSlice";
import image from "../../res/image.png";
import text from "../../res/text.png";
import pointer from "../../res/select.png";
import remove from "../../res/delete.png";
import calendar from "../../res/calendar.png";
import rectangle from "../../res/rectangle.png";
import { Shape } from "../../features/whiteBoard/whiteBoardSlice";
import { db } from "../../config/firebase";
import { doc, updateDoc } from "firebase/firestore";

const WhiteBoard = () => {
  const dispatch = useDispatch();
  const selectedShape = useSelector(
    (state: any) => state.whiteBoard.selectedShape
  );

  const shapes = useSelector((state: any) => state.whiteBoard.shapes);
  const board = useSelector((state: any) => state.whiteBoard);
  const window = useSelector((state: any) => state.window);
  const [focusedShape, setFocusedShape] = useState<number | null>(null);
  const [drawing, setDrawing] = useState(false);
  const [dragging, setDragging] = useState(false); // Track dragging state
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number } | null>(
    null
  ); // Offset between cursor and shape position
  const [currentTool, setCurrentTool] = useState("pointer");
  const canvasRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  const updateFireBase = async () => {
    const docRef = doc(db, "boards", board.id);
    try {
      await updateDoc(docRef, {
        selectedShape: board.selectedShape,
        shapes: board.shapes,
        title: board.title,
        type: board.type,
        uid: board.uid,
      });
    } catch (error) {
      console.error("Error updating document:", error);
    }
  };

  const handleToolSwitch = (newTool: string) => {
    setDrawing(false);
    if (newTool !== "pointer") {
      dispatch(setSelectedShape(null));
      updateFireBase();
    }

    setCurrentTool(newTool);
    if (
      newTool === "calendar" ||
      newTool === "image" ||
      newTool === "pointer"
    ) {
      setCurrentTool("pointer");
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

    if (currentTool === "pointer") {
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
        setDragging(true);
        dispatch(setSelectedShape(selected));
        updateFireBase();
      } else {
        dispatch(setSelectedShape(null));
        updateFireBase();
      }
      return;
    }

    setDrawing(true);

    if (currentTool === "rectangle" || currentTool === "text") {
      const shape: Shape = {
        // type
        type: currentTool,

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
        backgroundColor: currentTool === "text" ? "transparent" : "white",
        borderColor: "black",
        opacity: 1,

        text: "",
      };
      dispatch(addShape(shape));
      dispatch(setSelectedShape(shapes.length)); // Select the newly created shape
      updateFireBase();
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (dragging && selectedShape !== null) {
      const boundingRect = canvasRef.current?.getBoundingClientRect();
      const x =
        (e.clientX - (boundingRect?.left ?? 0)) * window.percentZoomed +
        window.x1;
      const y =
        (e.clientY - (boundingRect?.top ?? 0)) * window.percentZoomed +
        window.y1;

      if (dragOffset) {
        const shape = shapes[selectedShape];
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
        dispatch(updateShape({ index: selectedShape, update: updatedShape }));
      }
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
      dispatch(updateShape({ index: shapes.length - 1, update: updatedShape }));
    }
  };

  const handleMouseUp = () => {
    setDrawing(false);
    setDragging(false);
    setDragOffset(null);
    if (currentTool === "text") {
      setFocusedShape(shapes.length - 1);
      setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.focus();
        }
      }, 0);
    }
    setCurrentTool("pointer");
    updateFireBase();
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
    console.log("Deleted shape:", selectedShape);
    if (selectedShape !== null) {
      dispatch(removeShape(selectedShape));
      dispatch(setSelectedShape(null));
      updateFireBase();
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

  return (
    <div
      ref={canvasRef}
      style={{
        cursor: currentTool === "pointer" ? "crosshair" : "default",
        overflow: "hidden",
      }}
      className={styles.whiteBoard}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onWheel={handleWheel}
    >
      {shapes.map((shape: Shape, index: number) => (
        <div
          key={index}
          style={{
            // type
            position: "absolute",

            // position
            top: `${
              ((shape.y1 > shape.y2 ? shape.y2 : shape.y1) - window.y1) /
              window.percentZoomed
            }px`,
            left: `${
              ((shape.x1 > shape.x2 ? shape.x2 : shape.x1) - window.x1) /
              window.percentZoomed
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
            border:
              index === selectedShape
                ? "2px solid blue"
                : shape.type === "rectangle"
                ? "1px solid white"
                : "none",

            // color styling

            backgroundColor:
              shape.type === "rectangle"
                ? `${shape.backgroundColor}`
                : "transparent",
            borderColor: `${shape.borderColor}`,
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
      <div className={styles.tools}>
        <button
          onClick={() => handleToolSwitch("pointer")}
          style={{
            backgroundColor: currentTool === "pointer" ? "red" : "transparent",
          }}
        >
          <img className={styles.icon} src={pointer} alt="" />
        </button>
        <button
          onClick={() => handleToolSwitch("rectangle")}
          style={{
            backgroundColor:
              currentTool === "rectangle" ? "red" : "transparent",
          }}
        >
          <img className={styles.icon} src={rectangle} alt="" />
        </button>
        <button
          onClick={() => handleToolSwitch("text")}
          style={{
            backgroundColor: currentTool === "text" ? "red" : "transparent",
          }}
        >
          <img className={styles.icon} src={text} alt="" />
        </button>
        <button onClick={handleDelete}>
          <img className={styles.icon} src={remove} alt="" />
        </button>
        <button
          onClick={() => handleToolSwitch("calendar")}
          style={{
            backgroundColor: currentTool === "calendar" ? "red" : "transparent",
          }}
        >
          <img className={styles.icon} src={calendar} alt="" />
        </button>
        <button
          onClick={() => handleToolSwitch("image")}
          style={{
            backgroundColor: currentTool === "image" ? "red" : "transparent",
          }}
        >
          <img className={styles.icon} src={image} alt="" />
        </button>
      </div>
    </div>
  );
};

export default WhiteBoard;
