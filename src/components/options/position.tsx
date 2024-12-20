import React, { useState, useEffect } from "react";
import { useSelector, useDispatch } from "react-redux";
import { updateShape } from "../../features/whiteBoard/whiteBoardSlice";

const Position = () => {
  const dispatch = useDispatch();
  const selectedIdx = useSelector(
    (state: any) => state.whiteBoard.selectedShape
  );
  const selectedShape = useSelector((state: any) => state.whiteBoard.shapes)[
    selectedIdx
  ];
  const [x1, setX1] = useState(selectedShape.x1);
  const [y1, setY1] = useState(selectedShape.y1);
  useEffect(() => {
    setX1(selectedShape.x1);
    setY1(selectedShape.y1);
  }, [selectedShape]);

  const updatePosition = () => {
    dispatch(
      updateShape({
        index: selectedIdx,
        update: {
          x1: x1,
          y1: y1,
          x2: selectedShape.x2 - (selectedShape.x1 - x1),
          y2: selectedShape.y2 - (selectedShape.y1 - y1),
        },
      })
    );
  };
  return (
    <div>
      <h2>Position</h2>
      <p>x</p>
      <input type="number" value={x1} onChange={(e) => setX1(e.target.value)} />
      <p>y</p>
      <input type="number" value={y1} onChange={(e) => setY1(e.target.value)} />
      <button onClick={updatePosition}>Update</button>
    </div>
  );
};

export default Position;
