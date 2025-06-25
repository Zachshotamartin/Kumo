import React from "react";
import { useSelector } from "react-redux";

const RenderGridLines = () => {
  const window = useSelector((state: any) => state.window);

  const horizontalGridLines: JSX.Element[] = [];
  const verticalGridLines: JSX.Element[] = [];
  const gridSpacing = window.initialHeight / 20 / window.percentZoomed;
  const majorGridSpacing = gridSpacing * 5; // Every 5th line is major

  for (
    let i =
      ((0 - window.y1) % (window.initialHeight / 20)) / window.percentZoomed;
    i < window.initialHeight * 2;
    i += gridSpacing
  ) {
    const isMajorLine = Math.abs(i % majorGridSpacing) < 1;
    horizontalGridLines.push(
      <div
        key={i}
        className="grid-line"
        style={{
          position: "absolute",
          left: `${0}px`,
          top: `${i}px`,
          width: "100%",
          height: `${isMajorLine ? 1 : 1}px`,
          background: isMajorLine
            ? "rgba(255, 255, 255, 0.15)"
            : "rgba(255, 255, 255, 0.06)",
          pointerEvents: "none",
        }}
      ></div>
    );
  }

  for (
    let i =
      ((0 - window.x1) % (window.initialHeight / 20)) / window.percentZoomed;
    i < window.initialHeight * 5;
    i += gridSpacing
  ) {
    const isMajorLine = Math.abs(i % majorGridSpacing) < 1;
    verticalGridLines.push(
      <div
        key={i}
        className="grid-line"
        style={{
          position: "absolute",
          left: `${i}px`,
          top: `${0}px`,
          width: `${isMajorLine ? 1 : 1}px`,
          height: "100%",
          background: isMajorLine
            ? "rgba(255, 255, 255, 0.15)"
            : "rgba(255, 255, 255, 0.06)",
          pointerEvents: "none",
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
