import React from "react";
import { useSelector } from "react-redux";

const RenderBorder = () => {
  const borderStartX = useSelector(
    (state: any) => state.selected.borderStart[0]
  );
  const borderStartY = useSelector(
    (state: any) => state.selected.borderStart[1]
  );
  const borderEndX = useSelector((state: any) => state.selected.borderEnd[0]);
  const borderEndY = useSelector((state: any) => state.selected.borderEnd[1]);

  const window = useSelector((state: any) => state.window);

  console.log(borderStartX, borderEndX);
  return (
    <div
      style={{
        position: "absolute",
        top: `${(borderEndY - window.y1) / window.percentZoomed}px`,
        left: `${(borderEndX - window.x1) / window.percentZoomed}px`,
        width: `${
          Math.abs(borderStartX - borderEndX) / window.percentZoomed
        }px`,
        height: `${
          Math.abs(borderStartY - borderEndY) / window.percentZoomed
        }px`,

        border: "2px solid blue",
        zIndex: 51,
      }}
    ></div>
  );
};

export default RenderBorder;
