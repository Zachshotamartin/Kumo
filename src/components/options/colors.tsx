import React, { useState, useEffect } from "react";
import { useSelector, useDispatch } from "react-redux";
import { updateShape } from "../../features/whiteBoard/whiteBoardSlice";
import styles from "./options.module.css";
import { SketchPicker } from "react-color";

const Colors = () => {
  const dispatch = useDispatch();
  const selectedIdx = useSelector(
    (state: any) => state.whiteBoard.selectedShape
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
    if (color && color.hex) {
      setColor(color.hex);
    }
  };
  const handleBackgroundColorChange = (color: any) => {
    if (color && color.hex) {
      setBackgroundColor(color.hex);
    }
  };

  const handleBorderColorChange = (color: any) => {
    if (color && color.hex) {
      setBorderColor(color.hex);
    }
  };

  return (
    <div className={styles.container}>
      <h4 className={styles.optionHeader}>Color</h4>
      <div className={styles.labelInput}>
        <h5 className={styles.label}>Color</h5>
        <SketchPicker
          color={color}
          onChangeComplete={(color) => handleColorChange(color)}
        />
      </div>
      <div className={styles.labelInput}>
        <h5 className={styles.label}>Background Color</h5>
        <SketchPicker
          color={backgroundColor}
          onChangeComplete={(color) => handleBackgroundColorChange(color)}
        />
      </div>
      <div className={styles.labelInput}>
        <h5 className={styles.label}>Border Color</h5>
        <SketchPicker
          color={borderColor}
          onChangeComplete={(color) => handleBorderColorChange(color)}
        />
      </div>
    </div>
  );
};

export default Colors;
