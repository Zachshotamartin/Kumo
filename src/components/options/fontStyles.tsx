import React, { useEffect, useState } from "react";
import { useSelector, useDispatch } from "react-redux";

import styles from "./options.module.css";
import alignLeft from "../../res/align-left.png";
import alignCenter from "../../res/align-center.png";
import alignRight from "../../res/align-right.png";
import overline from "../../res/overline.png";
import underline from "../../res/underline.png";
import none from "../../res/none.png";
import lineThrough from "../../res/throughline.png";
import alignTop from "../../res/align-top.png";
import alignMiddle from "../../res/align-middle.png";
import alignBottom from "../../res/align-bottom.png";

import { handleBoardChange } from "../../helpers/handleBoardChange";
import { setWhiteboardData } from "../../features/whiteBoard/whiteBoardSlice";
import { Shape } from "../../classes/shape";

const FontStyles = () => {
  const dispatch = useDispatch();
  const board = useSelector((state: any) => state.whiteBoard);
  const selectedShapes = useSelector(
    (state: any) => state.selected.selectedShapes
  );
  const shapes = useSelector((state: any) => state.whiteBoard.shapes);
  let selectedShape: Shape | undefined;
  if (selectedShapes) {
    selectedShape = shapes.find(
      (shape: Shape, index: number) => shape.id === selectedShapes[0]
    );
  }
  const [fontSize, setFontSize] = useState(selectedShape?.fontSize || 16);
  const [fontFamily, setFontFamily] = useState(
    selectedShape?.fontFamily || "Arial"
  );
  const [fontWeight, setFontWeight] = useState(
    selectedShape?.fontWeight || "normal"
  );
  const [textAlign, setTextAlign] = useState(
    selectedShape?.textAlign || "left"
  );
  const [alignItems, setAlignItems] = useState(
    selectedShape?.alignItems || "flex-start"
  );
  const [textDecoration, setTextDecoration] = useState(
    selectedShape?.textDecoration || "none"
  );
  const [lineHeight, setLineHeight] = useState(
    selectedShape?.lineHeight || 1.5
  );
  const [letterSpacing, setLetterSpacing] = useState(
    selectedShape?.letterSpacing || 0
  );
  const updateTextStyling = () => {
    const data = {
      ...board,
      shapes: [
        ...shapes.filter(
          (shape: Shape, index: number) => shape.id !== selectedShape?.id
        ),
        {
          ...selectedShape,
          fontSize: fontSize,
          fontFamily: fontFamily,
          fontWeight: fontWeight,
          textAlign: textAlign,
          alignItems: alignItems,
          textDecoration: textDecoration,
          lineHeight: lineHeight,
          letterSpacing: letterSpacing,
        },
      ],
    };
    dispatch(setWhiteboardData(data));
    handleBoardChange(data);
  };
  useEffect(() => {
    updateTextStyling();
  }, [
    fontSize,
    fontFamily,
    fontWeight,
    textAlign,
    alignItems,
    textDecoration,
    lineHeight,
    letterSpacing,
  ]);

  useEffect(() => {
    if (selectedShape) {
      setFontSize(selectedShape.fontSize || 16);
      setFontFamily(selectedShape.fontFamily || "Arial");
      setFontWeight(selectedShape.fontWeight || "normal");
      setTextAlign(selectedShape.textAlign || "left");
      setAlignItems(selectedShape.alignItems || "flex-start");
      setTextDecoration(selectedShape.textDecoration || "none");
      setLineHeight(selectedShape.lineHeight || 1.5);
      setLetterSpacing(selectedShape.letterSpacing || 0);
    }
  }, [selectedShape]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      updateTextStyling();
    }
  };
  return (
    <div className={styles.container}>
      <h6 className={styles.optionHeader}>Typography</h6>
      <div className={styles.labelInputGroup}>
        <div className={styles.labelInput}>
          <h6 className={styles.label}>size</h6>
          <input
            type="number"
            className={styles.numberInput}
            value={fontSize}
            onChange={(e) => setFontSize(Number(e.target.value))}
            onKeyDown={handleKeyDown}
          />
        </div>
        <div className={styles.labelInput}>
          <h6 className={styles.label}>weight</h6>
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
      </div>
      <div className={styles.labelInputGroup}>
        <div className={styles.labelInput}>
          <h6 className={styles.label}>family</h6>
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
      </div>
      <div className={styles.labelInputGroup}>
        <div className={styles.labelInput}>
          <h6 className={styles.label}>text align</h6>
          <div className={styles.radioGroup}>
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
        </div>

        <div className={styles.labelInput}>
          <h6 className={styles.label}>vertical align</h6>
          <div className={styles.radioGroup}>
            <img
              src={alignTop}
              alt="flex-start align"
              className={`${styles.radioImage} ${
                alignItems === "flex-start" ? styles.checked : ""
              }`}
              onClick={() => setAlignItems("flex-start")}
            />

            <img
              src={alignMiddle}
              alt="center align"
              className={`${styles.radioImage} ${
                alignItems === "center" ? styles.checked : ""
              }`}
              onClick={() => setAlignItems("center")}
            />

            <img
              src={alignBottom}
              alt="flex-end align"
              className={`${styles.radioImage} ${
                alignItems === "flex-end" ? styles.checked : ""
              }`}
              onClick={() => setAlignItems("flex-end")}
            />
          </div>
        </div>
      </div>
      <div className={styles.labelInputGroup}>
        <div className={styles.labelInput}>
          <h6 className={styles.label}>text decoration</h6>
          <div className={styles.radioGroup}>
            <img
              src={none} // Replace with your image URL
              alt="none decoration"
              className={`${styles.radioImage} ${
                textDecoration === "none" ? styles.checked : ""
              }`}
              onClick={() => setTextDecoration("none")}
            />

            <img
              src={underline} // Replace with your image URL
              alt="underline decoration"
              className={`${styles.radioImage} ${
                textDecoration === "underline" ? styles.checked : ""
              }`}
              onClick={() => setTextDecoration("underline")}
            />

            <img
              src={overline} // Replace with your image URL
              alt="overline decoration"
              className={`${styles.radioImage} ${
                textDecoration === "overline" ? styles.checked : ""
              }`}
              onClick={() => setTextDecoration("overline")}
            />

            <img
              src={lineThrough} // Replace with your image URL
              alt="line-through decoration"
              className={`${styles.radioImage} ${
                textDecoration === "line-through" ? styles.checked : ""
              }`}
              onClick={() => setTextDecoration("line-through")}
            />
          </div>
        </div>
      </div>
      <div className={styles.labelInputGroup}>
        <div className={styles.labelInput}>
          <h6 className={styles.label}>line height</h6>
          <input
            type="number"
            className={styles.numberInput}
            value={lineHeight}
            onChange={(e) => setLineHeight(Number(e.target.value))}
            onKeyDown={handleKeyDown}
          />
        </div>
        <div className={styles.labelInput}>
          <h6 className={styles.label}>letter spacing</h6>
          <input
            type="number"
            className={styles.numberInput}
            value={letterSpacing}
            onChange={(e) => setLetterSpacing(Number(e.target.value))}
            onKeyDown={handleKeyDown}
          />
        </div>
      </div>
    </div>
  );
};

export default FontStyles;
