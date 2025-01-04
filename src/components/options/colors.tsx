import React, { useState, useEffect } from "react";
import { useSelector, useDispatch } from "react-redux";
import { updateShape } from "../../features/whiteBoard/whiteBoardSlice";
import styles from "./options.module.css";

const Colors = () => {
  const dispatch = useDispatch();
  const selectedIdx = useSelector(
    (state: any) => state.selected.selectedShapes[0]
  );
  const selectedShape = useSelector((state: any) => state.whiteBoard.shapes)[
    selectedIdx
  ];
  const [color, setColor] = useState(selectedShape.color);
  const [backgroundColor, setBackgroundColor] = useState(
    selectedShape.backgroundColor
  );
  const [borderColor, setBorderColor] = useState(selectedShape.borderColor);

  const updateColor = (color: string) => {
    dispatch(
      updateShape({
        index: selectedIdx,
        update: {
          color: color,
        },
      })
    );
  };

  const updateBackgroundColor = (color: string) => {
    console.log("made it in");
    dispatch(
      updateShape({
        index: selectedIdx,
        update: {
          backgroundColor: color,
        },
      })
    );
  };

  const updateBorderColor = (color: string) => {
    dispatch(
      updateShape({
        index: selectedIdx,
        update: {
          borderColor: color,
        },
      })
    );
  };
  useEffect(() => {
    setColor(selectedShape.color);
    setBorderColor(selectedShape.borderColor);
    setBackgroundColor(selectedShape.backgroundColor);
  }, [selectedShape]);

  useEffect(() => {
    updateBackgroundColor(backgroundColor);
  }, [backgroundColor]);

  useEffect(() => {
    updateBorderColor(borderColor);
  }, [borderColor]);

  useEffect(() => {
    updateColor(color);
  }, [color]);

  const handleColorChange = (color: any) => {
    console.log("trying to change color");
    if (color) {
      console.log(color);
      setColor(color);
    }
  };
  const handleBackgroundColorChange = (color: any) => {
    console.log("trying to change color");
    console.log(color);
    if (color) {
      setBackgroundColor(color);
      console.log(color);
    }
  };

  const handleBorderColorChange = (color: any) => {
    if (color) {
      setBorderColor(color);
    }
  };
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
      <div className={styles.labelInputGroup}>
        <div className={styles.labelInput}>
          <h5 className={styles.label}>Base</h5>
          <input
            style={{ backgroundColor: color }}
            type="color"
            value={color}
            className={styles.colorInput}
            onChange={(e) => handleColorChange(e.target.value)}
          />
        </div>
        <div className={styles.labelInput}>
          <h5 className={styles.label}>Background</h5>
          <input
            style={{ backgroundColor: backgroundColor }}
            type="color"
            value={backgroundColor}
            className={styles.colorInput}
            onChange={(e) => handleBackgroundColorChange(e.target.value)}
          />
        </div>
        <div className={styles.labelInput}>
          <h5 className={styles.label}>Border</h5>
          <input
            style={{ backgroundColor: borderColor }}
            type="color"
            value={borderColor}
            className={styles.colorInput}
            onChange={(e) => handleBorderColorChange(e.target.value)}
          />
        </div>
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
    </div>
  );
};

export default Colors;
