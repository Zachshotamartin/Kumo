import React from "react";
import styles from "./workSpace.module.css";

import SideBar from "../sideBar/sideBar";
import OptionsBar from "../optionsBar/optionsBar";
import WhiteBoard from "../whiteBoard/whiteBoard";

const WorkSpace = () => {
  return (
    <div className={styles.workSpace}>
      <SideBar />
      <WhiteBoard />
      <OptionsBar />
    </div>
  );
};

export default WorkSpace;
