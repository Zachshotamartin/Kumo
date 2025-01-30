import React, { useEffect, useRef, useState } from "react";
import { useSelector } from "react-redux";
import {
  setWhiteboardData,
  Shape,
} from "../../features/whiteBoard/whiteBoardSlice";
import { useDispatch } from "react-redux";
import {
  setHoverStartX,
  setHoverStartY,
  setHoverEndX,
  setHoverEndY,
} from "../../features/selected/selectedSlice";
import { AppDispatch } from "../../store";
import { doc } from "firebase/firestore";
import { db } from "../../config/firebase";
import { handleBoardChange } from "../../helpers/handleBoardChange";

const RenderText = (props: any) => {
  const { shapes } = props;
  const board = useSelector((state: any) => state.whiteBoard);
  const selectedShapes = useSelector(
    (state: any) => state.selected.selectedShapes
  );
  let selectedShape: Shape | undefined;
  if (selectedShapes) {
    selectedShape = shapes.find(
      (shape: Shape) => shape.id === selectedShapes[0]
    );
  }

  const dispatch = useDispatch<AppDispatch>();
  const textareaRefs = useRef<Record<string, HTMLTextAreaElement | null>>({});

  const drawing = useSelector((state: any) => state.actions.drawing);
  const window = useSelector((state: any) => state.window);

  const [docRef, setDocRef] = useState<any>(doc(db, "boards", board.id));

  const handleMouseEnter = (shape: Shape) => {
    if (!selectedShapes.includes(shape.id)) {
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

  // const handleBlur = (id: string) => {
  //   const shape = shapes.find((shape: Shape) => shape.id === id);
  //   if (shape && !shape.text) {
  //     dispatch(
  //       setWhiteboardData({
  //         ...board,
  //         shapes: board.shapes.filter((shape: Shape) => shape.id !== id),
  //         lastChangedby: localStorage.getItem("user"),
  //       })
  //     );
  //     handleBoardChange({
  //       ...board,
  //       shapes: board.shapes.filter((shape: Shape) => shape.id !== id),
  //       lastChangedby: localStorage.getItem("user"),
  //     });
  //   }
  // };

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
    id: string,
    e: React.ChangeEvent<HTMLTextAreaElement>,
    rows: number
  ) => {
    const updatedShape: Shape = {
      ...shapes.find((shape: Shape) => shape.id === id)!,
      text: e.target.value,
      rows: rows,
    };

    dispatch(
      setWhiteboardData({
        ...board,
        shapes: [
          ...board.shapes.filter((shape: Shape) => shape.id !== id),
          updatedShape,
        ],
        lastChangedby: localStorage.getItem("user"),
      })
    );

    handleBoardChange({
      ...board,
      shapes: [
        ...board.shapes.filter((shape: Shape) => shape.id !== id),
        updatedShape,
      ],
      lastChangedby: localStorage.getItem("user"),
    });
  };

  useEffect(() => {
    if (
      selectedShapes &&
      selectedShape !== undefined &&
      selectedShape.type === "text" &&
      !drawing
    ) {
      setTimeout(() => {
        handleInputFocus(selectedShapes[0]);
      }, 100);
    } else if (selectedShapes.length > 0) {
      const ref = textareaRefs.current[selectedShapes[0]];
      if (ref) ref.blur();
    }
  }, [selectedShapes, drawing]);

  const handleInputFocus = (id: string) => {
    const ref = textareaRefs.current[id];
    if (ref) {
      ref.focus();
    }
  };

  return (
    <>
      {shapes.map(
        (shape: Shape) =>
          shape.type === "text" && (
            <div
              key={shape.id}
              style={{
                position: "absolute",
                zIndex: selectedShapes.includes(shape.id) ? 50 : shape.zIndex,
                top: `${
                  ((shape.y1 > shape.y2 ? shape.y2 : shape.y1) - window.y1) /
                    window.percentZoomed -
                  (selectedShapes.includes(shape.id) ? 1 : 0)
                }px`,
                left: `${
                  ((shape.x1 > shape.x2 ? shape.x2 : shape.x1) - window.x1) /
                    window.percentZoomed -
                  (selectedShapes.includes(shape.id) ? 1 : 0)
                }px`,
                width: `${shape.width / window.percentZoomed}px`,
                height: `${shape.height / window.percentZoomed}px`,
                transform: `rotate(${shape.rotation || 0}deg)`,
                borderRadius: `${shape.borderRadius}%`,
                border: `${shape.borderColor} ${
                  (shape.borderWidth ?? 0) / window.percentZoomed
                }px ${shape.borderStyle}`,
                opacity: `${shape.opacity}`,
                backgroundColor: `${shape.backgroundColor}`,
                pointerEvents: "auto", // Ensure it allows interaction
              }}
              // onDoubleClick={() => {
              //   // Focus the textarea on double-click
              //   const textarea = textareaRefs.current[shape.id];
              //   if (textarea) {
              //     textarea.focus();
              //   }
              //   console.log(`Shape ${shape.id} double-clicked`);
              // }}
            >
              <textarea
                key={shape.id}
                ref={(el) => (textareaRefs.current[shape.id] = el)}
                style={{
                  display: "flex",
                  width: "100%",
                  height: "100%",
                  backgroundColor: "transparent",
                  resize: "none",
                  outline: "none",
                  border: "none",
                  overflow: "hidden",
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                  zIndex: 10,
                  color: shape.color,
                  fontSize: `${
                    (shape.fontSize ?? 12) / window.percentZoomed
                  }px`,
                  fontFamily: `${shape.fontFamily}`,
                  fontWeight: `${shape.fontWeight}`,
                  textAlign: shape.textAlign as "left" | "right" | "center",
                  lineHeight: `${shape.lineHeight}`,
                  letterSpacing: `${
                    (shape.letterSpacing ?? 0) / window.percentZoomed
                  }px`,
                  position: "relative",
                  pointerEvents: "none", // Prevent interactions like clicks or single focus
                }}
                value={shape.text}
                onChange={(e) => {
                  const usedRows = calculateUsedRows(
                    e.target.value,
                    (shape.lineHeight ?? 1.2) * window.percentZoomed,
                    (shape.fontSize ?? 12) * window.percentZoomed,
                    shape.width / window.percentZoomed,
                    shape.fontFamily ?? "Arial"
                  );
                  handleInputChange(shape.id, e, usedRows);
                }}
                //onBlur={() => handleBlur(shape.id)}
              />
            </div>
          )
      )}
    </>
  );
};

export default RenderText;
