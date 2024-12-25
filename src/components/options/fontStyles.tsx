import React, { useEffect, useState } from "react";
import { useSelector, useDispatch } from "react-redux";
import { updateShape } from "../../features/whiteBoard/whiteBoardSlice";
import styles from "./options.module.css";
import alignLeft from "../../res/align-left.png";
import alignCenter from "../../res/align-center.png";
import alignRight from "../../res/align-right.png";

const FontStyles = () => {
  const dispatch = useDispatch();
  const selectedIdx = useSelector(
    (state: any) => state.selected.selectedShapes[0]
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

  useEffect(() => {
    updateTextStyling();
    console.log(
      `fontFamily: ${fontFamily}, fontWeight: ${fontWeight}, textAlign: ${textAlign}, alignItems: ${alignItems}, textDecoration: ${textDecoration}`
    );
  }, [fontFamily, fontWeight, textAlign, alignItems, textDecoration]);

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
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      updateTextStyling();
    }
  };
  return (
    <div className={styles.container}>
      <h4 className={styles.optionHeader}>Typography</h4>
      <div className={styles.labelInput}>
        <h5 className={styles.label}>size</h5>
        <input
          type="number"
          className={styles.numberInput}
          value={fontSize}
          onChange={(e) => setFontSize(Number(e.target.value))}
          onKeyDown={handleKeyDown}
        />
      </div>
      <div className={styles.labelInput}>
        <h5 className={styles.label}>family</h5>
        <select
          value={fontFamily}
          className={styles.dropdown}
          onChange={(e) => setFontFamily(e.target.value)}
        >
          <option value="Arial">Arial</option>
          <option value="Times New Roman">Times New Roman</option>
          <option value="Verdana">Verdana</option>
        </select>
      </div>
      <div className={styles.labelInput}>
        <h5 className={styles.label}>weight</h5>
        <select
          value={fontWeight}
          onChange={(e) => setFontWeight(e.target.value)}
          className={styles.dropdown}
        >
          <option value="lighter">lighter</option>
          <option value="normal">normal</option>
          <option value="bold">bold</option>
          <option value="bolder">bolder</option>
        </select>
      </div>
      <div className={styles.labelInput}>
        <h5 className={styles.label}>text align</h5>
        <img
          src={alignLeft} // Replace with your image URL
          alt="left align"
          className={`${styles.radioImage} ${
            textAlign === "left" ? styles.checked : ""
          }`}
          onClick={() => setTextAlign("left")}
        />

        <img
          src={alignCenter} // Replace with your image URL
          alt="center align"
          className={`${styles.radioImage} ${
            textAlign === "center" ? styles.checked : ""
          }`}
          onClick={() => setTextAlign("center")}
        />

        <img
          src={alignRight} // Replace with your image URL
          alt="right align"
          className={`${styles.radioImage} ${
            textAlign === "right" ? styles.checked : ""
          }`}
          onClick={() => setTextAlign("right")}
        />
      </div>

      <div className={styles.labelInput}>
        <h5 className={styles.label}>vertical align</h5>
        <img
          src={alignLeft} // Replace with your image URL
          alt="flex-start align"
          className={`${styles.radioImage} ${
            alignItems === "flex-start" ? styles.checked : ""
          }`}
          onClick={() => setAlignItems("flex-start")}
        />

        <img
          src={alignCenter} // Replace with your image URL
          alt="center align"
          className={`${styles.radioImage} ${
            alignItems === "center" ? styles.checked : ""
          }`}
          onClick={() => setAlignItems("center")}
        />

        <img
          src={alignRight} // Replace with your image URL
          alt="flex-end align"
          className={`${styles.radioImage} ${
            alignItems === "flex-end" ? styles.checked : ""
          }`}
          onClick={() => setAlignItems("flex-end")}
        />
      </div>

      <div className={styles.labelInput}>
        <h5 className={styles.label}>text decoration</h5>
        <img
          src={alignLeft} // Replace with your image URL
          alt="none decoration"
          className={`${styles.radioImage} ${
            textDecoration === "none" ? styles.checked : ""
          }`}
          onClick={() => setTextDecoration("none")}
        />

        <img
          src={alignCenter} // Replace with your image URL
          alt="underline decoration"
          className={`${styles.radioImage} ${
            textDecoration === "underline" ? styles.checked : ""
          }`}
          onClick={() => setTextDecoration("underline")}
        />

        <img
          src={alignRight} // Replace with your image URL
          alt="overline decoration"
          className={`${styles.radioImage} ${
            textDecoration === "overline" ? styles.checked : ""
          }`}
          onClick={() => setTextDecoration("overline")}
        />

        <img
          src={alignRight} // Replace with your image URL
          alt="line-through decoration"
          className={`${styles.radioImage} ${
            textDecoration === "line-through" ? styles.checked : ""
          }`}
          onClick={() => setTextDecoration("line-through")}
        />
      </div>

      <div className={styles.labelInput}>
        <h5 className={styles.label}>line height</h5>
        <input
          type="number"
          className={styles.numberInput}
          value={lineHeight}
          onChange={(e) => setLineHeight(Number(e.target.value))}
          onKeyDown={handleKeyDown}
        />
      </div>
      <div className={styles.labelInput}>
        <h5 className={styles.label}>letter spacing</h5>
        <input
          type="number"
          className={styles.numberInput}
          value={letterSpacing}
          onChange={(e) => setLetterSpacing(Number(e.target.value))}
          onKeyDown={handleKeyDown}
        />
      </div>
    </div>
  );
};

export default FontStyles;
