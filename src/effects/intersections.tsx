// fix border

import { useEffect } from "react";
import {
  setGridSnappedX,
  setGridSnappedY,
  setGridSnappedDistanceX,
  setGridSnappedDistanceY,
} from "../features/actions/actionsSlice";
import { useDispatch, useSelector } from "react-redux";
import { Shape } from "../classes/shape";
import { AppDispatch } from "../store";
import { setHideOptions } from "../features/hide/hide";

const GetIntersections = () => {
  const borderStartX = useSelector((state: any) => state.selected.borderStartX);
  const borderStartY = useSelector((state: any) => state.selected.borderStartY);
  const borderEndX = useSelector((state: any) => state.selected.borderEndX);
  const borderEndY = useSelector((state: any) => state.selected.borderEndY);
  const selectedShapes = useSelector(
    (state: any) => state.selected.selectedShapes
  );
  const shapes = useSelector((state: any) => state.whiteBoard.shapes);
  const dispatch = useDispatch<AppDispatch>();
  /*
    Intersection useEffect:
    Responsibility -> When a shape is moved or resized, checks for intersections with
                      other shapes.
  */
  useEffect(() => {
    // figure out when the the edge of the border hits the edge of another shape.
    if (borderStartX === -100000 || borderStartY === -100000) {
      return;
    }
    if (borderEndX === -100000 || borderEndY === -100000) {
      return;
    }

    let intersectsX = false;
    let intersectsY = false;
    shapes.forEach((shape: Shape, index: number) => {
      const middleOfShapeX = shape.x1 + Math.floor(shape.width / 2);
      const middleOfBorderX =
        borderStartX + Math.floor((borderEndX - borderStartX) / 2);
      const middleOfShapeY = shape.y1 + Math.floor(shape.height / 2);
      const middleOfBorderY =
        borderStartY + Math.floor((borderEndY - borderStartY) / 2);
      if (
        (shape.x1 === borderStartX ||
          shape.x1 === borderEndX ||
          shape.x1 === middleOfBorderX ||
          middleOfShapeX === borderStartX ||
          middleOfShapeX === middleOfBorderX ||
          middleOfShapeX === borderEndX ||
          shape.x2 === borderStartX ||
          shape.x2 === middleOfBorderX ||
          shape.x2 === borderEndX) &&
        !selectedShapes.includes(shape.id)
      ) {
        intersectsX = true;
      }
      if (
        (shape.y1 === borderStartY ||
          shape.y1 === borderEndY ||
          shape.y1 === middleOfBorderY ||
          middleOfShapeY === borderStartY ||
          middleOfShapeY === middleOfBorderY ||
          middleOfShapeY === borderEndY ||
          shape.y2 === borderStartY ||
          shape.y2 === middleOfBorderY ||
          shape.y2 === borderEndY) &&
        !selectedShapes.includes(shape.id)
      ) {
        intersectsY = true;
      }
    });
    if (intersectsX) {
      dispatch(setGridSnappedX(true));
      dispatch(setGridSnappedDistanceX(0));
    }
    if (intersectsY) {
      dispatch(setGridSnappedY(true));
      dispatch(setGridSnappedDistanceY(0));
    }
  }, [borderStartX, borderStartY, borderEndX, borderEndY]);

  return null;
};

export default GetIntersections;
