import React, { useState, useEffect } from "react";
import { useSelector, useDispatch } from "react-redux";
import { updateShape } from "../../features/whiteBoard/whiteBoardSlice";
import styles from "./options.module.css";
const Opacity = () => {
  const dispatch = useDispatch();
  const selectedIdx = useSelector(
    (state: any) => state.whiteBoard.selectedShape
  );
  const selectedShape = useSelector((state: any) => state.whiteBoard.shapes)[
    selectedIdx
  ];
  const [opacity, setOpacity] = useState(selectedShape.opacity);

  const handleSetOpacity = (value: number) => {
    if (value > 1) setOpacity(1);
    else if (value < 0) setOpacity(0);
    else setOpacity(value);
  };
  useEffect(() => {
    setOpacity(selectedShape.opacity);
  }, [selectedShape]);

  const updateOpacity = () => {
    dispatch(
      updateShape({
        index: selectedIdx,
        update: {
          opacity: opacity,
        },
      })
    );
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      updateOpacity();
    }
  };

  return (
    <div className={styles.container}>
      <h4 className={styles.optionHeader}>Color</h4>
      <div className={styles.labelInput}>
        <h5 className={styles.label}>Opacity</h5>

        <input
          type="number"
          className={styles.numberInput}
          value={opacity}
          min={0}
          max={1}
          onChange={(e) => handleSetOpacity(Number(e.target.value))}
          onKeyDown={handleKeyDown}
        />
      </div>
    </div>
  );
};

export default Opacity;
