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
  const [fontSize, setFontSize] = useState(selectedShape.fontSize);
  const [fontFamily, setFontFamily] = useState(selectedShape.fontFamily);
  const [fontWeight, setFontWeight] = useState(selectedShape.fontWeight);
  const [textAlign, setTextAlign] = useState(selectedShape.textAlign);
  const [alignItems, setAlignItems] = useState(selectedShape.alignItems);
  const [textDecoration, setTextDecoration] = useState(
    selectedShape.textDecoration
  );
  const [lineHeight, setLineHeight] = useState(selectedShape.lineHeight);
  const [letterSpacing, setLetterSpacing] = useState(
    selectedShape.letterSpacing
  );

  useEffect(() => {
    setFontSize(selectedShape.fontSize);
    setFontFamily(selectedShape.fontFamily);
    setFontWeight(selectedShape.fontWeight);
    setTextAlign(selectedShape.textAlign);
    setAlignItems(selectedShape.alignItems);
    setTextDecoration(selectedShape.textDecoration);
    setLineHeight(selectedShape.lineHeight);
    setLetterSpacing(selectedShape.letterSpacing);
  }, [selectedShape]);

  const updateTextStyling = () => {
    dispatch(
      updateShape({
        index: selectedIdx,
        update: {
          fontSize: fontSize,
          fontFamily: fontFamily,
          fontWeight: fontWeight,
          textAlign: textAlign,
          alignItems: alignItems,
          textDecoration: textDecoration,
          lineHeight: lineHeight,
          letterSpacing: letterSpacing,
        },
      })
    );
    console.log(selectedShape.alignItems);
    console.log(selectedShape);
  };
  return (
    <div>
      <h2>Font Styling</h2>
      <p>font size</p>
      <input
        type="number"
        value={fontSize}
        onChange={(e) => setFontSize(Number(e.target.value))}
      />
      <p>font family</p>
      <select
        value={fontFamily}
        onChange={(e) => setFontFamily(e.target.value)}
      >
        <option value="Arial">Arial</option>
        <option value="Times New Roman">Times New Roman</option>
        <option value="Verdana">Verdana</option>
      </select>
      <p>font weight</p>
      <select
        value={fontWeight}
        onChange={(e) => setFontWeight(e.target.value)}
      >
        <option value="lighter">lighter</option>
        <option value="normal">normal</option>
        <option value="bold">bold</option>
        <option value="bolder">bolder</option>
      </select>
      <p>text align</p>
      <input
        type="radio"
        name="textAlign"
        value="left"
        checked={textAlign === "left"}
        onChange={(e) => setTextAlign(e.target.value)}
      />
      <input
        type="radio"
        name="textAlign"
        value="center"
        checked={textAlign === "center"}
        onChange={(e) => setTextAlign(e.target.value)}
      />
      <input
        type="radio"
        name="textAlign"
        value="right"
        checked={textAlign === "right"}
        onChange={(e) => setTextAlign(e.target.value)}
      />
      <p>vertical align</p>
      <input
        type="radio"
        name="alignItems"
        value="flex-start"
        checked={alignItems === "flex-start"}
        onChange={(e) => setAlignItems(e.target.value)}
      />
      <input
        type="radio"
        name="alignItems"
        value="center"
        checked={alignItems === "center"}
        onChange={(e) => setAlignItems(e.target.value)}
      />
      <input
        type="radio"
        name="alignItems"
        value="flex-end"
        checked={alignItems === "flex-end"}
        onChange={(e) => setAlignItems(e.target.value)}
      />
      <p>text decoration</p>
      <input
        type="radio"
        name="textDecoration"
        value="none"
        checked={textDecoration === "none"}
        onChange={(e) => setTextDecoration(e.target.value)}
      />
      <input
        type="radio"
        name="textDecoration"
        value="underline"
        checked={textDecoration === "underline"}
        onChange={(e) => setTextDecoration(e.target.value)}
      />
      <input
        type="radio"
        name="textDecoration"
        value="overline"
        checked={textDecoration === "overline"}
        onChange={(e) => setTextDecoration(e.target.value)}
      />
      <input
        type="radio"
        name="textDecoration"
        value="line-through"
        checked={textDecoration === "line-through"}
        onChange={(e) => setTextDecoration(e.target.value)}
      />
      <p>line height</p>
      <input
        type="number"
        value={lineHeight}
        onChange={(e) => setLineHeight(Number(e.target.value))}
      />
      <p>letter spacing</p>
      <input
        type="number"
        value={letterSpacing}
        onChange={(e) => setLetterSpacing(Number(e.target.value))}
      />
      <button onClick={updateTextStyling}>Update</button>
    </div>
  );
};

export default FontStyles;
