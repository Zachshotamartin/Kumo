import React, { useState, useEffect } from "react";
import { useSelector, useDispatch } from "react-redux";
import { setWhiteboardData } from "../../features/whiteBoard/whiteBoardSlice";
import styles from "./options.module.css";
import { updateBackgroundColor } from "../../features/whiteBoard/whiteBoardSlice";
import { AppDispatch } from "../../store";
import { handleBoardChange } from "../../helpers/handleBoardChange";

const WhiteboardStyles = () => {
  const dispatch = useDispatch<AppDispatch>();
  const board = useSelector((state: any) => state.whiteBoard);
  const backgroundColor = useSelector(
    (state: any) => state.whiteBoard.backGroundColor
  );
  const [color, setColor] = useState(backgroundColor);

  const handleUpdateBackgroundColor = (color: string) => {
    if (color) {
      dispatch(
        setWhiteboardData({
          ...board,
          backGroundColor: color,
        })
      );
      handleBoardChange({
        ...board,
        backGroundColor: color,
      });
    }
  };

  useEffect(() => {
    handleUpdateBackgroundColor(color);
  }, [color]);

  const handleBackgroundColorChange = (color: any) => {
    if (color) {
      setColor(color);
    }
  };
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      updateBackgroundColor(color);
    }
  };
  return (
    <div className={styles.container}>
      <h6 className={styles.optionHeader}>Color</h6>
      <div className={styles.labelInputGroup}>
        <div className={styles.labelInput}>
          <h6 className={styles.label}>Background</h6>
          <input
            style={{ backgroundColor: backgroundColor }}
            type="color"
            value={backgroundColor}
            className={styles.colorInput}
            onChange={(e) => handleBackgroundColorChange(e.target.value)}
            onKeyDown={handleKeyDown}
          />
        </div>
      </div>
    </div>
  );
};

export default WhiteboardStyles;
