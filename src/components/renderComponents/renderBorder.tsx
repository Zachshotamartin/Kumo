import React, { useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import { Shape } from "../../features/whiteBoard/whiteBoardSlice";

import {
  setBorderStartX,
  setBorderStartY,
  setBorderEndX,
  setBorderEndY,
} from "../../features/selected/selectedSlice";
const RenderBorder = () => {
  const dispatch = useDispatch();
  const borderStartX = useSelector((state: any) => state.selected.borderStartX);
  const borderStartY = useSelector((state: any) => state.selected.borderStartY);
  const borderEndX = useSelector((state: any) => state.selected.borderEndX);
  const borderEndY = useSelector((state: any) => state.selected.borderEndY);
  const shapes = useSelector((state: any) => state.whiteBoard.shapes);
  const selectedShapes = useSelector(
    (state: any) => state.selected.selectedShapes
  );
  const window = useSelector((state: any) => state.window);

  useEffect(() => {
    const selectedShapesArray = shapes.filter((shape: Shape, index: number) => {
      return selectedShapes.includes(index);
    });

    if (selectedShapesArray.length === 0) {
      dispatch(setBorderStartX(-100000));
      dispatch(setBorderEndX(-100000));
      dispatch(setBorderStartY(-100000));
      dispatch(setBorderEndY(-100000));
      return;
    }
    const leftX = selectedShapesArray.reduce((minX: number, shape: Shape) => {
      return Math.min(minX, Math.min(shape.x1, shape.x2));
    }, Infinity);

    const rightX = selectedShapesArray.reduce((maxX: number, shape: Shape) => {
      return Math.max(
        maxX,
        Math.max(shape.x1, shape.x2) + 2 * shape.borderWidth
      );
    }, -Infinity);

    const topY = selectedShapesArray.reduce((minY: number, shape: Shape) => {
      return Math.min(minY, Math.min(shape.y1, shape.y2));
    }, Infinity);

    const bottomY = selectedShapesArray.reduce((maxY: number, shape: Shape) => {
      return Math.max(
        maxY,
        Math.max(shape.y1, shape.y2) + 2 * shape.borderWidth
      );
    }, -Infinity);

    dispatch(setBorderStartX(leftX));
    dispatch(setBorderStartY(topY));
    dispatch(setBorderEndX(rightX));
    dispatch(setBorderEndY(bottomY));
  }, [selectedShapes, shapes]);

  return (
    <>
      <div
        style={{
          position: "absolute",
          top: `${(borderStartY - window.y1 - 2) / window.percentZoomed}px`,
          left: `${(borderStartX - window.x1 - 2) / window.percentZoomed}px`,
          width: `${
            Math.abs(borderStartX - borderEndX) / window.percentZoomed
          }px`,
          height: `${
            Math.abs(borderStartY - borderEndY) / window.percentZoomed
          }px`,

          border: `${2 / window.percentZoomed}px solid blue`,
          zIndex: 51,
        }}
      ></div>
      <div
        style={{
          position: "absolute",
          top: `${(borderStartY - window.y1 - 4) / window.percentZoomed}px`,
          left: `${(borderStartX - window.x1 - 4) / window.percentZoomed}px`,
          width: `${4 / window.percentZoomed}px`,
          height: `${4 / window.percentZoomed}px`,
          border: `${1 / window.percentZoomed}px solid blue`,
          backgroundColor: "white",
          zIndex: 52,
        }}
      ></div>
      <div
        style={{
          position: "absolute",
          top: `${(borderEndY - window.y1 - 2) / window.percentZoomed}px`,
          left: `${(borderStartX - window.x1 - 4) / window.percentZoomed}px`,
          width: `${4 / window.percentZoomed}px`,
          height: `${4 / window.percentZoomed}px`,
          border: `${1 / window.percentZoomed}px solid blue`,
          backgroundColor: "white",
          zIndex: 52,
        }}
      ></div>
      <div
        style={{
          position: "absolute",
          top: `${(borderStartY - window.y1 - 4) / window.percentZoomed}px`,
          left: `${(borderEndX - window.x1 - 2) / window.percentZoomed}px`,
          width: `${4 / window.percentZoomed}px`,
          height: `${4 / window.percentZoomed}px`,
          border: `${1 / window.percentZoomed}px solid blue`,
          backgroundColor: "white",
          zIndex: 52,
        }}
      ></div>
      <div
        style={{
          position: "absolute",
          top: `${(borderEndY - window.y1 - 2) / window.percentZoomed}px`,
          left: `${(borderEndX - window.x1 - 2) / window.percentZoomed}px`,
          width: `${4 / window.percentZoomed}px`,
          height: `${4 / window.percentZoomed}px`,
          border: `${1 / window.percentZoomed}px solid blue`,
          backgroundColor: "white",
          zIndex: 52,
        }}
      ></div>
    </>
  );
};

export default RenderBorder;
