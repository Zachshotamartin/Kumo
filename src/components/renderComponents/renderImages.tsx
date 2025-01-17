import React from "react";
import { useSelector, useDispatch } from "react-redux";
import { Shape } from "../../features/whiteBoard/whiteBoardSlice";
import {
  setHoverStartX,
  setHoverStartY,
  setHoverEndX,
  setHoverEndY,
} from "../../features/selected/selectedSlice";

const RenderImages = () => {
  const shapes = useSelector((state: any) => state.whiteBoard.shapes);
  const selectedShapes = useSelector(
    (state: any) => state.selected.selectedShapes
  );
  const dispatch = useDispatch();
  const window = useSelector((state: any) => state.window);

  const handleMouseEnter = (index: number) => {
    const shape = shapes.find((shape: Shape, i: number) => i === index);
    if (shape && !selectedShapes.includes(index)) {
      dispatch(setHoverStartX(shape.x1 - 2));
      dispatch(setHoverStartY(shape.y1 - 2));
      dispatch(setHoverEndX(shape.x2 - 2));
      dispatch(setHoverEndY(shape.y2 - 2));
    }
    else {
      handleMouseLeave();
    }
  };

  const handleMouseLeave = () => {
    dispatch(setHoverStartX(-100000));
    dispatch(setHoverStartY(-100000));
    dispatch(setHoverEndX(-100000));
    dispatch(setHoverEndY(-100000));
  };

  return (
    <>
      {shapes.map((shape: Shape, index: number) => (
        <>
          {shape.type === "image" && (
            <div
              key={index}
              style={{
                // type
                position: "absolute",
                zIndex: selectedShapes.includes(index) ? 50 : shape.zIndex,

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

                backgroundColor: `${shape.backgroundColor}`,
                backgroundImage: `url(${shape.backgroundImage})`,
                backgroundSize: "cover",
                opacity: `${shape.opacity}`,
              }}
              onMouseEnter={() => handleMouseEnter(index)}
              onMouseLeave={handleMouseLeave}
            ></div>
          )}
        </>
      ))}
    </>
  );
};

export default RenderImages;
