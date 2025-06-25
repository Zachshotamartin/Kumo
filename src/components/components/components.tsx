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
import right from "../../res/right.png";
import down from "../../res/down.png";
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

  // Single dropdown state for shapes list
  const [shapesDropDown, setShapesDropDown] = useState(true);

  const [dragging, setDragging] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [sortedShapes, setSortedShapes] = useState(
    [...shapes].sort((a: any, b: any) => a.zIndex - b.zIndex)
  );

  useEffect(() => {
    setSortedShapes([...shapes].sort((a: any, b: any) => a.zIndex - b.zIndex));
  }, [shapes]);

  const getShapeIcon = (type: string) => {
    switch (type) {
      case "image":
        return image;
      case "text":
        return text;
      case "calendar":
        return calendar;
      case "rectangle":
        return rectangle;
      case "ellipse":
        return ellipse;
      case "component":
        return component;
      default:
        return rectangle;
    }
  };

  const handleDragStart = (
    index: number,
    event: React.DragEvent<HTMLDivElement>
  ) => {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/html", "");
    setDragging(index);
  };

  const handleDragOver = (
    index: number,
    event: React.DragEvent<HTMLDivElement>
  ) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";

    if (dragging !== null && dragging !== index) {
      setDragOverIndex(index);
    }
  };

  const handleDragLeave = () => {
    setDragOverIndex(null);
  };

  const handleDrop = (
    dropIndex: number,
    event: React.DragEvent<HTMLDivElement>
  ) => {
    event.preventDefault();

    if (dragging === null || dragging === dropIndex) {
      setDragging(null);
      setDragOverIndex(null);
      return;
    }

    // Simple reordering: just swap z-indices
    const updatedShapes = [...shapes];
    const draggedShape = sortedShapes[dragging];
    const targetShape = sortedShapes[dropIndex];

    if (!draggedShape || !targetShape) {
      setDragging(null);
      setDragOverIndex(null);
      return;
    }

    // Find the actual shapes in the unsorted array
    const draggedIndex = updatedShapes.findIndex(
      (s) => s.id === draggedShape.id
    );
    const targetIndex = updatedShapes.findIndex((s) => s.id === targetShape.id);

    if (draggedIndex === -1 || targetIndex === -1) {
      setDragging(null);
      setDragOverIndex(null);
      return;
    }

    // Swap z-indices
    const draggedZIndex = updatedShapes[draggedIndex].zIndex;
    const targetZIndex = updatedShapes[targetIndex].zIndex;

    updatedShapes[draggedIndex] = ShapeFunctions.updateShape(
      updatedShapes[draggedIndex],
      { zIndex: targetZIndex }
    );
    updatedShapes[targetIndex] = ShapeFunctions.updateShape(
      updatedShapes[targetIndex],
      { zIndex: draggedZIndex }
    );

    // Update the board
    const data = {
      ...board,
      shapes: updatedShapes,
      lastChangedBy: localStorage.getItem("user"),
    };

    dispatch(setWhiteboardData(data));
    handleBoardChange(data);

    setDragging(null);
    setDragOverIndex(null);
  };

  const handleClick = (
    shape: Shape,
    event: React.MouseEvent<HTMLDivElement>
  ) => {
    const selectedShapesArray = shapes.filter((shape: Shape) => {
      return selectedShapes.includes(shape.id);
    });

    if (event.shiftKey && !event.metaKey && selectedShapesArray.length > 0) {
      let newSelectedShapes: Shape[] = [];

      const minShape = selectedShapesArray.reduce((a: Shape, b: Shape) => {
        return (a.zIndex ?? 0) < (b.zIndex ?? 0) ? a : b;
      });
      const maxShape = selectedShapesArray.reduce((a: Shape, b: Shape) => {
        return (a.zIndex ?? 0) > (b.zIndex ?? 0) ? a : b;
      });

      if ((shape.zIndex ?? 0) <= (minShape.zIndex ?? 0)) {
        newSelectedShapes = shapes.filter((selectShape: Shape) => {
          return (
            (selectShape.zIndex ?? 0) <= (maxShape.zIndex ?? 0) &&
            (selectShape.zIndex ?? 0) >= (shape.zIndex ?? 0)
          );
        });
      }

      if ((shape.zIndex ?? 0) >= (maxShape.zIndex ?? 0)) {
        newSelectedShapes = shapes.filter((selectShape: Shape) => {
          return (
            (selectShape.zIndex ?? 0) <= (shape.zIndex ?? 0) &&
            (selectShape.zIndex ?? 0) >= (minShape.zIndex ?? 0)
          );
        });
      }

      dispatch(
        setSelectedShapes(newSelectedShapes.map((shape: Shape) => shape.id))
      );
    } else if (event.metaKey && !event.shiftKey) {
      dispatch(setSelectedShapes([...selectedShapes, shape.id]));
    } else {
      dispatch(setSelectedShapes([shape.id]));

      // Auto-focus on shape if not in viewport
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

  const renderShapeItem = (shape: Shape, index: number) => {
    const isSelected = selectedShapes.includes(shape.id);
    const isDraggedOver = dragOverIndex === index;
    const isDragging = dragging === index;

    return (
      <div
        key={`${shape.id}-${index}`}
        className={`${styles.shapeItem} ${
          isDragging ? styles.draggingItem : ""
        }`}
        draggable={true}
        onDragStart={(event) => handleDragStart(index, event)}
        onDragOver={(event) => handleDragOver(index, event)}
        onDragLeave={handleDragLeave}
        onDrop={(event) => handleDrop(index, event)}
        onClick={(event) => handleClick(shape, event)}
        style={{
          borderLeft: isDraggedOver
            ? "2px solid rgba(99, 102, 241, 0.8)"
            : "none",
          opacity: isDragging ? 0.5 : 1,
          transform: isDragging ? "scale(0.95)" : "scale(1)",
        }}
      >
        <img
          className={styles.shapeIcon}
          src={getShapeIcon(shape.type)}
          alt={shape.type}
        />
        <span className={isSelected ? styles.selectedText : styles.shapeText}>
          {shape.type}
          {shape.type === "component" &&
            shape.shapes &&
            ` (${shape.shapes.length} items)`}
        </span>
      </div>
    );
  };

  return (
    <div className={styles.components}>
      <div className={styles.headerContainer}>
        <h6 className={styles.mainTitle}>Shapes</h6>
      </div>

      {/* Single Shapes List */}
      <div
        className={styles.categoryHeader}
        onClick={() => setShapesDropDown(!shapesDropDown)}
      >
        <img
          className={styles.arrowIcon}
          src={shapesDropDown ? down : right}
          alt={shapesDropDown ? "Collapse" : "Expand"}
        />
        <span className={styles.categoryTitle}>
          All Shapes ({sortedShapes.length})
        </span>
      </div>

      {shapesDropDown && (
        <div className={styles.categoryContent}>
          {sortedShapes.length === 0 ? (
            <div className={styles.emptyState}>
              <span className={styles.emptyMessage}>No shapes on canvas</span>
              <span className={styles.emptyHint}>
                Create shapes using the toolbar above
              </span>
            </div>
          ) : (
            sortedShapes.map((shape, index) => renderShapeItem(shape, index))
          )}
        </div>
      )}
    </div>
  );
};

export default Components;
