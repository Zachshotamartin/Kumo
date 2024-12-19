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
  const canvasRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  const handleToolSwitch = (newTool: string) => {
    setDrawing(false);
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
    setDrawing(true);
    const x = e.clientX / window.percentZoomed + window.x1;
    const y = e.clientY / window.percentZoomed + window.y1;

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
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (drawing) {
      const x = e.clientX / window.percentZoomed + window.x1;
      const y = e.clientY / window.percentZoomed + window.y1;
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
      const centerX = (window.x1 + window.x2) / 2;
      const centerY = (window.y1 + window.y2) / 2;

      const newWidth = (window.x2 - window.x1) * zoomFactor;
      const newHeight = (window.y2 - window.y1) * zoomFactor;

      const newWindow: WindowState = {
        x1: centerX - newWidth / 2,
        y1: centerY - newHeight / 2,
        x2: centerX + newWidth / 2,
        y2: centerY + newHeight / 2,
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
            border: shape.type === "rectangle" ? "1px solid white" : "none",
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

