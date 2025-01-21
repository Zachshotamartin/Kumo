import React, { useState, useEffect } from "react";
import styles from "./components.module.css";
import { useSelector, useDispatch } from "react-redux";
import { setSelectedShapes } from "../../features/selected/selectedSlice";
import image from "../../res/image.png";
import text from "../../res/text.png";
import calendar from "../../res/calendar.png";
import rectangle from "../../res/rectangle.png";
import ellipse from "../../res/ellipse.png";
import component from "../../res/component.png";
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
  const [sortedShapes, setSortedShapes] = useState(
    [...shapes].sort((a: any, b: any) => a.zIndex - b.zIndex)
  );
  useEffect(() => {
    setSortedShapes([...shapes].sort((a: any, b: any) => a.zIndex - b.zIndex));
  }, [shapes]);

  const handleDragStart = (
    index: number,
    event: React.DragEvent<HTMLDivElement>
  ) => {
    event.dataTransfer.setData("text", "");
    event.dataTransfer.setDragImage(new Image(), 0, 0);
    console.log("dragging index ", index);
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
    console.log([...shapes].reverse());
    if (index === dragging) {
      return;
    }

    [...shapes].reverse().forEach((shape: Shape, i: number) => {
      if (dragging !== null) {
        if (i > index && i > dragging) {
          newShapes.push(shape);
        } else if (i < index && i < dragging) {
          newShapes.push(shape);
        } else {
          if (i === dragging) {
            newShapes.push({
              ...shape,
              zIndex: shapes.length - 1 - index,
            });
          } else if (index < dragging) {
            newShapes.push({
              ...shape,
              zIndex: shapes.length - 1 - i - 1,
            });
          } else if (index > dragging) {
            newShapes.push({
              ...shape,
              zIndex: shapes.length - i + 1,
            });
          }
        }
      }
    });
    newShapes = [...newShapes].reverse();
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
    dispatch(
      setWhiteboardData({
        ...board,
        shapes: sortedShapes,
      })
    );

    if (event.shiftKey && !event.metaKey) {
      // selecte everything between the two indices

      const min = selectedShapes.reduce((a: number, b: number) =>
        Math.min(a, b)
      );
      const max = selectedShapes.reduce((a: number, b: number) =>
        Math.max(a, b)
      );
      const start = Math.min(sortedShapes.length - 1 - index, min);
      const end = Math.max(sortedShapes.length - 1 - index, max);

      const selected: number[] = [];
      for (let i = start; i <= end; i++) {
        selected.push(i);
      }
      dispatch(setSelectedShapes(selected));
    } else if (event.metaKey && !event.shiftKey) {
      // adds the index to selectedShapes
      dispatch(
        setSelectedShapes([...selectedShapes, sortedShapes.length - 1 - index])
      );
    } else {
      dispatch(setSelectedShapes([sortedShapes.length - 1 - index]));
      const windowX1 = window.x1;
      const windowY1 = window.y1;
      const windowX2 = window.x2;
      const windowY2 = window.y2;

      const windowWidth = window.width;
      const windowHeight = window.height;
      const shapeX1 = shapes[sortedShapes.length - 1 - index].x1;
      const shapeY1 = shapes[sortedShapes.length - 1 - index].y1;
      const shapeX2 = shapes[sortedShapes.length - 1 - index].x2;
      const shapeY2 = shapes[sortedShapes.length - 1 - index].y2;

      const isIntersecting =
        shapeX1 < windowX2 &&
        shapeX2 > windowX1 &&
        shapeY1 < windowY2 &&
        shapeY2 > windowY1;

      if (!isIntersecting) {
        dispatch(
          setWindow({
            ...window,
            x1:
              shapeX1 -
              windowWidth / 2 +
              shapes[sortedShapes.length - 1 - index].width / 2,
            y1:
              shapeY1 -
              windowHeight / 2 +
              shapes[sortedShapes.length - 1 - index].height / 2,
            x2:
              shapeX1 +
              windowWidth / 2 +
              shapes[sortedShapes.length - 1 - index].width / 2,
            y2:
              shapeY1 +
              windowHeight / 2 +
              shapes[sortedShapes.length - 1 - index].height / 2,
          })
        );
      }
    }
  };

  return (
    <div className={styles.components}>
      <h6 className={styles.title}>Components </h6>

      {[...sortedShapes].reverse().map((shape: any, index: number) => (
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
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-start",
          }}
        >
          <div
            style={{
              display: "flex",
              flexDirection: "row",
              alignItems: "center",
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
                  : shape.type === "component"
                  ? component
                  : ""
              }
              alt={shape.type}
            />
            <h6
              className={
                selectedShapes.includes(sortedShapes.length - 1 - index)
                  ? styles.selected
                  : styles.text
              }
              onClick={(event) => handleClick(index, event)}
            >
              {shape.type}
            </h6>
          </div>
          {shape.type === "component" && (
            <div>
              {shape.shapes.map(
                (componentShape: Shape, componentIndex: number) => (
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "row",
                      paddingLeft: "1rem",
                    }}
                  >
                    <img
                      className={styles.icon}
                      src={
                        componentShape.type === "image"
                          ? image
                          : componentShape.type === "text"
                          ? text
                          : componentShape.type === "calendar"
                          ? calendar
                          : componentShape.type === "rectangle"
                          ? rectangle
                          : componentShape.type === "ellipse"
                          ? ellipse
                          : componentShape.type === "component"
                          ? calendar
                          : ""
                      }
                      alt={componentShape.type}
                    />
                    <h6
                      className={
                        selectedShapes.includes(shapes.length - 1 - index)
                          ? styles.selected
                          : styles.text
                      }
                    >
                      {componentShape.type}
                    </h6>
                  </div>
                )
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
};

export default Components;
