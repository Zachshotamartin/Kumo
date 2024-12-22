import React, { useEffect, useState, useRef } from "react";
import { useSelector, useDispatch } from "react-redux";
import { updateShape } from "../../features/whiteBoard/whiteBoardSlice";
import styles from "./options.module.css";

const Dimension = () => {
  const dispatch = useDispatch();
  const selectedIdx = useSelector(
    (state: any) => state.whiteBoard.selectedShape
  );
  const selectedShape = useSelector((state: any) => state.whiteBoard.shapes)[
    selectedIdx
  ];

  const [width, setWidth] = useState(
    Math.abs(selectedShape.x2 - selectedShape.x1)
  );
  const [height, setHeight] = useState(
    Math.abs(selectedShape.y2 - selectedShape.y1)
  );

  const inputRefWidth = useRef<HTMLInputElement>(null);
  const inputRefHeight = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setWidth(Math.abs(selectedShape.x2 - selectedShape.x1));
    setHeight(Math.abs(selectedShape.y2 - selectedShape.y1));
  }, [selectedShape]);

  // Handle the update for both width and height
  const updateDimensions = () => {
    dispatch(
      updateShape({
        index: selectedIdx,
        update: {
          x1:
            selectedShape.x1 > selectedShape.x2
              ? selectedShape.x2
              : selectedShape.x1,
          y1:
            selectedShape.y1 > selectedShape.y2
              ? selectedShape.y2
              : selectedShape.y1,
          x2:
            (selectedShape.x1 <= selectedShape.x2
              ? selectedShape.x2
              : selectedShape.x1) +
            width -
            Math.abs(selectedShape.x2 - selectedShape.x1),
          y2:
            (selectedShape.y1 <= selectedShape.y2
              ? selectedShape.y2
              : selectedShape.y1) +
            height -
            Math.abs(selectedShape.y2 - selectedShape.y1),
          width,
          height,
        },
      })
    );
  };

  // Handle "Enter" key to submit
  const handleKeyDown = (e: any) => {
    if (e.key === "Enter") {
      updateDimensions();
    }
  };

  return (
    <div className={styles.container}>
      <h4 className={styles.optionHeader}>Dimension</h4>
      <div className={styles.labelInput}>
        <h5 className={styles.label}>Width</h5>
        <input
          ref={inputRefWidth}
          type="number"
          className={styles.numberInput}
          value={width}
          onChange={(e) => setWidth(Number(e.target.value))}
          onKeyDown={handleKeyDown}
        />
      </div>
      <div className={styles.labelInput}>
        <h5 className={styles.label}>Height</h5>
        <input
          ref={inputRefHeight}
          type="number"
          className={styles.numberInput}
          value={height}
          onChange={(e) => setHeight(Number(e.target.value))}
          onKeyDown={handleKeyDown}
        />
      </div>
    </div>
  );
};

export default Dimension;
