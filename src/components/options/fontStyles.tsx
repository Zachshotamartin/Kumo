import React, { useEffect, useState } from "react";
import { useSelector, useDispatch } from "react-redux";
import { updateShape } from "../../features/whiteBoard/whiteBoardSlice";

const FontStyles = () => {
  const dispatch = useDispatch();
  const selectedIdx = useSelector(
    (state: any) => state.whiteBoard.selectedShape
  );
  const selectedShape = useSelector((state: any) => state.whiteBoard.shapes)[
    selectedIdx
  ];
  const [width, setWidth] = useState(
    Math.abs(selectedShape.x2 - selectedShape.x1)
  );
  const [height, setHeight] = useState(
    Math.abs(selectedShape.y2 - selectedShape.y1)
  );
  useEffect(() => {
    setWidth(Math.abs(selectedShape.x2 - selectedShape.x1));
    setHeight(Math.abs(selectedShape.y2 - selectedShape.y1));
  }, [selectedShape]);

  const updatePosition = () => {
    dispatch(
      updateShape({
        index: selectedIdx,
        update: {
          x1:
            selectedShape.x1 > selectedShape.x2
              ? selectedShape.x2
              : selectedShape.x1,
          y1:
            selectedShape.y1 > selectedShape.y2
              ? selectedShape.y2
              : selectedShape.y1,
          x2:
            (selectedShape.x1 <= selectedShape.x2
              ? selectedShape.x2
              : selectedShape.x1) +
            width -
            Math.abs(selectedShape.x2 - selectedShape.x1),
          y2:
            (selectedShape.y1 <= selectedShape.y2
              ? selectedShape.y2
              : selectedShape.y1) +
            height -
            Math.abs(selectedShape.y2 - selectedShape.y1),
          width,
          height,
        },
      })
    );
  };
  return (
    <div>
      <h2>Position</h2>
      <p>width</p>
      <input
        type="number"
        value={width}
        onChange={(e) => setWidth(Number(e.target.value))}
      />
      <p>height</p>
      <input
        type="number"
        value={height}
        onChange={(e) => setHeight(Number(e.target.value))}
      />
      <button onClick={updatePosition}>Update</button>
    </div>
  );
};

export default FontStyles;
