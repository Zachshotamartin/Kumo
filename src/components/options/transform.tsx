import React, { useState, useEffect } from "react";
import { useSelector, useDispatch } from "react-redux";
import { updateShape } from "../../features/whiteBoard/whiteBoardSlice";

const Transform = () => {
  const dispatch = useDispatch();
  const selectedIdx = useSelector(
    (state: any) => state.whiteBoard.selectedShape
  );
  const selectedShape = useSelector((state: any) => state.whiteBoard.shapes)[
    selectedIdx
  ];
  const [rotation, setRotation] = useState(selectedShape.rotate);
  useEffect(() => {
    setRotation(selectedShape.rotation);
  }, [selectedShape]);

  const updatePosition = () => {
    dispatch(
      updateShape({
        index: selectedIdx,
        update: {
          rotation: rotation,
        },
      })
    );
  };
  return (
    <div>
      <h2>Transform</h2>
      <p>rotation</p>
      <input
        type="number"
        value={rotation}
        onChange={(e) => setRotation(Number(e.target.value))}
      />
      <button onClick={updatePosition}>Update</button>
    </div>
  );
};

export default Transform;
