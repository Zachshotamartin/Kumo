import React, { useState, useEffect } from "react";
import { useSelector, useDispatch } from "react-redux";
import { setWhiteboardData } from "../../features/whiteBoard/whiteBoardSlice";
import styles from "./options.module.css";
import { Shape } from "../../classes/shape";

import { handleBoardChange } from "../../helpers/handleBoardChange";
const BoxStyling = () => {
  const dispatch = useDispatch();
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
  const board = useSelector((state: any) => state.whiteBoard);

  const [borderRadius, setBorderRadius] = useState(
    selectedShape?.borderRadius || 0
  );
  const [borderWidth, setBorderWidth] = useState(
    selectedShape?.borderWidth || 0
  );
  const [borderStyle, setBorderStyle] = useState(
    selectedShape?.borderStyle || "solid"
  );

  useEffect(() => {
    if (selectedShape) {
      setBorderRadius(selectedShape.borderRadius || 0);
      setBorderWidth(selectedShape.borderWidth || 0);
      setBorderStyle(selectedShape.borderStyle || "solid");
    }
  }, [selectedShape]);

  useEffect(() => {
    updateBox();
  }, [borderStyle]);

  const updateBox = () => {
    const data = {
      ...board,
      shapes: [
        ...shapes.filter(
          (shape: Shape, index: number) => shape.id !== selectedShape?.id
        ),
        {
          ...selectedShape,
          borderRadius: borderRadius,
          borderWidth: borderWidth,
          borderStyle: borderStyle,
        },
      ],
    };
    dispatch(setWhiteboardData(data));
    handleBoardChange(data);
  };
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      updateBox();
    }
  };
  return (
    <div className={styles.container}>
      <h6 className={styles.optionHeader}>Border</h6>
      <div className={styles.labelInputGroup}>
        {selectedShape && selectedShape.type !== "ellipse" && (
          <div className={styles.labelInput}>
            <h6 className={styles.label}>Radius</h6>
            <input
              className={styles.numberInput}
              type="number"
              value={borderRadius}
              onChange={(e) => setBorderRadius(Number(e.target.value))}
              onKeyDown={handleKeyDown}
            />
          </div>
        )}
        <div className={styles.labelInput}>
          <h6 className={styles.label}>Width</h6>
          <input
            type="number"
            value={borderWidth}
            className={styles.numberInput}
            onChange={(e) => setBorderWidth(Number(e.target.value))}
            onKeyDown={handleKeyDown}
          />
        </div>
      </div>
      <div className={styles.labelInputGroup}>
        <div className={styles.labelInput}>
          <h6 className={styles.label}>Style</h6>
          <select
            value={borderStyle}
            className={styles.dropdown}
            onChange={(e) => setBorderStyle(e.target.value)}
          >
            <option value="solid">Solid</option>
            <option value="dashed">Dashed</option>
            <option value="dotted">Dotted</option>
          </select>
        </div>
      </div>
    </div>
  );
};

export default BoxStyling;
