import React from "react";
import { useSelector} from "react-redux";
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
                  Math.min(shape.y1, shape.y2),
                  Math.min(borderStartY, borderEndY)
                ) -
                  window.y1) /
                window.percentZoomed
              }px`,
              left: `${(shape.x1 - window.x1) / window.percentZoomed}px`,
              width: `2px`,
              height: `${
                Math.abs(
                  Math.min(
                    Math.min(shape.y1, shape.y2),
                    Math.min(borderStartY, borderEndY)
                  ) -
                    Math.max(
                      Math.max(shape.y1, shape.y2),
                      Math.max(borderStartY, borderEndY)
                    )
                ) / window.percentZoomed
              }px`,
              zIndex: 99,
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
                  Math.min(shape.y1, shape.y2),
                  Math.min(borderStartY, borderEndY)
                ) -
                  window.y1) /
                window.percentZoomed
              }px`,
              left: `${(shape.x2 - window.x1) / window.percentZoomed}px`,
              width: `2px`,
              height: `${
                Math.abs(
                  Math.min(
                    Math.min(shape.y1, shape.y2),
                    Math.min(borderStartY, borderEndY)
                  ) -
                    Math.max(
                      Math.max(shape.y1, shape.y2),
                      Math.max(borderStartY, borderEndY)
                    )
                ) / window.percentZoomed
              }px`,
              zIndex: 99,
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
                  Math.min(shape.x1, shape.x2),
                  Math.min(borderStartX, borderEndX)
                ) -
                  window.x1) /
                window.percentZoomed
              }px`,
              width: `${
                Math.abs(
                  Math.min(
                    Math.min(shape.x1, shape.x2),
                    Math.min(borderStartX, borderEndX)
                  ) -
                    Math.max(
                      Math.max(shape.x1, shape.x2),
                      Math.max(borderStartX, borderEndX)
                    )
                ) / window.percentZoomed
              }px`,

              height: `2px`,
              zIndex: 99,
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
                  Math.min(shape.x1, shape.x2),
                  Math.min(borderStartX, borderEndX)
                ) -
                  window.x1) /
                window.percentZoomed
              }px`,
              width: `${
                Math.abs(
                  Math.min(
                    Math.min(shape.x1, shape.x2),
                    Math.min(borderStartX, borderEndX)
                  ) -
                    Math.max(
                      Math.max(shape.x1, shape.x2),
                      Math.max(borderStartX, borderEndX)
                    )
                ) / window.percentZoomed
              }px`,
              height: `2px`,
              zIndex: 99,
            }}
          ></div>
        )}
      {(shape.y1 + Math.floor(shape.height / 2) === borderStartY ||
        shape.y1 + Math.floor(shape.height / 2) === borderEndY ||
        shape.y1 + Math.floor(shape.height / 2) ===
          borderStartY + Math.floor((borderEndY - borderStartY) / 2)) &&
        !selectedShapes.includes(index) && (
          <div
            style={{
              position: "absolute",
              top: `${
                Math.floor(shape.y1 + shape.height / 2 - window.y1) /
                window.percentZoomed
              }px`,
              left: `${
                (Math.min(
                  Math.min(shape.x1, shape.x2),
                  Math.min(borderStartX, borderEndX)
                ) -
                  window.x1) /
                window.percentZoomed
              }px`,
              width: `${
                Math.abs(
                  Math.min(
                    Math.min(shape.x1, shape.x2),
                    Math.min(borderStartX, borderEndX)
                  ) -
                    Math.max(
                      Math.max(shape.x1, shape.x2),
                      Math.max(borderStartX, borderEndX)
                    )
                ) / window.percentZoomed
              }px`,
              height: "2px",
              backgroundColor: "red",
              zIndex: 99,
            }}
          ></div>
        )}
      {(shape.x1 + Math.floor(shape.width / 2) === borderStartX ||
        shape.x1 + Math.floor(shape.width / 2) === borderEndX ||
        shape.x1 + Math.floor(shape.width / 2) ===
          borderStartX + Math.floor((borderEndX - borderStartX) / 2)) &&
        !selectedShapes.includes(index) && (
          <div
            style={{
              position: "absolute",
              top: `${
                (Math.min(
                  Math.min(shape.y1, shape.y2),
                  Math.min(borderStartY, borderEndY)
                ) -
                  window.y1) /
                window.percentZoomed
              }px`,
              left: `${
                Math.floor(shape.x1 + shape.width / 2 - window.x1) /
                window.percentZoomed
              }px`,
              width: "2px",
              height: `${
                Math.abs(
                  Math.min(
                    Math.min(shape.y1, shape.y2),
                    Math.min(borderStartY, borderEndY)
                  ) -
                    Math.max(
                      Math.max(shape.y1, shape.y2),
                      Math.max(borderStartY, borderEndY)
                    )
                ) / window.percentZoomed
              }px`,
              backgroundColor: "red",
              zIndex: 99,
            }}
          ></div>
        )}
    </div>
  ));
};

export default RenderSnappingGuides;
