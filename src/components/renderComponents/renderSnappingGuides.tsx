import React from "react";
import { useSelector } from "react-redux";
import { Shape } from "../../features/whiteBoard/whiteBoardSlice";

const RenderSnappingGuides = () => {
  const shapes = useSelector((state: any) => state.whiteBoard.shapes);
  const borderStartX = useSelector((state: any) => state.selected.borderStartX);
  const borderStartY = useSelector((state: any) => state.selected.borderStartY);
  const borderEndX = useSelector((state: any) => state.selected.borderEndX);
  const borderEndY = useSelector((state: any) => state.selected.borderEndY);
  const window = useSelector((state: any) => state.window);
  const selectedShapes = useSelector(
    (state: any) => state.selected.selectedShapes
  );
  if (borderStartX === -100000 || borderStartY === -100000) {
    return null;
  }

  return shapes.map((shape: Shape, index: number) => (
    <div
      key={index}
      style={{
        backgroundColor: "transparent",
        border: "none",
        position: "absolute",
      }}
    >
      {(borderStartX === shape.x1 || borderEndX === shape.x1) &&
        !selectedShapes.includes(index) && (
          <div
            style={{
              backgroundColor: "red",
              position: "absolute",
              top: `${
                (Math.min(
                  Math.max(shape.y1, shape.y2),
                  Math.max(borderStartY, borderEndY)
                ) -
                  window.y1) /
                window.percentZoomed
              }px`,
              left: `${(shape.x1 - window.x1) / window.percentZoomed}px`,
              width: "1px",
              height: `${
                Math.abs(
                  Math.max(
                    Math.min(shape.y1, shape.y2),
                    Math.min(borderStartY, borderEndY)
                  ) -
                    Math.min(
                      Math.max(shape.y1, shape.y2),
                      Math.max(borderStartY, borderEndY)
                    )
                ) / window.percentZoomed
              }px`,
            }}
          ></div>
        )}
      {(borderStartX === shape.x2 || borderEndX === shape.x2) &&
        !selectedShapes.includes(index) && (
          <div
            style={{
              backgroundColor: "red",
              position: "absolute",
              top: `${
                (Math.min(
                  Math.max(shape.y1, shape.y2),
                  Math.max(borderStartY, borderEndY)
                ) -
                  window.y1) /
                window.percentZoomed
              }px`,
              left: `${(shape.x2 - window.x1) / window.percentZoomed}px`,
              width: "1px",
              height: `${
                Math.abs(
                  Math.max(
                    Math.min(shape.y1, shape.y2),
                    Math.min(borderStartY, borderEndY)
                  ) -
                    Math.min(
                      Math.max(shape.y1, shape.y2),
                      Math.max(borderStartY, borderEndY)
                    )
                ) / window.percentZoomed
              }px`,
            }}
          ></div>
        )}
      {(borderStartY === shape.y1 || borderEndY === shape.y1) &&
        !selectedShapes.includes(index) && (
          <div
            style={{
              backgroundColor: "red",
              position: "absolute",
              top: `${(shape.y1 - window.y1) / window.percentZoomed}px`,
              left: `${
                (Math.min(
                  Math.max(shape.x1, shape.x2),
                  Math.max(borderStartX, borderEndX)
                ) -
                  window.x1) /
                window.percentZoomed
              }px`,
              width: `${
                Math.abs(
                  Math.max(
                    Math.min(shape.x1, shape.x2),
                    Math.min(borderStartX, borderEndX)
                  ) -
                    Math.min(
                      Math.max(shape.x1, shape.x2),
                      Math.max(borderStartX, borderEndX)
                    )
                ) / window.percentZoomed
              }px`,

              height: "1px",
            }}
          ></div>
        )}
      {(borderStartY === shape.y2 || borderEndY === shape.y2) &&
        !selectedShapes.includes(index) && (
          <div
            style={{
              backgroundColor: "red",
              position: "absolute",
              top: `${(shape.y2 - window.y1) / window.percentZoomed}px`,
              left: `${
                (Math.min(
                  Math.max(shape.x1, shape.x2),
                  Math.max(borderStartX, borderEndX)
                ) -
                  window.x1) /
                window.percentZoomed
              }px`,
              width: `${
                Math.abs(
                  Math.max(
                    Math.min(shape.x1, shape.x2),
                    Math.min(borderStartX, borderEndX)
                  ) -
                    Math.min(
                      Math.max(shape.x1, shape.x2),
                      Math.max(borderStartX, borderEndX)
                    )
                ) / window.percentZoomed
              }px`,
              height: "1px",
            }}
          ></div>
        )}
    </div>
  ));
};

export default RenderSnappingGuides;
