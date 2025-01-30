import React, { useState, useEffect } from "react";
import { useSelector, useDispatch } from "react-redux";
import { setWhiteboardData } from "../../features/whiteBoard/whiteBoardSlice";
import styles from "./options.module.css";

import { handleBoardChange } from "../../helpers/handleBoardChange";
import { Shape } from "../../features/whiteBoard/whiteBoardSlice";
const Colors = () => {
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
  const [color, setColor] = useState(
    selectedShape ? selectedShape.color : "#000000"
  );
  const [backgroundColor, setBackgroundColor] = useState(
    selectedShape ? selectedShape.backgroundColor : "#ffffff"
  );

  const [borderColor, setBorderColor] = useState(
    selectedShape ? selectedShape.borderColor : "#000000"
  );

  const updateColor = (color: string) => {
    dispatch(
      setWhiteboardData({
        ...board,
        shapes: [
          ...shapes.filter(
            (shape: Shape, index: number) => shape.id !== selectedShape?.id
          ),
          {
            ...selectedShape,
            color: color,
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
          color: color,
        },
      ],
    });
  };

  const updateBackgroundColor = (color: string) => {
    dispatch(
      setWhiteboardData({
        ...board,
        shapes: [
          ...shapes.filter(
            (shape: Shape, index: number) => shape.id !== selectedShape?.id
          ),
          {
            ...selectedShape,
            backgroundColor: color,
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
          backgroundColor: color,
        },
      ],
    });
  };

  const updateBorderColor = (color: string) => {
    dispatch(
      setWhiteboardData({
        ...board,
        shapes: [
          ...shapes.filter(
            (shape: Shape, index: number) => shape.id !== selectedShape?.id
          ),
          {
            ...selectedShape,
            borderColor: color,
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
          borderColor: color,
        },
      ],
    });
  };
  useEffect(() => {
    if (selectedShape) {
      setColor(selectedShape.color);
      setBorderColor(selectedShape.borderColor);
      setBackgroundColor(selectedShape.backgroundColor);
    }
  }, [selectedShape]);

  useEffect(() => {
    updateBackgroundColor(backgroundColor || "#ffffff");
  }, [backgroundColor]);

  useEffect(() => {
    updateBorderColor(borderColor || "#000000");
  }, [borderColor]);

  useEffect(() => {
    updateColor(color || "#000000");
  }, [color]);

  const handleColorChange = (color: any) => {
    if (color) {
      setColor(color);
    }
  };
  const handleBackgroundColorChange = (color: any) => {
    if (color) {
      setBackgroundColor(color);
    }
  };

  const handleBorderColorChange = (color: any) => {
    if (color) {
      setBorderColor(color);
    }
  };
  const [opacity, setOpacity] = useState(
    selectedShape ? selectedShape.opacity : 1
  );

  const handleSetOpacity = (value: number) => {
    if (value > 1) setOpacity(1);
    else if (value < 0) setOpacity(0);
    else setOpacity(value);
  };
  useEffect(() => {
    if (selectedShape) {
      setOpacity(selectedShape.opacity);
    }
  }, [selectedShape]);

  const updateOpacity = () => {
    dispatch(
      setWhiteboardData({
        ...board,
        shapes: [
          ...shapes.filter(
            (shape: Shape, index: number) => shape.id !== selectedShape?.id
          ),
          {
            ...selectedShape,
            opacity: opacity,
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
          opacity: opacity,
        },
      ],
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      updateOpacity();
    }
  };
  return (
    <div className={styles.container}>
      <h6 className={styles.optionHeader}>Color</h6>
      <div className={styles.labelInputGroup}>
        <div className={styles.labelInput}>
          <h6 className={styles.label}>Base</h6>
          <input
            style={{ backgroundColor: color }}
            type="color"
            value={color}
            className={styles.colorInput}
            onChange={(e) => handleColorChange(e.target.value)}
          />
        </div>
        <div className={styles.labelInput}>
          <h6 className={styles.label}>Background</h6>
          <input
            style={{ backgroundColor: backgroundColor }}
            type="color"
            value={backgroundColor}
            className={styles.colorInput}
            onChange={(e) => handleBackgroundColorChange(e.target.value)}
          />
        </div>
        <div className={styles.labelInput}>
          <h6 className={styles.label}>Border</h6>
          <input
            style={{ backgroundColor: borderColor }}
            type="color"
            value={borderColor}
            className={styles.colorInput}
            onChange={(e) => handleBorderColorChange(e.target.value)}
          />
        </div>
        <div className={styles.labelInput}>
          <h6 className={styles.label}>Opacity</h6>

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
