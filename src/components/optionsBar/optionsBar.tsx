import React from "react";
import styles from "./optionsBar.module.css";
import { useSelector } from "react-redux";

const OptionsBar = () => {
  const hidden = useSelector((state: any) => state.sideBar.hideSideBar);
  return (
    <>
      {!hidden && (
        <div className={styles.optionsBar}>
          <h1> hello</h1>
        </div>
      )}
    </>
  );
};

export default OptionsBar;
