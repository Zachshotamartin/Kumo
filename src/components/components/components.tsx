import React from "react";
import styles from "./components.module.css";
import { useSelector, useDispatch } from "react-redux";

const Components = () => {
  const shapes = useSelector((state: any) => state.whiteBoard.shapes);
  return (
    <div className={styles.components}>
      {shapes.map((shape: any, index: number) => (
        <div key={index} className={styles.component}>
          <p>{shape.type}</p>
        </div>
      ))}
    </div>
  );
};

export default Components;
