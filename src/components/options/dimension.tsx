import { useEffect, useState, useRef } from "react";
import { useSelector, useDispatch } from "react-redux";
import {
  setWhiteboardData,
} from "../../features/whiteBoard/whiteBoardSlice";
import styles from "./options.module.css";

import { handleBoardChange } from "../../helpers/handleBoardChange";
import { Shape } from "../../features/whiteBoard/whiteBoardSlice";

const Dimension = () => {
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

  const [width, setWidth] = useState(
    selectedShape ? Math.abs(selectedShape.x2 - selectedShape.x1) : 0
  );
  const [height, setHeight] = useState(
    selectedShape ? Math.abs(selectedShape.y2 - selectedShape.y1) : 0
  );

  const inputRefWidth = useRef<HTMLInputElement>(null);
  const inputRefHeight = useRef<HTMLInputElement>(null);


  useEffect(() => {
    if (selectedShape) {
      setWidth(Math.abs(selectedShape.x2 - selectedShape.x1));
      setHeight(Math.abs(selectedShape.y2 - selectedShape.y1));
    }
  }, [selectedShape]);

  // Handle the update for both width and height
  const updateDimensions = () => {
    dispatch(
      setWhiteboardData({
        ...board,
        shapes: [
          ...shapes.filter(
            (shape: Shape, index: number) => shape.id !== selectedShape?.id
          ),
          {
            ...selectedShape,
            x1:
              selectedShape && selectedShape.x1 > selectedShape.x2
                ? selectedShape.x2
                : selectedShape?.x1 ?? 0,
            y1:
              selectedShape && selectedShape.y1 > selectedShape.y2
                ? selectedShape.y2
                : selectedShape?.y1 ?? 0,
            x2:
              selectedShape &&
              (selectedShape && selectedShape.x1 <= selectedShape.x2
                ? selectedShape.x2
                : selectedShape?.x1 ?? 0) +
                width -
                Math.abs(selectedShape?.x2 - selectedShape?.x1),
            y2:
              selectedShape &&
              (selectedShape && selectedShape.y1 <= selectedShape.y2
                ? selectedShape.y2
                : selectedShape?.y1 ?? 0) +
                height -
                Math.abs(selectedShape?.y2 - selectedShape?.y1),
            width,
            height,
          },
        ],
      })
    );

    handleBoardChange({
      ...board,
      shapes: [
        ...shapes.filter(
          (shape: Shape, index: number) => shape.id !== selectedShape?.id
        ),
        {
          ...selectedShape,
          x1:
            selectedShape && selectedShape.x1 > selectedShape.x2
              ? selectedShape.x2
              : selectedShape?.x1 ?? 0,
          y1:
            selectedShape && selectedShape.y1 > selectedShape.y2
              ? selectedShape.y2
              : selectedShape?.y1 ?? 0,
          x2:
            (selectedShape && selectedShape.x1 <= selectedShape.x2
              ? selectedShape.x2
              : selectedShape?.x1 ?? 0) +
            width -
            Math.abs((selectedShape?.x2 ?? 0) - (selectedShape?.x1 ?? 0)),
          y2:
            (selectedShape && selectedShape.y1 <= selectedShape.y2
              ? selectedShape.y2
              : selectedShape?.y1 ?? 0) +
            height -
            Math.abs((selectedShape?.y2 ?? 0) - (selectedShape?.y1 ?? 0)),
          width,
          height,
        },
      ],
    });
  };

  // Handle "Enter" key to submit
  const handleKeyDown = (e: any) => {
    if (e.key === "Enter") {
      updateDimensions();
    }
  };

  return (
    <div className={styles.container}>
      <h6 className={styles.optionHeader}>Dimension</h6>
      <div className={styles.labelInputGroup}>
        <div className={styles.labelInput}>
          <h6 className={styles.label}>Width</h6>
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
          <h6 className={styles.label}>Height</h6>
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
    </div>
  );
};

export default Dimension;
