// whiteBoard.tsx
import React, { useState, useRef } from "react";
import { useSelector, useDispatch } from "react-redux";
import styles from "./whiteBoard.module.css";
import {
  addShape,
  updateShape,
  removeShape,
} from "../../features/whiteBoard/whiteBoardSlice";
import { setWindow, WindowState } from "../../features/window/windowSlice";

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
  const shapes = useSelector((state: any) => state.whiteBoard.shapes);
  const window = useSelector((state: any) => state.window);

  const [drawing, setDrawing] = useState(false);
  const [focusedShape, setFocusedShape] = useState<number | null>(null);
  const [currentTool, setCurrentTool] = useState("pointer");
  const [selectedShape, setSelectedShape] = useState<number | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  const handleToolSwitch = (newTool: string) => {
    setDrawing(false);
    if (newTool !== "pointer") {
      setSelectedShape(null);
    }
    setCurrentTool(newTool);
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
    if (e.target instanceof HTMLButtonElement) {
      return;
    }

    const boundingRect = canvasRef.current?.getBoundingClientRect();
    const x =
      (e.clientX - (boundingRect?.left ?? 0)) * window.percentZoomed +
      window.x1;
    const y =
      (e.clientY - (boundingRect?.top ?? 0)) * window.percentZoomed + window.y1;

    if (currentTool === "pointer") {
      // Check if a shape is selected
      const selected = shapes.findIndex(
        (shape: Shape) =>
          x >= Math.min(shape.x1, shape.x2) &&
          x <= Math.max(shape.x1, shape.x2) &&
          y >= Math.min(shape.y1, shape.y2) &&
          y <= Math.max(shape.y1, shape.y2)
      );
      setSelectedShape(selected !== -1 ? selected : null);
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
      setSelectedShape(shapes.length); // Select the newly created shape
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
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
    if (selectedShape !== null) {
      dispatch(removeShape(selectedShape));
      setSelectedShape(null);
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
            backgroundColor: currentTool === "pointer" ? "red" : "white",
          }}
        >
          Pointer
        </button>
        <button
          onClick={() => handleToolSwitch("rectangle")}
          style={{
            backgroundColor: currentTool === "rectangle" ? "red" : "white",
          }}
        >
          Rectangle
        </button>
        <button
          onClick={() => handleToolSwitch("text")}
          style={{
            backgroundColor: currentTool === "text" ? "red" : "white",
          }}
        >
          Text
        </button>
        <button
          onClick={handleDelete}
          style={{
            backgroundColor: "white",
            marginLeft: "10px",
          }}
        >
          Delete
        </button>
        <p>
          {window.width}, {window.height}, {window.percentZoomed}
        </p>
        <p>
          x1 {window.x1}, y1 {window.y1}, x2 {window.x2}, y2 {window.y2}
        </p>
        <p>
          {shapes[0]?.x1}, {shapes[0]?.y1}
        </p>
      </div>
    </div>
  );
};

export default WhiteBoard;
