import React, { useState, useEffect, useRef } from "react";
import { useSelector, useDispatch } from "react-redux";
import { updateShape } from "../../features/whiteBoard/whiteBoardSlice";
import styles from "./options.module.css";

const Position = () => {
  const dispatch = useDispatch();
  const selectedIdx = useSelector(
    (state: any) => state.whiteBoard.selectedShape
  );
  const selectedShape = useSelector((state: any) => state.whiteBoard.shapes)[
    selectedIdx
  ];

  const [x1, setX1] = useState<number>(selectedShape.x1);
  const [y1, setY1] = useState<number>(selectedShape.y1);

  const inputRefX = useRef<HTMLInputElement>(null);
  const inputRefY = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Update local state when the selected shape changes
    setX1(selectedShape.x1);
    setY1(selectedShape.y1);
  }, [selectedShape]);

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (
        inputRefX.current &&
        !inputRefX.current.contains(e.target as Node) &&
        inputRefY.current &&
        !inputRefY.current.contains(e.target as Node)
      ) {
        updatePosition();
      }
    };

    document.addEventListener("mousedown", handleOutsideClick);
    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
    };
  }, [x1, y1]);

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
      <h4 className={styles.optionHeader}>Position</h4>
      <div className={styles.labelInput}>
        <h5 className={styles.label}>x</h5>
        <input
          ref={inputRefX}
          className={styles.numberInput}
          type="number"
          value={x1}
          onChange={(e) => setX1(Number(e.target.value))}
          onKeyDown={handleKeyDown}
        />
      </div>
      <div className={styles.labelInput}>
        <h5 className={styles.label}>y</h5>
        <input
          ref={inputRefY}
          className={styles.numberInput}
          type="number"
          value={y1}
          onChange={(e) => setY1(Number(e.target.value))}
          onKeyDown={handleKeyDown}
        />
      </div>
    </div>
  );
};

export default Position;
