import React, { useState, useEffect } from "react";
import { useSelector, useDispatch } from "react-redux";
import styles from "./options.module.css";
import { handleBoardChange } from "../../helpers/handleBoardChange";
import { setWhiteboardData } from "../../features/whiteBoard/whiteBoardSlice";
import { Shape } from "../../classes/shape";
const Position = () => {
  const dispatch = useDispatch();
  const board = useSelector((state: any) => state.whiteBoard);
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

  const [x1, setX1] = useState<number>(selectedShape ? selectedShape.x1 : 0);
  const [y1, setY1] = useState<number>(selectedShape ? selectedShape.y1 : 0);

  useEffect(() => {
    // Update local state when the selected shape changes
    if (selectedShape) {
      setX1(selectedShape.x1);
      setY1(selectedShape.y1);
    }
  }, [selectedShape]);

  const updatePosition = () => {
    const data = {
      ...board,
      shapes: [
        ...shapes.filter(
          (shape: Shape, index: number) => shape.id !== selectedShape?.id
        ),
        selectedShape
          ? {
              ...selectedShape,
              x1: Math.round(x1),
              y1: Math.round(y1),
              x2: selectedShape
                ? Math.round(selectedShape.x2 + x1 - selectedShape.x1)
                : 0,
              y2: selectedShape
                ? Math.round(selectedShape.y2 + y1 - selectedShape.y1)
                : 0,
            }
          : undefined,
      ],
    };
    dispatch(setWhiteboardData(data));
    handleBoardChange(data);
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
