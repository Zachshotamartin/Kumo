import React, { useState, useRef } from "react";
import styles from "./whiteBoard.module.css";

interface Shape {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  objectType: string;
  text?: string;
}

const WhiteBoard = () => {
  const [shapes, setShapes] = useState<Shape[]>([]);
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
        objectType: "rectangle",
      };
      setShapes([...shapes, shape]);
    }
    if (currentTool === "text") {
      const shape: Shape = {
        x1: e.clientX,
        y1: e.clientY,
        x2: e.clientX,
        y2: e.clientY,
        objectType: "text",
        text: "",
      };
      setShapes([...shapes, shape]);
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (drawing) {
      if (currentTool === "rectangle") {
        const lastShape = shapes[shapes.length - 1];
        lastShape.x2 = e.clientX;
        lastShape.y2 = e.clientY;
        setShapes([...shapes.slice(0, -1), lastShape]);
      }

      if (currentTool === "text") {
        const lastShape = shapes[shapes.length - 1];
        lastShape.x2 = e.clientX;
        lastShape.y2 = e.clientY;
        setShapes([...shapes.slice(0, -1), lastShape]);
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
  };

  const handleBlur = (index: number) => {
    if (!shapes[index].text) {
      setShapes(shapes.filter((_, i) => i !== index));
    }
    setFocusedShape(null);
  };

  const handleInputChange = (
    index: number,
    e: React.ChangeEvent<HTMLTextAreaElement>
  ) => {
    const newShapes = [...shapes];
    newShapes[index].text = e.target.value;
    setShapes(newShapes);
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
      {shapes.map((shape, index) => (
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
              shape.objectType === "rectangle" ? "white" : "transparent",
            border:
              shape.objectType === "rectangle" ? "1px solid black" : "none",
          }}
        >
          {shape.objectType === "text" ? (
            <textarea
              ref={inputRef}
              style={{
                width: "100%",
                height: "100%",
                border: "1px solid white",
                backgroundColor: "transparent",
                resize: "none",
              }}
              value={shape.text}
              onChange={(e) => handleInputChange(index, e)}
              onBlur={() => handleBlur(index)}
            />
          ) : (
            <div />
          )}
        </div>
      ))}
      <button
        style={{
          backgroundColor: currentTool === "pointer" ? "lightblue" : "white",
        }}
        onClick={() => handleToolSwitch("pointer")}
      >
        pointer
      </button>
      <button
        style={{
          backgroundColor: currentTool === "rectangle" ? "lightblue" : "white",
        }}
        onClick={() => handleToolSwitch("rectangle")}
      >
        rectangle
      </button>
      <button
        style={{
          backgroundColor: currentTool === "text" ? "lightblue" : "white",
        }}
        onClick={() => handleToolSwitch("text")}
      >
        text
      </button>
    </div>
  );
};

export default WhiteBoard;
