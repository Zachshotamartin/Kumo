import React from "react";
import MiddleLayer from "../middleLayer/middleLayer";
import styles from "./middlePage.module.css";
import LeftBar from "../leftBar/leftBar";
const MiddlePage = () => {
  return (
    <div className={styles.middlePage}>
      <LeftBar />
      <MiddleLayer />
    </div>
  );
};

export default MiddlePage;
