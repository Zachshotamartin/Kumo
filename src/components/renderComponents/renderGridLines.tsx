import React from "react";
import { useSelector } from "react-redux";

const RenderGridLines = () => {
  const window = useSelector((state: any) => state.window);

  const horizontalGridLines: JSX.Element[] = [];
  const verticalGridLines: JSX.Element[] = [];
  for (
    let i =
      ((0 - window.y1) % (window.initialHeight / 20)) / window.percentZoomed;
    i < window.initialHeight;
    i += window.initialHeight / 20 / window.percentZoomed
  ) {
    horizontalGridLines.push(
      <div
        key={i}
        className="grid-line"
        style={{
          position: "absolute",
          left: `${0}px`,
          top: `${i}px`,
          width: "100%",
          height: `1px`,
          backgroundColor: "white",
          opacity: 0.1,
        }}
      ></div>
    );
  }

  for (
    let i =
      ((0 - window.x1) % (window.initialHeight / 20)) / window.percentZoomed;
    i < window.initialHeight * 3;
    i += window.initialHeight / 20 / window.percentZoomed
  ) {
    verticalGridLines.push(
      <div
        key={i}
        className="grid-line"
        style={{
          position: "absolute",
          left: `${i}px`,
          top: `${0}px`,
          width: `1px`,
          height: "100%",
          backgroundColor: "white",
          opacity: 0.1,
        }}
      ></div>
    );
  }

  return (
    <div>
      {horizontalGridLines} {verticalGridLines}
    </div>
  );
};

export default RenderGridLines;
