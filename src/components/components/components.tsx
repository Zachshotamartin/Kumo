import React, { useState } from "react";
import styles from "./components.module.css";
import { useSelector, useDispatch } from "react-redux";
import { setSelectedShapes } from "../../features/selected/selectedSlice";
import image from "../../res/image.png";
import text from "../../res/text.png";
import calendar from "../../res/calendar.png";
import rectangle from "../../res/rectangle.png";
import ellipse from "../../res/ellipse.png";
import { setWindow } from "../../features/window/windowSlice";
import { setWhiteboardData } from "../../features/whiteBoard/whiteBoardSlice";
import { AppDispatch } from "../../store";
import { Shape } from "../../features/whiteBoard/whiteBoardSlice";
const Components = () => {
  const dispatch = useDispatch<AppDispatch>();
  const board = useSelector((state: any) => state.whiteBoard);
  const shapes = board.shapes;
  const selectedShapes = useSelector(
    (state: any) => state.selected.selectedShapes
  );
  const window = useSelector((state: any) => state.window);

  const [dragging, setDragging] = useState<number | null>(null);
  const [over, setOver] = useState<number | null>(null);

  const handleDragStart = (
    index: number,
    event: React.DragEvent<HTMLDivElement>
  ) => {
    event.dataTransfer.setData("text", "");
    event.dataTransfer.setDragImage(new Image(), 0, 0);
    setDragging(index);
  };

  const handleDragOver = (
    index: number,
    event: React.DragEvent<HTMLDivElement>
  ) => {
    event.preventDefault();
    setOver(index);
  };

  const handleDrop = (
    index: number,
    event: React.DragEvent<HTMLDivElement>
  ) => {
    console.log("handleDrop function executed");
    console.log("dropped at ", index);
    const dropElement = event.target as HTMLDivElement;
    console.log("dropElement", dropElement);
    let newShapes: Shape[] = [];
    if (index === dragging) {
      return;
    }
    shapes.forEach((shape: Shape, i: number) => {
      if (dragging !== null) {
        if (i > index && i > dragging) {
          newShapes.push(shape);
        } else if (i < index && i < dragging) {
          newShapes.push(shape);
        } else {
          if (i === dragging) {
            newShapes.push({
              ...shapes[dragging],
              zIndex: index,
            });
          } else if (index < dragging) {
            newShapes.push({
              ...shapes[i],
              zIndex: i + 1,
            });
          } else if (index > dragging) {
            newShapes.push({
              ...shapes[i],
              zIndex: i - 1,
            });
          }
        }
      }
    });
    console.log(newShapes);

    dispatch(
      setWhiteboardData({
        ...board,
        shapes: newShapes.sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0)),
      })
    );
    setDragging(null);
    setOver(null);
  };

  const handleClick = (
    index: number,
    event: React.MouseEvent<HTMLDivElement>
  ) => {
    if (event.shiftKey && !event.metaKey) {
      // selecte everything between the two indices

      const min = selectedShapes.reduce((a: number, b: number) =>
        Math.min(a, b)
      );
      const max = selectedShapes.reduce((a: number, b: number) =>
        Math.max(a, b)
      );
      const start = Math.min(index, min);
      const end = Math.max(index, max);

      const selected: number[] = [];
      for (let i = start; i <= end; i++) {
        selected.push(i);
      }
      dispatch(setSelectedShapes(selected));
    } else if (event.metaKey && !event.shiftKey) {
      // adds the index to selectedShapes
      dispatch(setSelectedShapes([...selectedShapes, index]));
    } else {
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
    }
  };
  const sortedShapes = [...shapes].sort(
    (a: any, b: any) => a.zIndex - b.zIndex
  );
  return (
    <div className={styles.components}>
      <h6 className={styles.title}>Components </h6>
      {sortedShapes.map((shape: any, index: number) => (
        <div
          key={index}
          className={styles.component}
          draggable={true}
          onDragStart={(event) => handleDragStart(index, event)}
          onDragOver={(event) => handleDragOver(index, event)}
          onDrop={(event) => handleDrop(index, event)}
          data-index={index}
          data-insert-before={index % 2 === 0 ? "true" : "false"}
          style={{
            borderLeft: over === index ? "3px solid white" : "none",
            borderRight: over === index ? "3px solid white" : "none",
            width: "100%",
            paddingLeft: "1rem",
          }}
        >
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
                : ""
            }
            alt={shape.type}
          />
          <h6
            className={
              selectedShapes.includes(index) ? styles.selected : styles.text
            }
            onClick={(event) => handleClick(index, event)}
          >
            {shape.type}
          </h6>
        </div>
      ))}
    </div>
  );
};

export default Components;
