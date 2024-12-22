import React from "react";
import styles from "./components.module.css";
import { useSelector, useDispatch } from "react-redux";
import { setSelectedShape } from "../../features/whiteBoard/whiteBoardSlice";
import image from "../../res/image.png";
import text from "../../res/text.png";
import calendar from "../../res/calendar.png";
import rectangle from "../../res/rectangle.png";
import recursive from "../../res/recursive.png";
const Components = () => {
  const dispatch = useDispatch();
  const shapes = useSelector((state: any) => state.whiteBoard.shapes);
  const selectedShape = useSelector(
    (state: any) => state.whiteBoard.selectedShape
  );
  return (
    <div className={styles.components}>
      <h4 className={styles.title}>Components</h4>
      {shapes.map((shape: any, index: number) => (
        <div key={index} className={styles.component}>
          <img
            className={styles.icon}
            src={
              shape.type === "image"
                ? image
                : shape.type === "text"
                ? text
                : shape.type === "calendar"
                ? calendar
                : shape.type === "rectangle"
                ? rectangle
                : shape.type === "board"
                ? recursive
                : ""
            }
            alt={shape.type}
          />
          <h5
            className={selectedShape === index ? styles.selected : styles.text}
            onClick={() => dispatch(setSelectedShape(index))}
          >
            {shape.type}
          </h5>
        </div>
      ))}
    </div>
  );
};

export default Components;
