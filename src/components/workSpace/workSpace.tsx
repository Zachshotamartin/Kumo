import React, { useEffect } from "react";
import styles from "./workSpace.module.css";

import SideBar from "../sideBar/sideBar";
import OptionsBar from "../optionsBar/optionsBar";
import WhiteBoard from "../whiteBoard/whiteBoard";
import { useSelector } from "react-redux";
import Share from "../share/share";

const WorkSpace = () => {
  const sharing = useSelector((state: any) => state.actions.sharing);
  useEffect(() => {
    const preventPinchZoom = (e: TouchEvent) => {
      if (e.touches.length > 1) {
        e.preventDefault(); // Prevent pinch zoom
      }
    };

    document.addEventListener("touchstart", preventPinchZoom, {
      passive: false,
    });

    return () => {
      document.removeEventListener("touchstart", preventPinchZoom);
    };
  }, []);
  return (
    <div className={styles.workSpace}>
      <SideBar />
      <WhiteBoard />
      <OptionsBar />
      {sharing && <Share />}
    </div>
  );
};

export default WorkSpace;
