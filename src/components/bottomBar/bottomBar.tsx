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
import {
  setBorderStartX,
  setBorderStartY,
  setBorderEndX,
  setBorderEndY,
} from "../../features/selected/selectedSlice";

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
        className={styles.button}
      >
        <img
          className={
            selectedTool === "pointer" ? styles.iconSelected : styles.icon
          }
          src={pointer}
          alt=""
        />
      </button>
      <button
        onClick={() => handleToolSwitch("rectangle")}
        className={styles.button}
      >
        <img
          className={
            selectedTool === "rectangle" ? styles.iconSelected : styles.icon
          }
          src={rectangle}
          alt=""
        />
      </button>
      <button
        onClick={() => handleToolSwitch("text")}
        className={styles.button}
      >
        <img
          className={
            selectedTool === "text" ? styles.iconSelected : styles.icon
          }
          src={text}
          alt=""
        />
      </button>
      <button
        onClick={handleDelete}
        style={{ backgroundColor: "transparent" }}
        className={styles.button}
      >
        <img className={styles.icon} src={remove} alt="" />
      </button>
      <button
        onClick={() => handleToolSwitch("calendar")}
        className={styles.button}
      >
        <img
          className={
            selectedTool === "calendar" ? styles.iconSelected : styles.icon
          }
          src={calendar}
          alt=""
        />
      </button>
      <button
        onClick={() => handleToolSwitch("image")}
        className={styles.button}
      >
        <img
          className={
            selectedTool === "image" ? styles.iconSelected : styles.icon
          }
          src={image}
          alt=""
        />
      </button>
      <button
        onClick={() => handleToolSwitch("board")}
        className={styles.button}
      >
        <img
          className={
            selectedTool === "board" ? styles.iconSelected : styles.icon
          }
          src={recursive}
          alt=""
        />
      </button>
    </div>
  );
};

export default BottomBar;
