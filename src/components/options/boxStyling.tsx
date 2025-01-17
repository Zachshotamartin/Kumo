import React, { useState, useEffect } from "react";
import { useSelector, useDispatch } from "react-redux";
import { updateShape } from "../../features/whiteBoard/whiteBoardSlice";
import styles from "./options.module.css";
const BoxStyling = () => {
  const dispatch = useDispatch();
  const selectedIdx = useSelector(
    (state: any) => state.selected.selectedShapes[0]
  );
  const selectedShape = useSelector((state: any) => state.whiteBoard.shapes)[
    selectedIdx
  ];
  const [borderRadius, setBorderRadius] = useState(selectedShape.borderRadius);
  const [borderWidth, setBorderWidth] = useState(selectedShape.borderWidth);
  const [borderStyle, setBorderStyle] = useState(selectedShape.borderStyle);
  useEffect(() => {
    setBorderRadius(selectedShape.borderRadius);
    setBorderWidth(selectedShape.borderWidth);
    setBorderStyle(selectedShape.borderStyle);
  }, [selectedShape]);

  useEffect(() => {
    updateBox();
  }, [borderStyle]);

  const updateBox = () => {
    dispatch(
      updateShape({
        index: selectedIdx,
        update: {
          borderRadius: borderRadius,
          borderWidth: borderWidth,
          borderStyle: borderStyle,
        },
      })
    );
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
        {selectedShape.type !== "ellipse" && (
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
            <option value="solid">
              <h6>Solid</h6>
            </option>
            <option value="dashed">
              <h6>Dashed</h6>
            </option>
            <option value="dotted">
              <h6>Dotted</h6>
            </option>
          </select>
        </div>
      </div>
    </div>
  );
};

export default BoxStyling;
