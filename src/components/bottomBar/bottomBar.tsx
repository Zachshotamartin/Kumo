/* eslint-disable jsx-a11y/img-redundant-alt */
import React from "react";
import styles from "./bottomBar.module.css";
import image from "../../res/image.png";
import text from "../../res/text.png";
import pointer from "../../res/select.png";
import remove from "../../res/delete.png";
import rectangle from "../../res/rectangle.png";
import ellipse from "../../res/ellipse.png";
import recursive from "../../res/recursive.png";
import { useSelector, useDispatch } from "react-redux";
import { setSelectedTool } from "../../features/selected/selectedSlice";
import { setDrawing } from "../../features/actions/actionsSlice";
import { AppDispatch } from "../../store";
import { clearSelectedShapes } from "../../features/selected/selectedSlice";
import { useDeleteSelectedShapes } from "../../helpers/deleteHelper";

const BottomBar = () => {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const selectedTool = useSelector((state: any) => state.selected.selectedTool);
  const { handleDelete } = useDeleteSelectedShapes();
  const actionsDispatch = useDispatch();
  const dispatch = useDispatch<AppDispatch>();
  const shapes = useSelector((state: any) => state.whiteBoard.shapes);
  const handleToolSwitch = (newTool: string) => {
    actionsDispatch(setDrawing(false));
    dispatch(clearSelectedShapes());
    actionsDispatch(setSelectedTool(newTool));
    if (newTool === "text") {
      setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.focus();
        }
      }, 0);
    }
  };

  const handleUpdateAfterDelete = () => {
    handleDelete();
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
          alt="select pointer"
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
          alt="select rectangle"
        />
      </button>
      <button
        onClick={() => handleToolSwitch("ellipse")}
        className={styles.button}
      >
        <img
          className={
            selectedTool === "ellipse" ? styles.iconSelected : styles.icon
          }
          src={ellipse}
          alt="select ellipse"
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
          alt="select text"
        />
      </button>

      {/* <button
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
      </button> */}
      <button
        onClick={() => handleToolSwitch("image")}
        className={styles.button}
      >
        <img
          className={
            selectedTool === "image" ? styles.iconSelected : styles.icon
          }
          src={image}
          alt="select image"
        />
      </button>

      <button
        onClick={handleUpdateAfterDelete}
        style={{ backgroundColor: "transparent" }}
        className={styles.button}
      >
        <img className={styles.icon} src={remove} alt="" />
      </button>
    </div>
  );
};

export default BottomBar;
