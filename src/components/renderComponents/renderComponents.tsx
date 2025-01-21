import React from "react";
import { useSelector, useDispatch } from "react-redux";
import { Shape } from "../../features/whiteBoard/whiteBoardSlice";
import RenderBoxes from "../renderComponents/renderBoxes";
import RenderText from "../renderComponents/renderText";
import RenderEllipses from "../renderComponents/renderEllipses";
import RenderCalendars from "../renderComponents/renderCalendars";
import RenderImages from "../renderComponents/renderImages";
import {
  setHoverStartX,
  setHoverStartY,
  setHoverEndX,
  setHoverEndY,
} from "../../features/selected/selectedSlice";

const RenderComponents = (props: any) => {
  const { shapes } = props;
  const dispatch = useDispatch();
  const selectedShapes = useSelector(
    (state: any) => state.selected.selectedShapes
  );
  const window = useSelector((state: any) => state.window);

  const handleMouseEnter = (index: number) => {
    const shape = shapes.find((shape: Shape, i: number) => i === index);
    console.log(shape);
    console.log("entered component");
    if (shape && !selectedShapes.includes(index) && shape.level === 0) {
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
      {shapes.map((component: Shape, index: number) => (
        <div
          key={index}
          onMouseEnter={() => handleMouseEnter(index)}
          onMouseLeave={handleMouseLeave}
        >
          {component.type === "component" && (
            <>
              <div
                style={{
                  position: "absolute",
                  top: (component.y1 - window.y1) / window.percentZoomed,
                  left: (component.x1 - window.x1) / window.percentZoomed,
                  width: (component.x2 - component.x1) / window.percentZoomed,
                  height: (component.y2 - component.y1) / window.percentZoomed,
                  zIndex: component.shapes
                    ? component.shapes.reduce((a: Shape, b: Shape) =>
                        (a.zIndex || 0) > (b.zIndex || 0) ? a : b
                      ).zIndex
                    : 99,
                  backgroundColor: "transparent",
                }}
              ></div>
              <div>
                {component.shapes?.map((shape: Shape, shapeIndex: number) => (
                  <>
                    {shape.type === "rectangle" && (
                      <RenderBoxes shapes={[shape]} />
                    )}
                    {shape.type === "text" && <RenderText shapes={[shape]} />}
                    {shape.type === "image" && (
                      <RenderImages shapes={[shape]} />
                    )}
                    {shape.type === "ellipse" && (
                      <RenderEllipses shapes={[shape]} />
                    )}
                    {shape.type === "calendar" && (
                      <RenderCalendars shapes={[shape]} />
                    )}
                    {shape.type === "component" && (
                      <RenderComponents shapes={[shape]} />
                    )}
                  </>
                ))}
              </div>
            </>
          )}
        </div>
      ))}
    </>
  );
};

export default RenderComponents;
