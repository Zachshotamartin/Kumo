import React from "react";
import styles from "./components.module.css";
import { useSelector, useDispatch } from "react-redux";
import { setSelectedShape } from "../../features/whiteBoard/whiteBoardSlice";

const Components = () => {
  const dispatch = useDispatch();
  const shapes = useSelector((state: any) => state.whiteBoard.shapes);
  const selectedShape = useSelector(
    (state: any) => state.whiteBoard.selectedShape
  );
  return (
    <div className={styles.components}>
      <h1>Components</h1>
      {shapes.map((shape: any, index: number) => (
        <div key={index} className={styles.component}>
          <p
            className={selectedShape === index ? styles.selected : ""}
            onClick={() => dispatch(setSelectedShape(index))}
          >
            {shape.type}
          </p>
        </div>
      ))}
    </div>
  );
};

export default Components;
