import React, { useEffect, useRef } from "react";
import { useSelector, useDispatch } from "react-redux";
import {
  setWhiteboardData,
  Shape,
} from "../../features/whiteBoard/whiteBoardSlice";
import {
  setHoverStartX,
  setHoverStartY,
  setHoverEndX,
  setHoverEndY,
} from "../../features/selected/selectedSlice";
import { AppDispatch } from "../../store";
import { handleBoardChange } from "../../helpers/handleBoardChange";

const RenderText = (props: any) => {
  const { shapes } = props;
  const board = useSelector((state: any) => state.whiteBoard);
  const selectedShapes = useSelector(
    (state: any) => state.selected.selectedShapes
  );
  const window = useSelector((state: any) => state.window);

  const dispatch = useDispatch<AppDispatch>();
  const textareaRefs = useRef<Record<string, HTMLTextAreaElement | null>>({});

  useEffect(() => {
    shapes.forEach((shape: Shape) => {
      if (shape.type === "text") {
        adjustHeight(shape.id);
      }
    });
  }, [shapes]);

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

  const adjustHeight = (id: string) => {
    const textarea = textareaRefs.current[id];
    if (textarea) {
      textarea.style.height = "auto"; // Reset before measuring
      textarea.style.height = `${textarea.scrollHeight}px`; // Scale by percentZoomed
    }
  };

  useEffect(() => {
    shapes.forEach((shape: Shape) => {
      if (shape.type === "text") {
        adjustHeight(shape.id);
      }
    });
  });
  const handleInputChange = (
    id: string,
    e: React.ChangeEvent<HTMLTextAreaElement>
  ) => {
    const updatedShape: Shape = {
      ...shapes.find((shape: Shape) => shape.id === id)!,
      text: e.target.value,
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

    requestAnimationFrame(() => adjustHeight(id)); // Ensure height updates smoothly
  };

  const handleDivClick = (id: string, e: React.MouseEvent) => {
    const textarea = textareaRefs.current[id];
    if (textarea && e.target !== textarea) {
      textarea.focus(); // Focus on the textarea if clicked outside it
     
      
    }
  };

  return (
    <>
      {shapes.map(
        (shape: Shape) =>
          shape.type === "text" && (
            <div
              onMouseEnter={() => handleMouseEnter(shape)}
              onMouseLeave={handleMouseLeave}
              onClick={(e) => handleDivClick(shape.id, e)} // Focus textarea when div is clicked
              key={shape.id}
              style={{
                position: "absolute",
                display: "flex",
                justifyContent: "center",

                alignItems: shape.alignItems, // Centers textarea vertically
                zIndex: selectedShapes.includes(shape.id) ? 50 : shape.zIndex,
                top: `${
                  (Math.min(shape.y1, shape.y2) - window.y1) /
                    window.percentZoomed -
                  (selectedShapes.includes(shape.id) ? 1 : 0)
                }px`,
                left: `${
                  (Math.min(shape.x1, shape.x2) - window.x1) /
                    window.percentZoomed -
                  (selectedShapes.includes(shape.id) ? 1 : 0)
                }px`,
                width: `${shape.width / window.percentZoomed}px`,
                height: `${shape.height / window.percentZoomed}px`, // Ensure it has a height
                transform: `rotate(${shape.rotation || 0}deg)`,
                borderRadius: `${shape.borderRadius}%`,
                border: `${shape.borderColor} ${
                  (shape.borderWidth ?? 0) / window.percentZoomed
                }px ${shape.borderStyle}`,
                opacity: `${shape.opacity}`,
                backgroundColor: `${shape.backgroundColor}`,
                pointerEvents: "auto",
              }}
            >
              <textarea
                key={shape.id}
                ref={(el) => (textareaRefs.current[shape.id] = el)}
                rows={1}
                style={{
                  width: "100%",
                  backgroundColor: "black",
                  height: "auto",
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
                  fontFamily: shape.fontFamily,
                  fontWeight: shape.fontWeight,
                  textAlign: shape.textAlign as "left" | "right" | "center",
                  lineHeight: `${shape.lineHeight}`,
                  letterSpacing: `${
                    (shape.letterSpacing ?? 0) / window.percentZoomed
                  }px`,
                  padding: 0,
                  margin: 0,
                }}
                value={shape.text}
                onChange={(e) => handleInputChange(shape.id, e)}
              />
            </div>
          )
      )}
    </>
  );
};

export default RenderText;
