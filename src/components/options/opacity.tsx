import React, { useState, useEffect } from "react";
import { useSelector, useDispatch } from "react-redux";
import { updateShape } from "../../features/whiteBoard/whiteBoardSlice";

const Opacity = () => {
  const dispatch = useDispatch();
  const selectedIdx = useSelector(
    (state: any) => state.whiteBoard.selectedShape
  );
  const selectedShape = useSelector((state: any) => state.whiteBoard.shapes)[
    selectedIdx
  ];
  const [opacity, setOpacity] = useState(selectedShape.opacity);
  

  const handleSetOpacity = (value: number) => {
    if (value > 1) setOpacity(1);
    else if (value < 0) setOpacity(0);
    else setOpacity(value);
  };
  useEffect(() => {
    setOpacity(selectedShape.opacity);
  }, [selectedShape]);

  const updateOpacity = () => {
    dispatch(
      updateShape({
        index: selectedIdx,
        update: {
          opacity: opacity,
        },
      })
    );
  };
  return (
    <div>
      <p>Appearance</p>
      <p>Opacity</p>
      <input
        type="number"
        value={opacity}
        min={0}
        max={1}
        onChange={(e) => handleSetOpacity(Number(e.target.value))}
      />
      <button onClick={updateOpacity}>Update</button>
    </div>
  );
};

export default Opacity;
