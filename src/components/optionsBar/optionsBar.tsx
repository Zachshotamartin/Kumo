import React, { useState, useRef, useEffect, useCallback } from "react";
import styles from "./optionsBar.module.css";
import { useSelector } from "react-redux";
import Position from "../options/position";
import Dimension from "../options/dimension";
import Transform from "../options/transform";

import FontStyles from "../options/fontStyles";
import BoxStyling from "../options/boxStyling";
import BoardLink from "../options/boardLink";
import Colors from "../options/colors";
import WhiteboardStyles from "../options/whiteboardStyles";
import ImageStyling from "../options/imageStyling";
import { Shape } from "../../classes/shape";

const OptionsBar = () => {
  const hidden = useSelector((state: any) => state.sideBar.hideOptions);

  const selectedShapes = useSelector(
    (state: any) => state.selected.selectedShapes
  );
  const shapes = useSelector((state: any) => state.whiteBoard.shapes);
  let selectedShape: Shape | undefined;
  if (selectedShapes) {
    selectedShape = shapes.find(
      (shape: Shape, index: number) => shape.id === selectedShapes[0]
    );
  }

  const [left, setLeft] = useState(75); // Initial left position in percentage
  const [dragging, setDragging] = useState(false);
  const [startX, setStartX] = useState(0); // Track starting position of drag
  const [startLeft, setStartLeft] = useState(left); // Track starting left value
  const optionsBarRef = useRef<HTMLDivElement | null>(null);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button === 0) {
      setDragging(true);
      setStartX(e.clientX);
      setStartLeft(left);
    }
  };

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (dragging && optionsBarRef.current) {
        const deltaX = e.clientX - startX;
        const deltaPercent = (deltaX / window.innerWidth) * 100;
        const newLeft = Math.min(85, Math.max(70, startLeft + deltaPercent));
        setLeft(newLeft);
      }
    },
    [dragging, startX, startLeft]
  );

  const handleMouseUp = useCallback(() => {
    if (dragging) {
      setDragging(false);
    }
  }, [dragging]);

  useEffect(() => {
    if (dragging) {
      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);
    } else {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    }

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [dragging, handleMouseMove, handleMouseUp]);

  return (
    <>
      {!hidden && (
        <div
          className={styles.optionsBar}
          ref={optionsBarRef}
          style={{ left: `${left}%`, width: `${100 - left - 1}%` }}
        >
          <h5 className={styles.shapeType}>{selectedShape?.type}</h5>
          <div
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              bottom: 0,
              width: 5,
              cursor: "ew-resize",
            }}
            onMouseDown={handleMouseDown}
          />

          <BoardLink />
          {selectedShape && selectedShape.type === "image" && <ImageStyling />}
          {selectedShape && <Position />}
          {selectedShape && <Dimension />}
          {selectedShape && <Transform />}
          {selectedShape && <BoxStyling />}

          {selectedShape &&
            (selectedShape.type === "text" ||
              selectedShape.type === "board") && <FontStyles />}
          {selectedShape && <Colors />}
        </div>
      )}
      {hidden && (
        <div
          className={styles.optionsBar}
          ref={optionsBarRef}
          style={{
            left: `${left}%`,
            width: `${100 - left - 1}%`,
          }}
        >
          <h5 className={styles.shapeType}>whiteboard</h5>
          <div
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              bottom: 0,
              width: 5,
              cursor: "ew-resize",
            }}
            onMouseDown={handleMouseDown}
          />
          <WhiteboardStyles />
        </div>
      )}
    </>
  );
};

export default OptionsBar;
