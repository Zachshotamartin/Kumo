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

interface Shape {
  type: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  text?: string;
}

const WhiteBoard = () => {
  const dispatch = useDispatch();
  const selectedShape = useSelector(
    (state: any) => state.whiteBoard.selectedShape
  );

  const shapes = useSelector((state: any) => state.whiteBoard.shapes);
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

  const handleToolSwitch = (newTool: string) => {
    setDrawing(false);
    if (newTool !== "pointer") {
      dispatch(setSelectedShape(null));
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
      } else {
        dispatch(setSelectedShape(null));
      }
      return;
    }

    setDrawing(true);

    if (currentTool === "rectangle" || currentTool === "text") {
      const shape: Shape = {
        x1: x,
        y1: y,
        x2: x,
        y2: y,
        type: currentTool,
        text: currentTool === "text" ? "" : undefined,
      };
      dispatch(addShape(shape));
      dispatch(setSelectedShape(shapes.length)); // Select the newly created shape
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
  };
  const handleBlur = (index: number) => {
    if (!shapes[index].text) {
      dispatch(removeShape(index));
    }
    setFocusedShape(null);
  };

  const handleInputChange = (
    index: number,
    e: React.ChangeEvent<HTMLTextAreaElement>
  ) => {
    const updatedShape: Shape = {
      ...shapes[index],
      text: e.target.value,
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

      const newWidth = (window.x2 - window.x1) * zoomFactor;
      const newHeight = (window.y2 - window.y1) * zoomFactor;

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
      const newShapes = shapes.filter(
        (index: number) => index !== selectedShape
      );
      dispatch(removeShape(selectedShape)); // Update the store
      dispatch(setSelectedShape(null)); // Deselect after deletion

      // Ensure the focused shape is reset if required
      setFocusedShape(null);
    }
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
            position: "absolute",
            top: `${
              ((shape.y1 > shape.y2 ? shape.y2 : shape.y1) - window.y1) /
              window.percentZoomed
            }px`,
            left: `${
              ((shape.x1 > shape.x2 ? shape.x2 : shape.x1) - window.x1) /
              window.percentZoomed
            }px`,
            width: `${Math.abs(shape.x1 - shape.x2) / window.percentZoomed}px`,
            height: `${Math.abs(shape.y1 - shape.y2) / window.percentZoomed}px`,
            backgroundColor:
              shape.type === "rectangle" ? "white" : "transparent",
            border:
              index === selectedShape
                ? "2px solid blue"
                : shape.type === "rectangle"
                ? "1px solid white"
                : "none",
          }}
        >
          {shape.type === "text" ? (
            <textarea
              ref={inputRef}
              style={{
                width: "100%",
                height: "100%",
                border: "1px solid white",
                backgroundColor: "transparent",
                resize: "none",
                outline: "none",
                padding: "0",
                overflow: "hidden",
                whiteSpace: "nowrap",
                textOverflow: "ellipsis",
              }}
              value={shape.text}
              onChange={(e) => handleInputChange(index, e)}
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
