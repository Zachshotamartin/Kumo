import React from "react";
import { useSelector, useDispatch } from "react-redux";
import { Shape } from "../../features/whiteBoard/whiteBoardSlice";
import {
  setHoverStartX,
  setHoverStartY,
  setHoverEndX,
  setHoverEndY,
} from "../../features/selected/selectedSlice";

const RenderBoxes = (props: any) => {
  const { shapes } = props;
  const selectedShapes = useSelector(
    (state: any) => state.selected.selectedShapes
  );
  const dispatch = useDispatch();
  const window = useSelector((state: any) => state.window);

  const handleMouseEnter = (shape: Shape) => {
    if (!selectedShapes.includes(shape.id)) {
      dispatch(setHoverStartX(shape.x1 - 2));
      dispatch(setHoverStartY(shape.y1 - 2));
      dispatch(setHoverEndX(shape.x2 - 2));
      dispatch(setHoverEndY(shape.y2 - 2));
    } else {
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
        <div key={index}>
          {shape.type === "rectangle" && (
            <div
              style={{
                // type
                position: "absolute",
                zIndex: selectedShapes
                  .map((shape: Shape) => shape.id)
                  .includes(shape.id)
                  ? 50
                  : shape.zIndex,

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
                  (shape.borderWidth ?? 0) / window.percentZoomed
                }px ${shape.borderStyle}`,

                // color styling

                backgroundColor: `${shape.backgroundColor}`,

                opacity: `${shape.opacity}`,
              }}
              onMouseOver={
                shape.level === 0 ? () => handleMouseEnter(shape) : () => {}
              }
              onMouseOut={shape.level === 0 ? handleMouseLeave : () => {}}
            ></div>
          )}
        </div>
      ))}
    </>
  );
};

export default RenderBoxes;
