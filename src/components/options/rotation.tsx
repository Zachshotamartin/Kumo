import React, { useState, useEffect } from "react";
import { useSelector, useDispatch } from "react-redux";
import { updateShape } from "../../features/whiteBoard/whiteBoardSlice";

const Rotation = () => {
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
      <p>rotate</p>
      <input
        type="number"
        value={rotation}
        onChange={(e) => setRotation(e.target.value)}
      />
      <button onClick={updatePosition}>Update</button>
    </div>
  );
};

export default Rotation;
