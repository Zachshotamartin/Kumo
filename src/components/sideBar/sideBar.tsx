import React, { useState, useRef, useEffect } from "react";
import styles from "./sideBar.module.css";
import Navigation from "../navigation/navigation";
import Components from "../components/components";
import { useSelector, useDispatch } from "react-redux";
import MiddleLayerSide from "../middleLayer/middleLayerSide";
import { setSideBarWidth } from "../../features/window/windowSlice";
const SideBar = () => {
  const width = useSelector((state: any) => state.window.sideBarWidth);
  const [dragging, setDragging] = useState(false);
  const componentRef = useRef<HTMLDivElement>(null);
  const [cursor, setCursor] = useState("auto");
  const hidden = useSelector((state: any) => state.sideBar.hideSideBar);
  const whiteBoard = useSelector((state: any) => state.whiteBoard);
  const dispatch = useDispatch();
  useEffect(() => {
    const handleMouseDown = (e: MouseEvent) => {
      if (
        componentRef.current &&
        e.clientX >= componentRef.current.getBoundingClientRect().right - 5 &&
        e.clientX <= componentRef.current.getBoundingClientRect().right + 1
      ) {
        setDragging(true);
      }
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (dragging && componentRef.current) {
        const newWidth = (e.clientX / window.innerWidth) * 100;

        if (newWidth < 10) {
          dispatch(setSideBarWidth(10));
        } else if (newWidth > 20) {
          dispatch(setSideBarWidth(20));
        } else {
          dispatch(setSideBarWidth(newWidth));
        }
      }
    };

    const handleMouseUp = () => {
      setDragging(false);
    };

    const handleMouseMoveOverComponent = (e: MouseEvent) => {
      if (componentRef.current) {
        if (
          e.clientX >=
          componentRef.current.getBoundingClientRect().right - 5
        ) {
          setCursor("ew-resize");
        } else {
          setCursor("auto");
        }
      }
    };

    // Attach event listeners after component mounts
    document.addEventListener("mousedown", handleMouseDown);
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);

    const currentRef = componentRef.current;
    currentRef?.addEventListener("mousemove", handleMouseMoveOverComponent);

    return () => {
      document.removeEventListener("mousedown", handleMouseDown);
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      currentRef?.removeEventListener(
        "mousemove",
        handleMouseMoveOverComponent
      );
    };
  }, [dispatch, dragging, width]);

  return (
    <div>
      <div className={styles.hidden}>{hidden && <Navigation />}</div>
      {!hidden && (
        <div
          className={styles.sideBar}
          ref={componentRef}
          style={{
            width: `${!hidden ? width : 10}%`,
            cursor: cursor,
          }}
        >
          <h5 className={styles.title}>{whiteBoard.title}</h5>
          <Navigation />
          <MiddleLayerSide />
          <Components />
          <div
            style={{
              position: "absolute",
              top: 0,
              right: 0,
              bottom: 0,
              width: 5,
              cursor: "ew-resize",
            }}
          />
        </div>
      )}
    </div>
  );
};

export default SideBar;
