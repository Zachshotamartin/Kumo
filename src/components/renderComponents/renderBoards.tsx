import React from "react";
import { useSelector } from "react-redux";
import { Shape } from "../../features/whiteBoard/whiteBoardSlice";
const RenderBoxes = () => {
  const shapes = useSelector((state: any) => state.whiteBoard.shapes);
  const selectedShapes = useSelector(
    (state: any) => state.selected.selectedShapes
  );
  const window = useSelector((state: any) => state.window);
  return (
    <>
      {shapes.map((shape: Shape, index: number) => (
        <>
          {shape.type === "board" && (
            <div
              key={index}
              style={{
                // type
                position: "absolute",
                zIndex: selectedShapes.includes(index) ? 50 : 0,

                // position
                top: `${
                  ((shape.y1 > shape.y2 ? shape.y2 : shape.y1) - window.y1) /
                  window.percentZoomed
                }px`,
                left: `${
                  ((shape.x1 > shape.x2 ? shape.x2 : shape.x1) - window.x1) /
                  window.percentZoomed
                }px`,

                // dimension
                width: `${shape.width / window.percentZoomed}px`,
                height: `${shape.height / window.percentZoomed}px`,

                // transforms
                transform: `rotate(${shape.rotation}deg)`,
                // flipX?: boolean;
                // flipY?: boolean;

                // box styling
                borderRadius: `${shape.borderRadius}%`,
                borderWidth: `${shape.borderWidth}px`,
                borderStyle: `${shape.borderStyle}`,
                border: `${shape.borderColor} ${
                  shape.borderWidth / window.percentZoomed
                }px ${shape.borderStyle}`,

                // color styling

                backgroundImage: `url(${shape.backgroundImage})`,
                backgroundSize: "cover",
                opacity: `${shape.opacity}`,
              }}
            ></div>
          )}
        </>
      ))}
    </>
  );
};

export default RenderBoxes;
