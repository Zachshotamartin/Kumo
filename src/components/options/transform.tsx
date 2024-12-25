import React, { useState, useEffect, useRef } from "react";
import { useSelector, useDispatch } from "react-redux";
import { updateShape } from "../../features/whiteBoard/whiteBoardSlice";
import styles from "./options.module.css";

const Transform = () => {
  const dispatch = useDispatch();
  const selectedIdx = useSelector(
    (state: any) => state.selected.selectedShapes[0]
  );
  const selectedShape = useSelector((state: any) => state.whiteBoard.shapes)[
    selectedIdx
  ];
  const [rotation, setRotation] = useState(selectedShape.rotate);
  const inputRefRotation = useRef<HTMLInputElement>(null); // Reference to the input field

  useEffect(() => {
    setRotation(selectedShape.rotation);
  }, [selectedShape]);

  // Update rotation in the store
  const updateRotation = () => {
    dispatch(
      updateShape({
        index: selectedIdx,
        update: {
          rotation: rotation,
        },
      })
    );
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
      <h4 className={styles.optionHeader}>Transform</h4>
      <div className={styles.labelInput}>
        <h5 className={styles.label}>Rotation</h5>
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
  );
};

export default Transform;
