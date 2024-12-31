import React from "react";
import styles from "./bottomBar.module.css";
import image from "../../res/image.png";
import text from "../../res/text.png";
import pointer from "../../res/select.png";
import remove from "../../res/delete.png";
import calendar from "../../res/calendar.png";
import rectangle from "../../res/rectangle.png";
import recursive from "../../res/recursive.png";
import { useSelector, useDispatch } from "react-redux";
import { setSelectedTool } from "../../features/selected/selectedSlice";
import { setDrawing } from "../../features/actions/actionsSlice";
import { AppDispatch } from "../../store";
import { setSelectedShapes } from "../../features/selected/selectedSlice";
import { removeShape } from "../../features/whiteBoard/whiteBoardSlice";
import { setBorderStartX, setBorderStartY, setBorderEndX, setBorderEndY } from "../../features/selected/selectedSlice";

const BottomBar = () => {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const selectedTool = useSelector((state: any) => state.selected.selectedTool);
  const selectedShapes = useSelector(
    (state: any) => state.selected.selectedShapes
  );
  const actionsDispatch = useDispatch();
  const dispatch = useDispatch<AppDispatch>();

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
      setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.focus();
        }
      }, 0);
    }
  };

  const handleDelete = () => {
    if (selectedShapes.length > 0) {
      const shapesCopy = [...selectedShapes];
      const newShapes = shapesCopy.sort((a: number, b: number) => b - a);

      newShapes.forEach((index: number) => {
        dispatch(removeShape(index));
      });
      dispatch(setSelectedShapes([]));
      dispatch(setBorderStartX(0));
      dispatch(setBorderStartY(0));
      dispatch(setBorderEndX(0));
      dispatch(setBorderEndY(0));
    }
  };

  return (
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
          backgroundColor: selectedTool === "rectangle" ? "red" : "transparent",
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
      <button onClick={handleDelete} style={{ backgroundColor: "transparent" }}>
        <img className={styles.icon} src={remove} alt="" />
      </button>
      <button
        onClick={() => handleToolSwitch("calendar")}
        style={{
          backgroundColor: selectedTool === "calendar" ? "red" : "transparent",
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
  );
};

export default BottomBar;
