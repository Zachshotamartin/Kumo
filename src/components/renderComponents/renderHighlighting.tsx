import React from "react";
import { useSelector } from "react-redux";

const RenderHighlighting = () => {
  const highlightStartX = useSelector(
    (state: any) => state.selected.highlightStart[0]
  );
  const highlightStartY = useSelector(
    (state: any) => state.selected.highlightStart[1]
  );
  const highlightEndX = useSelector(
    (state: any) => state.selected.highlightEnd[0]
  );
  const highlightEndY = useSelector(
    (state: any) => state.selected.highlightEnd[1]
  );

  const window = useSelector((state: any) => state.window);

  return (
    <div
      style={{
        position: "absolute",
        top: `${
          (Math.min(highlightStartY, highlightEndY) - window.y1) /
          window.percentZoomed
        }px`,
        left: `${
          (Math.min(highlightStartX, highlightEndX) - window.x1) /
          window.percentZoomed
        }px`,
        width: `${
          Math.abs(highlightEndX - highlightStartX) / window.percentZoomed
        }px`,
        height: `${
          Math.abs(highlightEndY - highlightStartY) / window.percentZoomed
        }px`,
        border: "2px solid blue",
        zIndex: 51,
      }}
    ></div>
  );
};

export default RenderHighlighting;
