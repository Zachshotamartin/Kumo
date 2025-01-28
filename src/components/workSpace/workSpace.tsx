import { useEffect } from "react";
import styles from "./workSpace.module.css";

import SideBar from "../sideBar/sideBar";
import OptionsBar from "../optionsBar/optionsBar";
import WhiteBoard from "../whiteBoard/whiteBoard";
import { useSelector } from "react-redux";
import Share from "../share/share";
import Delete from "../delete/delete";

const WorkSpace = () => {
  const sharing = useSelector((state: any) => state.actions.sharing);
  const deleting = useSelector((state: any) => state.actions.deleting);
  
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
      {deleting && <Delete />}
    </div>
  );
};

export default WorkSpace;
