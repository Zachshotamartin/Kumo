import React, { useEffect, useRef } from "react";
import { useSelector } from "react-redux";
import { Shape } from "../../features/whiteBoard/whiteBoardSlice";
import { useDispatch } from "react-redux";
import {
  updateShape,
  removeShape,
} from "../../features/whiteBoard/whiteBoardSlice";
import {
  setHoverStartX,
  setHoverStartY,
  setHoverEndX,
  setHoverEndY,
} from "../../features/selected/selectedSlice";
import { AppDispatch } from "../../store";
const RenderText = () => {
  const shapes = useSelector((state: any) => state.whiteBoard.shapes);
  const selectedShapes = useSelector(
    (state: any) => state.selected.selectedShapes
  );
  const dispatch = useDispatch<AppDispatch>();
  const textareaRefs = useRef<HTMLTextAreaElement[] | null[]>([]);
  const drawing = useSelector((state: any) => state.actions.drawing);
  const window = useSelector((state: any) => state.window);

  const handleMouseEnter = (index: number) => {
    const shape = shapes.find((shape: Shape, i: number) => i === index);
    if (shape && !selectedShapes.includes(index)) {
      dispatch(setHoverStartX(shape.x1 - 2));
      dispatch(setHoverStartY(shape.y1 - 2));
      dispatch(setHoverEndX(shape.x2 - 2));
      dispatch(setHoverEndY(shape.y2 - 2));
    } else {
      handleMouseLeave();
    }
  };

  const handleMouseLeave = () => {
    dispatch(setHoverStartX(-100000));
    dispatch(setHoverStartY(-100000));
    dispatch(setHoverEndX(-100000));
    dispatch(setHoverEndY(-100000));
  };

  const handleBlur = (index: number) => {
    if (!shapes[index].text) {
      dispatch(removeShape(index));
    }
  };

  const calculateUsedRows = (
    text: string,
    lineHeight: number,
    fontSize: number,
    width: number,
    fontFamily: string
  ) => {
    const div = document.createElement("div");
    div.style.position = "absolute";
    div.style.visibility = "hidden";
    div.style.whiteSpace = "pre-wrap";
    div.style.wordWrap = "break-word";
    div.style.fontSize = `${fontSize}px`;
    div.style.lineHeight = `${lineHeight}`;
    div.style.width = `${width}px`;
    div.style.fontFamily = fontFamily;

    div.textContent = text;
    document.body.appendChild(div);
    const height = div.offsetHeight;
    document.body.removeChild(div);
    const endingCharacter = text.endsWith("\n") ? 1 : 0;
    return Math.ceil(height / lineHeight) + endingCharacter;
  };

  const handleInputChange = (
    index: number,
    e: React.ChangeEvent<HTMLTextAreaElement>,
    rows: number
  ) => {
    const updatedShape: Shape = {
      ...shapes[index],
      text: e.target.value,
      rows: rows,
    };
    dispatch(updateShape({ index, update: updatedShape }));
  };

  useEffect(() => {
    if (
      selectedShapes.length === 1 &&
      shapes[selectedShapes[0]] !== undefined &&
      shapes[selectedShapes[0]].type === "text" &&
      !drawing
    ) {
      setTimeout(() => {
        handleInputFocus(selectedShapes[0]);
      }, 100);
    } else {
      textareaRefs.current?.[selectedShapes[0]]?.blur();
    }
  }, [selectedShapes, drawing]);

  const handleInputFocus = (index: number) => {
    if (selectedShapes.length === 1 && selectedShapes[0] === index) {
      console.log(index);
      if (textareaRefs.current?.[index]) {
        console.log("focus");
        console.log(index);
        textareaRefs.current[index]?.focus();
      }
    }
  };

  return (
    <>
      {shapes.map((shape: Shape, index: number) => (
        <>
          {shape.type === "text" && (
            <div
              key={index}
              style={{
                // type
                position: "absolute",
                zIndex: selectedShapes.includes(index) ? 50 : shape.zIndex,

                // position
                top: `${
                  ((shape.y1 > shape.y2 ? shape.y2 : shape.y1) - window.y1) /
                    window.percentZoomed -
                  (selectedShapes.includes(index) ? 1 : 0)
                }px`,
                left: `${
                  ((shape.x1 > shape.x2 ? shape.x2 : shape.x1) - window.x1) /
                    window.percentZoomed -
                  (selectedShapes.includes(index) ? 1 : 0)
                }px`,

                // dimension
                width: `${shape.width / window.percentZoomed}px`,
                height: `${shape.height / window.percentZoomed}px`,

                // transforms
                transform: `rotate(${shape.rotation || 0}deg)`,
                // flipX?: boolean;
                // flipY?: boolean;

                // box styling
                borderRadius: `${shape.borderRadius}%`,

                border: `${shape.borderColor} ${
                  shape.borderWidth / window.percentZoomed
                }px ${shape.borderStyle}`,

                // color styling

                opacity: `${shape.opacity}`,
                backgroundColor: `${shape.backgroundColor}`,
              }}
              onMouseEnter={() => handleMouseEnter(index)}
              onMouseLeave={handleMouseLeave}
            >
              <textarea
                ref={(el) => (textareaRefs.current[index] = el)}
                style={{
                  display: "flex",
                  width: "100%",
                  height: "100%",

                  backgroundColor: "transparent",
                  resize: "none",
                  outline: "none",
                  padding:
                    shape.alignItems === "flex-start"
                      ? "0 0 0 0"
                      : shape.alignItems === "flex-end"
                      ? `${
                          shape.height / window.percentZoomed -
                          (shape.lineHeight * shape.rows) / window.percentZoomed
                        }px 0 0 0`
                      : shape.alignItems === "center"
                      ? `${
                          shape.height / 2 / window.percentZoomed -
                          shape.lineHeight / 2 / window.percentZoomed
                        }px 0 ${
                          shape.height / 2 / window.percentZoomed -
                          shape.lineHeight / 2 / window.percentZoomed
                        }px 0`
                      : "0 0 0 0",

                  border: "0px solid transparent",
                  overflow: "hidden",
                  whiteSpace: "nowrap",
                  textOverflow: "ellipsis",

                  // text styling
                  fontSize: `${shape.fontSize / window.percentZoomed}px`,
                  fontFamily: `${shape.fontFamily}`,
                  fontWeight: `${shape.fontWeight}`,
                  textAlign: shape.textAlign as "left" | "right" | "center",
                  textDecoration: `${shape.textDecoration}`,
                  lineHeight: `${shape.lineHeight}`,
                  letterSpacing: `${
                    shape.letterSpacing / window.percentZoomed
                  }px`,
                  color: `${shape.color}`,
                }}
                value={shape.text}
                onChange={(e) => {
                  const usedRows = calculateUsedRows(
                    e.target.value,
                    shape.lineHeight * window.percentZoomed,
                    shape.fontSize * window.percentZoomed,
                    shape.width / window.percentZoomed,
                    shape.fontFamily
                  );
                  handleInputChange(index, e, usedRows);
                }}
                onBlur={() => handleBlur(index)}
              />
            </div>
          )}
        </>
      ))}
    </>
  );
};

export default RenderText;
