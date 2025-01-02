import React, { useState, useRef, useEffect } from "react";
import styles from "./sideBar.module.css";
import Navigation from "../navigation/navigation";
import Components from "../components/components";
import { useSelector } from "react-redux";
import MiddleLayer from "../middleLayer/middleLayer";

const SideBar = () => {
  const [width, setWidth] = useState(15); // initial width
  const [dragging, setDragging] = useState(false);
  const componentRef = useRef<HTMLDivElement>(null);
  const [cursor, setCursor] = useState("auto");
  const hidden = useSelector((state: any) => state.sideBar.hideSideBar);
  const whiteBoard = useSelector((state: any) => state.whiteBoard);
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
          setWidth(10);
        } else if (newWidth > 20) {
          setWidth(20);
        } else {
          setWidth(newWidth);
        }
      }
    };

    const handleMouseUp = () => {
      setDragging(false);
    };

    const handleMouseMoveOverComponent = (e: MouseEvent) => {
      if (componentRef.current) {
        console.log("resizing");
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
  }, [dragging, width]);

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
          <h4 className={styles.title}>{whiteBoard.title}</h4>
          <Navigation />
          <MiddleLayer />
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
