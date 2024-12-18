import React from "react";
import styles from "./sideBar.module.css";
import Navigation from "../navigation/navigation";
import Boards from "../boards/boards";
import Components from "../components/components";

const SideBar = () => {
  return (
    <div className={styles.sideBar}>
      <Navigation />
      <Boards />
      <Components />
    </div>
  );
};

export default SideBar;
