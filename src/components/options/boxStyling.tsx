import React, { useState, useEffect } from "react";
import { useSelector, useDispatch } from "react-redux";
import { updateShape } from "../../features/whiteBoard/whiteBoardSlice";

const BoxStyling = () => {
  const dispatch = useDispatch();
  const selectedIdx = useSelector(
    (state: any) => state.whiteBoard.selectedShape
  );
  const selectedShape = useSelector((state: any) => state.whiteBoard.shapes)[
    selectedIdx
  ];
  const [borderRadius, setBorderRadius] = useState(selectedShape.borderRadius);
  const [borderWidth, setBorderWidth] = useState(selectedShape.borderWidth);
  const [borderStyle, setBorderStyle] = useState(selectedShape.borderStyle);
  useEffect(() => {
    setBorderRadius(selectedShape.borderRadius);
    setBorderWidth(selectedShape.borderWidth);
    setBorderStyle(selectedShape.borderStyle);
  }, [selectedShape]);

  const updatePosition = () => {
    dispatch(
      updateShape({
        index: selectedIdx,
        update: {
          borderRadius: borderRadius,
          borderWidth: borderWidth,
          borderStyle: borderStyle,
        },
      })
    );
  };
  return (
    <div>
      <h2>Box Styling</h2>
      <p>border radius</p>
      <input
        type="number"
        value={borderRadius}
        onChange={(e) => setBorderRadius(Number(e.target.value))}
      />
      <p>border width</p>
      <input
        type="number"
        value={borderWidth}
        onChange={(e) => setBorderWidth(Number(e.target.value))}
      />
      <p>border style</p>
      <select
        value={borderStyle}
        onChange={(e) => setBorderStyle(e.target.value)}
      >
        <option value="solid">Solid</option>
        <option value="dashed">Dashed</option>
        <option value="dotted">Dotted</option>
      </select>
      <button onClick={updatePosition}>Update</button>
    </div>
  );
};

export default BoxStyling;
