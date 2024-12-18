import React, { useState, useRef } from "react";
import styles from "./whiteBoard.module.css";

const WhiteBoard = () => {
  const [drawing, setDrawing] = useState(false);
  const [shape, setShape] = useState("pointer");
  const [rectangles, setRectangles] = useState<
    { x1: number; y1: number; x2: number; y2: number }[]
  >([]);
  const [textBoxes, setTextBoxes] = useState<
    { x1: number; y1: number; x2: number; y2: number; text: string }[]
  >([]);
  const [focusedTextBox, setFocusedTextBox] = useState<number | null>(null);
  const canvasRef = useRef(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  const handlePointer = () => {
    setShape("pointer");
  };
  const handleRectangle = () => {
    setShape("rectangle");
  };
  const handleText = () => {
    setShape("text");
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    setDrawing(true);
    if (shape === "rectangle") {
      const rect = {
        x1: e.clientX,
        y1: e.clientY,
        x2: e.clientX,
        y2: e.clientY,
      };
      setRectangles([...rectangles, rect]);
    }
    if (shape === "text") {
      const text = {
        x1: e.clientX,
        y1: e.clientY,
        x2: e.clientX,
        y2: e.clientY,
        text: "",
      };
      setTextBoxes([...textBoxes, text]);
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (drawing) {
      if (shape === "rectangle") {
        const lastRect = rectangles[rectangles.length - 1];
        lastRect.x2 = e.clientX;
        lastRect.y2 = e.clientY;
        setRectangles([...rectangles.slice(0, -1), lastRect]);
      }

      if (shape === "text") {
        const lastText = textBoxes[textBoxes.length - 1];
        lastText.x2 = e.clientX;
        lastText.y2 = e.clientY;
        setTextBoxes([...textBoxes.slice(0, -1), lastText]);
      }
    }
  };

  const handleMouseUp = () => {
    setDrawing(false);
    if (shape === "text") {
      setFocusedTextBox(textBoxes.length - 1);
      setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.focus();
        }
      }, 0);
    }
    setShape("pointer");
  };

  const handleBlur = (index: number) => {
    if (!textBoxes[index].text) {
      setTextBoxes(textBoxes.filter((_, i) => i !== index));
    }
    setFocusedTextBox(null);
  };

  const handleInputChange = (
    index: number,
    e: React.ChangeEvent<HTMLTextAreaElement>
  ) => {
    const newTextBoxes = [...textBoxes];
    newTextBoxes[index].text = e.target.value;
    setTextBoxes(newTextBoxes);
  };

  return (
    <div
      ref={canvasRef}
      style={{
        cursor: "crosshair",
      }}
      className={styles.whiteBoard}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
    >
      {rectangles.map((rect, index) => (
        <div
          key={index}
          style={{
            position: "absolute",
            top: `${rect.y1 > rect.y2 ? rect.y2 : rect.y1}px`,
            left: `${rect.x1 > rect.x2 ? rect.x2 : rect.x1}px`,
            width: `${
              rect.x1 > rect.x2 ? rect.x1 - rect.x2 : rect.x2 - rect.x1
            }px`,
            height: `${
              rect.y1 > rect.y2 ? rect.y1 - rect.y2 : rect.y2 - rect.y1
            }px`,
            backgroundColor: "white",
            border: "1px solid black",
          }}
        />
      ))}
      {textBoxes.map((text, index) => (
        <div
          key={index}
          style={{
            position: "absolute",
            top: `${text.y1 > text.y2 ? text.y2 : text.y1}px`,
            left: `${text.x1 > text.x2 ? text.x2 : text.x1}px`,
            width: `${
              text.x1 > text.x2 ? text.x1 - text.x2 : text.x2 - text.x1
            }px`,
            height: `${
              text.y1 > text.y2 ? text.y1 - text.y2 : text.y2 - text.y1
            }px`,
            border: "1px solid white",
          }}
        >
          {focusedTextBox === index ? (
            <textarea
              ref={inputRef}
              style={{
                width: "100%",
                height: "100%",
                border: "1px solid white",
                backgroundColor: "transparent",
                resize: "none",
              }}
              value={text.text}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                handleInputChange(index, e)
              }
              onBlur={() => handleBlur(index)}
            />
          ) : (
            <div>{text.text}</div>
          )}
        </div>
      ))}
      <button
        style={{
          backgroundColor: shape === "pointer" ? "lightblue" : "white",
        }}
        onClick={handlePointer}
      >
        pointer
      </button>
      <button
        style={{
          backgroundColor: shape === "rectangle" ? "lightblue" : "white",
        }}
        onClick={handleRectangle}
      >
        rectangle
      </button>
      <button
        style={{
          backgroundColor: shape === "text" ? "lightblue" : "white",
        }}
        onClick={handleText}
      >
        text
      </button>
    </div>
  );
};

export default WhiteBoard;
