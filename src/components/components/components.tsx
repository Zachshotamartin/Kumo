import React from "react";
import styles from "./components.module.css";
import { useSelector, useDispatch } from "react-redux";
import { setSelectedShape } from "../../features/whiteBoard/whiteBoardSlice";
import image from "../../res/image.png";
import text from "../../res/text.png";
import calendar from "../../res/calendar.png";
import rectangle from "../../res/rectangle.png";

const Components = () => {
  const dispatch = useDispatch();
  const shapes = useSelector((state: any) => state.whiteBoard.shapes);
  const selectedShape = useSelector(
    (state: any) => state.whiteBoard.selectedShape
  );
  return (
    <div className={styles.components}>
      <h1>Components</h1>
      {shapes.map((shape: any, index: number) => (
        <div key={index} className={styles.component}>
          <img className={styles.icon}
            src={
              shape.type === "image"
                ? image
                : shape.type === "text"
                ? text
                : shape.type === "calendar"
                ? calendar
                : shape.type === "rectangle"
                ? rectangle
                : ""
            }
            alt={shape.type}
          />

          <p
            className={selectedShape === index ? styles.selected : ""}
            onClick={() => dispatch(setSelectedShape(index))}
          >
            {shape.type}
          </p>
        </div>
      ))}
    </div>
  );
};

export default Components;
