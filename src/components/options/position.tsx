import React, { useState, useEffect } from "react";
import { useSelector, useDispatch } from "react-redux";
import { updateShape } from "../../features/whiteBoard/whiteBoardSlice";
import styles from "./options.module.css";

const Position = () => {
  const dispatch = useDispatch();
  const selectedIdx = useSelector(
    (state: any) => state.selected.selectedShapes[0]
  );
  const selectedShape = useSelector((state: any) => state.whiteBoard.shapes)[
    selectedIdx
  ];

  const [x1, setX1] = useState<number>(selectedShape.x1);
  const [y1, setY1] = useState<number>(selectedShape.y1);

  useEffect(() => {
    // Update local state when the selected shape changes
    setX1(selectedShape.x1);
    setY1(selectedShape.y1);
  }, [selectedShape]);

  const updatePosition = () => {
    dispatch(
      updateShape({
        index: selectedIdx,
        update: {
          x1,
          y1,
          x2: selectedShape.x2 + x1 - selectedShape.x1,
          y2: selectedShape.y2 + y1 - selectedShape.y1,
        },
      })
    );
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      updatePosition();
    }
  };

  return (
    <div className={styles.container}>
      <h6 className={styles.optionHeader}>Position</h6>
      <div className={styles.labelInputGroup}>
        <div className={styles.labelInput}>
          <h6 className={styles.label}>X</h6>
          <input
            className={styles.numberInput}
            type="number"
            value={x1}
            onChange={(e) => setX1(Number(e.target.value))}
            onKeyDown={handleKeyDown}
          />
        </div>
        <div className={styles.labelInput}>
          <h6 className={styles.label}>Y</h6>
          <input
            className={styles.numberInput}
            type="number"
            value={y1}
            onChange={(e) => setY1(Number(e.target.value))}
            onKeyDown={handleKeyDown}
          />
        </div>
      </div>
    </div>
  );
};

export default Position;
