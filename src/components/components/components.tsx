import React from "react";
import styles from "./components.module.css";
import { useSelector, useDispatch } from "react-redux";
import { setSelectedShapes } from "../../features/selected/selectedSlice";
import image from "../../res/image.png";
import text from "../../res/text.png";
import calendar from "../../res/calendar.png";
import rectangle from "../../res/rectangle.png";
import ellipse from "../../res/ellipse.png";
import recursive from "../../res/recursive.png";
import { setWindow } from "../../features/window/windowSlice";
const Components = () => {
  const dispatch = useDispatch();
  const board = useSelector((state: any) => state.whiteBoard);
  const shapes = board.shapes;
  const selectedShape = useSelector(
    (state: any) => state.selected.selectedShapes
  );
  const window = useSelector((state: any) => state.window);

  const handleClick = (index: number) => {
    dispatch(setSelectedShapes([index]));
    const windowX1 = window.x1;
    const windowY1 = window.y1;
    const windowX2 = window.x2;
    const windowY2 = window.y2;

    const windowWidth = window.width;
    const windowHeight = window.height;
    const shapeX1 = shapes[index].x1;
    const shapeY1 = shapes[index].y1;
    const shapeX2 = shapes[index].x2;
    const shapeY2 = shapes[index].y2;

    const isIntersecting =
      shapeX1 < windowX2 &&
      shapeX2 > windowX1 &&
      shapeY1 < windowY2 &&
      shapeY2 > windowY1;

    if (!isIntersecting) {
      dispatch(
        setWindow({
          ...window,
          x1: shapeX1 - windowWidth / 2 + shapes[index].width / 2,
          y1: shapeY1 - windowHeight / 2 + shapes[index].height / 2,
          x2: shapeX1 + windowWidth / 2 + shapes[index].width / 2,
          y2: shapeY1 + windowHeight / 2 + shapes[index].height / 2,
        })
      );
    }
  };
  return (
    <div className={styles.components}>
      <h6 className={styles.title}>Components </h6>
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
                : shape.type === "ellipse"
                ? ellipse
                : shape.type === "board"
                ? recursive
                : ""
            }
            alt={shape.type}
          />
          <h6
            className={
              selectedShape.includes(index) ? styles.selected : styles.text
            }
            onClick={() => handleClick(index)}
          >
            {shape.type}
          </h6>
        </div>
      ))}
    </div>
  );
};

export default Components;
