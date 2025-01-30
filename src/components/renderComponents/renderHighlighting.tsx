import React, { useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import { Shape } from "../../features/whiteBoard/whiteBoardSlice";
import { setSelectedShapes } from "../../features/selected/selectedSlice";

const RenderHighlighting = () => {
  const dispatch = useDispatch();
  const shapes = useSelector((state: any) => state.whiteBoard.shapes);
  const selectedShapes = useSelector(
    (state: any) => state.selected.selectedShapes
  );
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

  useEffect(() => {
    // search the shapes array to find all the shapes that intersect this bounding box
    const minx = Math.min(highlightStartX, highlightEndX);
    const maxx = Math.max(highlightStartX, highlightEndX);
    const miny = Math.min(highlightStartY, highlightEndY);
    const maxy = Math.max(highlightStartY, highlightEndY);
    const intersectingShapeIndices = shapes.filter(
      (shape: Shape, index: number) => {
        if (
          shape.x1 < maxx &&
          shape.x2 > minx &&
          shape.y1 < maxy &&
          shape.y2 > miny
        ) {
          return true;
        }
        return false;
      }
    );
    const intersectingShapeIds = intersectingShapeIndices.map(
      (shape: Shape) => shape.id
    );
    let isSame = true;
    if (selectedShapes.length !== intersectingShapeIds.length) {
      console.log("dispatch");
      dispatch(setSelectedShapes(intersectingShapeIds));
      return;
    } else {
      // check inner elements
      for (let i = 0; i < selectedShapes.length; i++) {
        if (!intersectingShapeIds.includes(selectedShapes[i])) {
          isSame = false;
        }
      }
    }

    if (!isSame) {
      console.log("not same");
      console.log(selectedShapes, intersectingShapeIds);
      dispatch(setSelectedShapes(intersectingShapeIds));
    }
  }, [
    dispatch,
    highlightEndX,
    highlightEndY,
    highlightStartX,
    highlightStartY,
    selectedShapes,
    shapes,
  ]);

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
