import { useState, useEffect, useRef } from "react";
import { useSelector, useDispatch } from "react-redux";
import styles from "./options.module.css";
import { handleBoardChange } from "../../helpers/handleBoardChange";
import {
  Shape,
  setWhiteboardData,
} from "../../features/whiteBoard/whiteBoardSlice";
const Transform = () => {
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
  const [rotation, setRotation] = useState(
    selectedShape ? selectedShape.rotation : 0
  );
  const inputRefRotation = useRef<HTMLInputElement>(null); // Reference to the input field
  

  useEffect(() => {
    if (selectedShape) {
      setRotation(selectedShape.rotation);
    }
  }, [selectedShape]);

  // Update rotation in the store
  const updateRotation = () => {
    dispatch(
      setWhiteboardData({
        ...board,
        shapes: [
          ...shapes.filter(
            (shape: Shape, index: number) => shape.id !== selectedShape?.id
          ),
          {
            ...selectedShape,
            rotation: rotation,
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
          rotation: rotation,
        },
      ],
    });
  };

  // Handle "Enter" key to update rotation
  const handleKeyDown = (e: any) => {
    if (e.key === "Enter") {
      updateRotation();
    }
  };

  // Handle outside clicks

  return (
    <div className={styles.container}>
      <h6 className={styles.optionHeader}>Transform</h6>
      <div className={styles.labelInputGroup}>
        <div className={styles.labelInput}>
          <h6 className={styles.label}>Rotation</h6>
          <input
            ref={inputRefRotation}
            type="number"
            className={styles.numberInput}
            value={rotation}
            onChange={(e) => setRotation(Number(e.target.value))}
            onKeyDown={handleKeyDown}
          />
        </div>
      </div>
    </div>
  );
};

export default Transform;
