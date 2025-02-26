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
import { Shape, ShapeFunctions } from "../../classes/shape";
import { handleBoardChange } from "../../helpers/handleBoardChange";

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
    const dropElement = event.target as HTMLDivElement;

    if (index === dragging) {
      return;
    }
    console.log("dragging", dragging);
    console.log("over", over);
    console.log("index", index);
    console.log("sortedShapes", sortedShapes.reverse());
    const startShape = shapes.find(
      (shape: Shape) => shape.id === sortedShapes[dragging ?? 0].id
    );
    const startZIndex = startShape?.zIndex;
    const endShape = shapes.find(
      (shape: Shape) => shape.id === sortedShapes[over ?? 0].id
    );
    const endZIndex = endShape?.zIndex;
    let startShapeSize = 1;
    if (startShape?.type === "component") {
      startShapeSize += startShape.shapes.length;
    }
    let endShapeSize = 1;
    if (endShape?.type === "component") {
      endShapeSize += endShape.shapes.length;
    }
    console.log("startZIndex", startZIndex);
    console.log("endZIndex", endZIndex);
    console.log("startShape", startShape);
    console.log("endShape", endShape);

    let newShapes: Shape[] = [];
    shapes.forEach((shape: Shape, i: number) => {
      if (dragging !== null) {
        // for all shapes that are outside of the bounds of the start and end // do nothing.
        if (
          (shape.zIndex ?? 0) < startZIndex &&
          (shape.zIndex ?? 0) < endZIndex
        ) {
          console.log("out of bounds", shape);
          newShapes.push(shape);
        } else if (
          (shape.zIndex ?? 0) > startZIndex &&
          (shape.zIndex ?? 0) > endZIndex
        ) {
          console.log("out of bounds", shape);
          newShapes.push(shape);
        } else {
          if (startZIndex === endZIndex) {
            return; // do nothing because the shapes are already in the right order.
          } else if (startZIndex < endZIndex) {
            // move the shapes back by the shapeSize
            // move start shape to the new position
            if (shape.id === startShape?.id) {
              let finalZIndex = endZIndex;
              console.log(finalZIndex);
              if (endShape.type === "component") {
                finalZIndex += endShape.shapes.length + 1;
              }
              if (shape.type !== "component") {
                newShapes.push(
                  ShapeFunctions.updateShape(shape, {
                    zIndex: finalZIndex - 1,
                  })
                );
                console.log("placed shape");
              } else {
                newShapes.push(
                  ShapeFunctions.updateShape(shape, {
                    zIndex: finalZIndex - startShapeSize,
                    shapes: shape.shapes?.map((componentShape: Shape) => ({
                      ...componentShape,
                      zIndex:
                        (componentShape.zIndex ?? 0) -
                        startShapeSize -
                        startZIndex +
                        finalZIndex, // Adjust nested shapes
                    })),
                  })
                );
              }
            } else {
              console.log("not moved", shape);
              if (shape.type !== "component") {
                newShapes.push(
                  ShapeFunctions.updateShape(shape, {
                    zIndex: (shape.zIndex ?? 0) - startShapeSize,
                  })
                );
              } else {
                newShapes.push(
                  ShapeFunctions.updateShape(shape, {
                    zIndex: (shape.zIndex ?? 0) - startShapeSize,
                    shapes: shape.shapes?.map((componentShape: Shape) => ({
                      ...componentShape,
                      zIndex: (componentShape.zIndex ?? 0) - startShapeSize, // Adjust nested shapes
                    })),
                  })
                );
              }
            }
          } else if (startZIndex > endZIndex) {
            // move all shapes forward by the shapeSize
            // move start shape to the new position
            if (shape.id === startShape?.id) {
              let finalZIndex = endZIndex;

              console.log("moved", shape);
              if (shape.type !== "component") {
                newShapes.push(
                  ShapeFunctions.updateShape(shape, {
                    zIndex: finalZIndex,
                  })
                );
              } else {
                newShapes.push(
                  ShapeFunctions.updateShape(shape, {
                    zIndex: finalZIndex,
                    shapes: shape.shapes?.map((componentShape: Shape) => ({
                      ...componentShape,
                      zIndex:
                        (componentShape.zIndex ?? 0) -
                        startZIndex +
                        finalZIndex, // Adjust nested shapes
                    })),
                  })
                );
              }
            } else {
              if (shape.type !== "component") {
                newShapes.push(
                  ShapeFunctions.updateShape(shape, {
                    zIndex: (shape.zIndex ?? 0) + startShapeSize,
                  })
                );
              } else {
                newShapes.push(
                  ShapeFunctions.updateShape(shape, {
                    zIndex: (shape.zIndex ?? 0) + startShapeSize,
                    shapes: shape.shapes?.map((componentShape: Shape) => ({
                      ...componentShape,
                      zIndex: (componentShape.zIndex ?? 0) + startShapeSize, // Adjust nested shapes
                    })),
                  })
                );
              }
            }
          }
        }
      }
      console.log("last shape changed", newShapes);
    });

    newShapes = [...newShapes].reverse();
    const data = {
      ...board,
      shapes: newShapes,
      lastChangedBy: localStorage.getItem("user"),
    };
    dispatch(setWhiteboardData(data));
    handleBoardChange(data);

    setDragging(null);
    setOver(null);
  };

  const handleClick = (
    shape: Shape,
    event: React.MouseEvent<HTMLDivElement>
  ) => {
    handleBoardChange({
      ...board,
      shapes: sortedShapes,
    });
    const selectedShapesArray = shapes.filter((shape: Shape, index: number) => {
      return selectedShapes.includes(shape.id);
    });

    if (event.shiftKey && !event.metaKey && selectedShapesArray.length > 0) {
      // select everything between the two indices
      let newSelectedShapes: Shape[] = [];

      const minShape = selectedShapesArray.reduce((a: Shape, b: Shape) => {
        return (a.zIndex ?? 0) < (b.zIndex ?? 0) ? a : b;
      });
      const maxShape = selectedShapesArray.reduce((a: Shape, b: Shape) => {
        return (a.zIndex ?? 0) > (b.zIndex ?? 0) ? a : b;
      });
      if ((shape.zIndex ?? 0) <= (minShape.zIndex ?? 0)) {
        newSelectedShapes = shapes.filter(
          (selectShape: Shape, index: number) => {
            return (
              (selectShape.zIndex ?? 0) <= maxShape.zIndex &&
              (selectShape.zIndex ?? 0) >= (shape.zIndex ?? 0)
            );
          }
        );
      }
      if ((shape.zIndex ?? 0) >= (maxShape.zIndex ?? 0)) {
        newSelectedShapes = shapes.filter(
          (selectShape: Shape, index: number) => {
            return (
              (selectShape.zIndex ?? 0) <= (shape.zIndex ?? 0) &&
              (selectShape.zIndex ?? 0) >= (minShape.zIndex ?? 0)
            );
          }
        );
      }

      dispatch(
        setSelectedShapes(newSelectedShapes.map((shape: Shape) => shape.id))
      );
    } else if (event.metaKey && !event.shiftKey) {
      // adds the index to selectedShapes
      dispatch(setSelectedShapes([...selectedShapes, shape.id]));
    } else {
      dispatch(setSelectedShapes([shape.id]));
      const windowX1 = window.x1;
      const windowY1 = window.y1;
      const windowX2 = window.x2;
      const windowY2 = window.y2;

      const windowWidth = window.width;
      const windowHeight = window.height;
      const shapeX1 = shape.x1;
      const shapeY1 = shape.y1;
      const shapeX2 = shape.x2;
      const shapeY2 = shape.y2;

      const isIntersecting =
        shapeX1 < windowX2 &&
        shapeX2 > windowX1 &&
        shapeY1 < windowY2 &&
        shapeY2 > windowY1;

      if (!isIntersecting) {
        dispatch(
          setWindow({
            ...window,
            x1: shapeX1 - windowWidth / 2 + shape.width / 2,
            y1: shapeY1 - windowHeight / 2 + shape.height / 2,
            x2: shapeX1 + windowWidth / 2 + shape.width / 2,
            y2: shapeY1 + windowHeight / 2 + shape.height / 2,
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
                selectedShapes.includes(shape.id)
                  ? styles.selected
                  : styles.text
              }
              onClick={(event) => handleClick(shape, event)}
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
                        selectedShapes.includes(shape.id)
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
