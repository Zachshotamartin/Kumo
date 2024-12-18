// whiteBoard.tsx
import React, { useState, useRef } from "react";
import { useSelector, useDispatch } from "react-redux";
import styles from "./whiteBoard.module.css";
import {
  addShape,
  updateShape,
  removeShape,
} from "../../features/whiteBoard/whiteBoardSlice";

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
  const [drawing, setDrawing] = useState(false);
  const [focusedShape, setFocusedShape] = useState<number | null>(null);
  const [currentTool, setCurrentTool] = useState("pointer");
  const canvasRef = useRef(null);
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
    if (currentTool === "rectangle") {
      const shape: Shape = {
        x1: e.clientX,
        y1: e.clientY,
        x2: e.clientX,
        y2: e.clientY,
        type: "rectangle",
      };
      dispatch(addShape(shape));
    }
    if (currentTool === "text") {
      const shape: Shape = {
        x1: e.clientX,
        y1: e.clientY,
        x2: e.clientX,
        y2: e.clientY,
        type: "text",
        text: "",
      };
      dispatch(addShape(shape));
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (drawing) {
      if (currentTool === "rectangle") {
        const lastShape = shapes[shapes.length - 1];
        const updatedShape: Shape = {
          ...lastShape,
          x2: e.clientX,
          y2: e.clientY,
        };
        dispatch(
          updateShape({ index: shapes.length - 1, update: updatedShape })
        );
      }

      if (currentTool === "text") {
        const lastShape = shapes[shapes.length - 1];
        const updatedShape: Shape = {
          ...lastShape,
          x2: e.clientX,
          y2: e.clientY,
        };
        dispatch(
          updateShape({ index: shapes.length - 1, update: updatedShape })
        );
      }
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

  return (
    <div
      ref={canvasRef}
      style={{
        cursor: currentTool === "pointer" ? "crosshair" : "default",
      }}
      className={styles.whiteBoard}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
    >
      {shapes.map((shape: Shape, index: number) => (
        <div
          key={index}
          style={{
            position: "absolute",
            top: `${shape.y1 > shape.y2 ? shape.y2 : shape.y1}px`,
            left: `${shape.x1 > shape.x2 ? shape.x2 : shape.x1}px`,
            width: `${
              shape.x1 > shape.x2 ? shape.x1 - shape.x2 : shape.x2 - shape.x1
            }px`,
            height: `${
              shape.y1 > shape.y2 ? shape.y1 - shape.y2 : shape.y2 - shape.y1
            }px`,
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
          style={{ backgroundColor: currentTool === "text" ? "red" : "white" }}
        >
          Text
        </button>
      </div>
    </div>
  );
};

export default WhiteBoard;
