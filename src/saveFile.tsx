// import React, { useEffect, useRef, useState } from "react";
// import { useSelector, useDispatch } from "react-redux";

// import {
//   setWhiteboardData,
//   Shape,
// } from "../../features/whiteBoard/whiteBoardSlice";
// import { AppDispatch } from "../../store";
// import { handleBoardChange } from "../../helpers/handleBoardChange";
// import {
//   setHoverEndX,
//   setHoverEndY,
//   setHoverStartX,
//   setHoverStartY,
// } from "../../features/selected/selectedSlice";

// const ContentEditableWithRef = (props: any) => {
//   const value = useRef(props.value);
//   const style = useRef(props.style);
//   const ref = useRef(props.ref);

//   const handleInput = (event: any) => {
//     if (props.onChange) {
//       console.log(event.target.innerHTML);
//       props.onChange(event.target.innerHTML);
//     }
//   };

//   return (
//     <span
//       style={style.current}
//       contentEditable
//       onInput={handleInput}
//       className="custom-textarea"
//       dangerouslySetInnerHTML={{ __html: value.current }}
//     />
//   );
// };

// const RenderText = ({ shapes }: any) => {
//   const board = useSelector((state: any) => state.whiteBoard);
//   const selectedShapes = useSelector(
//     (state: any) => state.selected.selectedShapes
//   );
//   const drawing = useSelector((state: any) => state.actions.drawing);
//   const windowState = useSelector((state: any) => state.window);

//   const dispatch = useDispatch<AppDispatch>();
//   const spanRefs = useRef<Record<string, HTMLSpanElement | null>>({});
//   const caretPositionRef = useRef<number | null>(null); // Store caret position in a ref

//   const selectedShape = selectedShapes
//     ? shapes.find((shape: Shape) => shape.id === selectedShapes[0])
//     : undefined;
//   const [nameFromRef, setNameFromRef] = useState(selectedShape?.text || "");
//   console.log(nameFromRef);

//   // useEffect(() => {
//   //   if (selectedShape) {
//   //     const updatedShape: Shape = {
//   //       ...shapes.find((shape: Shape) => shape.id === selectedShape?.id)!,
//   //       text: nameFromRef, // Update the shape text with the new content (HTML with <br />)
//   //     };
//   //     dispatch(
//   //       setWhiteboardData({
//   //         ...board,
//   //         shapes: board.shapes.map((shape: Shape) =>
//   //           shape.id === selectedShape?.id ? updatedShape : shape
//   //         ),
//   //         lastChangedby: localStorage.getItem("user"),
//   //       })
//   //     );

//   //     handleBoardChange({
//   //       ...board,
//   //       shapes: board.shapes.map((shape: Shape) =>
//   //         shape.id === selectedShape?.id ? updatedShape : shape
//   //       ),
//   //       lastChangedby: localStorage.getItem("user"),
//   //     });
//   //   }
//   //   console.log(nameFromRef);
//   // }, [nameFromRef]);

//   const handleMouseEnter = (shape: Shape) => {
//     if (!selectedShapes.includes(shape.id)) {
//       dispatch(setHoverStartX(shape.x1 - 2));
//       dispatch(setHoverStartY(shape.y1 - 2));
//       dispatch(setHoverEndX(shape.x2 - 2));
//       dispatch(setHoverEndY(shape.y2 - 2));
//     } else {
//       handleMouseLeave();
//     }
//   };

//   const handleMouseLeave = () => {
//     dispatch(setHoverStartX(-100000));
//     dispatch(setHoverStartY(-100000));
//     dispatch(setHoverEndX(-100000));
//     dispatch(setHoverEndY(-100000));
//   };

//   // Track input changes and caret position
//   // const handleInputChange = (
//   //   id: string,
//   //   e: React.FormEvent<HTMLDivElement>
//   // ) => {
//   //   e.preventDefault();
//   //   const el = e.currentTarget;

//   //   // Capture caret position on input change (before text update)
//   //   const selection = window.getSelection();
//   //   if (selection && selection.rangeCount > 0) {
//   //     const range = selection.getRangeAt(0);
//   //     caretPositionRef.current = range.startOffset; // Save caret position in ref before text update
//   //   }

//   //   const text = el.innerHTML; // Get the updated HTML content, including <br /> tags

//   //   const updatedShape: Shape = {
//   //     ...shapes.find((shape: Shape) => shape.id === id)!,
//   //     text, // Update the shape text with the new content (HTML with <br />)
//   //   };

//   //   dispatch(
//   //     setWhiteboardData({
//   //       ...board,
//   //       shapes: board.shapes.map((shape: Shape) =>
//   //         shape.id === id ? updatedShape : shape
//   //       ),
//   //       lastChangedby: localStorage.getItem("user"),
//   //     })
//   //   );

//   //   handleBoardChange({
//   //     ...board,
//   //     shapes: board.shapes.map((shape: Shape) =>
//   //       shape.id === id ? updatedShape : shape
//   //     ),
//   //     lastChangedby: localStorage.getItem("user"),
//   //   });
//   // };

//   // // Handle the Enter key to create a new line with <br />
//   // const handleKeyDown = (
//   //   id: string,
//   //   e: React.KeyboardEvent<HTMLDivElement>
//   // ) => {
//   //   if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
//   //     const el = contentEditableRefs.current[id];
//   //     if (!el) return; // Return early if el is null
//   //     const selection = window.getSelection();
//   //     if (selection && selection.rangeCount > 0) {
//   //       const range = selection.getRangeAt(0);
//   //       console.log("range", range);
//   //       console.log(el.innerHTML);
//   //     }
//   //   }

//   //   if (e.key === "Enter") {
//   //     e.preventDefault(); // Prevent the default action of Enter key
//   //     const el = contentEditableRefs.current[id];
//   //     if (!el) return; // Return early if el is null
//   //     const selection = window.getSelection();
//   //     if (selection && selection.rangeCount > 0) {
//   //       const range = selection.getRangeAt(0);
//   //       const newNode = document.createElement("br");
//   //       range.insertNode(newNode);
//   //       range.setStartAfter(newNode);
//   //       range.setEndAfter(newNode);
//   //       selection.removeAllRanges();
//   //       selection.addRange(range);
//   //     }

//   //     const text = el.innerHTML; // Get the updated HTML content, including <br /> tags

//   //     const updatedShape: Shape = {
//   //       ...shapes.find((shape: Shape) => shape.id === id)!,
//   //       text, // Update the shape text with the new content (HTML with <br />)
//   //     };

//   //     dispatch(
//   //       setWhiteboardData({
//   //         ...board,
//   //         shapes: board.shapes.map((shape: Shape) =>
//   //           shape.id === id ? updatedShape : shape
//   //         ),
//   //         lastChangedby: localStorage.getItem("user"),
//   //       })
//   //     );

//   //     handleBoardChange({
//   //       ...board,
//   //       shapes: board.shapes.map((shape: Shape) =>
//   //         shape.id === id ? updatedShape : shape
//   //       ),
//   //       lastChangedby: localStorage.getItem("user"),
//   //     });
//   //   }
//   // };

//   // // Restore caret position after re-render (ensure it's before text update)
//   // useEffect(() => {
//   //   const el = contentEditableRefs.current[selectedShapes[0]];
//   //   if (el && caretPositionRef.current !== null) {
//   //     const selection = window.getSelection();
//   //     if (selection) {
//   //       const range = document.createRange();
//   //       const targetNode = el.childNodes[0] || el;

//   //       // Safely handle the caret positioning if the node exists
//   //       if (targetNode && targetNode.nodeType === 3) {
//   //         range.setStart(targetNode, caretPositionRef.current);
//   //         range.collapse(true);
//   //         selection.removeAllRanges();
//   //         selection.addRange(range); // Restore caret position to saved value
//   //         console.log("range", range);
//   //         console.log(el.innerHTML);
//   //       }
//   //     }
//   //   }
//   // }, [shapes]);

//   useEffect(() => {
//     if (
//       selectedShapes.length > 0 &&
//       selectedShape?.type === "text" &&
//       !drawing
//     ) {
//       setTimeout(() => {
//         handleInputFocus(selectedShapes[0]);
//       }, 100);
//     } else {
//       const ref = spanRefs.current[selectedShapes[0]];
//       if (ref) ref.blur();
//     }
//   }, [selectedShapes, drawing]);

//   const handleInputFocus = (id: string) => {
//     const ref = spanRefs.current[id];
//     if (ref) {
//       ref.focus();
//     }
//   };

//   return (
//     <>
//       {shapes.map(
//         (shape: Shape) =>
//           shape.type === "text" && (
//             <div
//               key={shape.id}
//               style={{
//                 position: "absolute",
//                 zIndex: selectedShapes.includes(shape.id) ? 50 : shape.zIndex,
//                 top: `${
//                   (Math.min(shape.y1, shape.y2) - windowState.y1) /
//                     windowState.percentZoomed -
//                   (selectedShapes.includes(shape.id) ? 1 : 0)
//                 }px`,
//                 left: `${
//                   (Math.min(shape.x1, shape.x2) - windowState.x1) /
//                     windowState.percentZoomed -
//                   (selectedShapes.includes(shape.id) ? 1 : 0)
//                 }px`,
//                 width: `${shape.width / windowState.percentZoomed}px`,
//                 height: `${shape.height / windowState.percentZoomed}px`,
//                 transform: `rotate(${shape.rotation || 0}deg)`,
//                 borderRadius: `${shape.borderRadius}%`,
//                 border: `${shape.borderColor} ${
//                   (shape.borderWidth ?? 0) / windowState.percentZoomed
//                 }px ${shape.borderStyle}`,
//                 opacity: shape.opacity,
//                 backgroundColor: "transparent",
//                 pointerEvents: "auto",
//                 flexDirection: "column",
//               }}
//               onMouseEnter={() => handleMouseEnter(shape)}
//               onMouseLeave={handleMouseLeave}
//             >
//               {/* <div
//                 contentEditable
//                 ref={(el) => (contentEditableRefs.current[shape.id] = el)}
//                 style={{
//                   display: "flex",
//                   width: "100%",
//                   height: "100%",
//                   padding: "1rem",
//                   backgroundColor: "black",
//                   margin: 0,

//                   resize: "none",
//                   outline: "none",
//                   border: "none",
//                   overflow: "hidden",
//                   whiteSpace: "pre-wrap",
//                   wordBreak: "break-word",
//                   zIndex: 10,
//                   color: shape.color,
//                   fontSize: `${
//                     (shape.fontSize ?? 12) / windowState.percentZoomed
//                   }px`,
//                   fontFamily: shape.fontFamily,
//                   fontWeight: shape.fontWeight,
//                   justifyContent:
//                     shape.textAlign === "left"
//                       ? "flex-start"
//                       : shape.textAlign === "center"
//                       ? "center"
//                       : "flex-end",
//                   textAlign: shape.textAlign as "left" | "right" | "center",
//                   alignItems: shape.alignItems as
//                     | "flex-start"
//                     | "center"
//                     | "flex-end",
//                   lineHeight: shape.lineHeight,
//                   letterSpacing: `${
//                     (shape.letterSpacing ?? 0) / windowState.percentZoomed
//                   }px`,
//                   position: "relative",
//                   pointerEvents: "auto", // Allow interaction
//                 }}
//                 onInput={(e) => handleInputChange(shape.id, e)}
//                 onKeyDown={(e) => handleKeyDown(shape.id, e)}
//                 suppressContentEditableWarning={true}
//                 dangerouslySetInnerHTML={{ __html: shapes.text }}
//               ></div> */}
//               <ContentEditableWithRef
//                 value={nameFromRef}
//                 onChange={setNameFromRef}
//                 ref={(el: HTMLSpanElement | null) =>
//                   (spanRefs.current[shape.id] = el)
//                 }
//                 style={{
//                   display: "flex",
//                   width: "100%",
//                   height: "100%",
//                   padding: "1rem",
//                   backgroundColor: "black",
//                   margin: 0,

//                   resize: "none",
//                   outline: "none",
//                   border: "none",
//                   overflow: "hidden",
//                   whiteSpace: "pre-wrap",
//                   wordBreak: "break-word",
//                   zIndex: 10,
//                   color: shape.color,
//                   fontSize: `${
//                     (shape.fontSize ?? 12) / windowState.percentZoomed
//                   }px`,
//                   fontFamily: shape.fontFamily,
//                   fontWeight: shape.fontWeight,
//                   justifyContent:
//                     shape.textAlign === "left"
//                       ? "flex-start"
//                       : shape.textAlign === "center"
//                       ? "center"
//                       : "flex-end",
//                   textAlign: shape.textAlign as "left" | "right" | "center",
//                   alignItems: shape.alignItems as
//                     | "flex-start"
//                     | "center"
//                     | "flex-end",
//                   lineHeight: shape.lineHeight,
//                   letterSpacing: `${
//                     (shape.letterSpacing ?? 0) / windowState.percentZoomed
//                   }px`,
//                   position: "relative",
//                   pointerEvents: "auto", // Allow interaction
//                 }}
//               />
//             </div>
//           )
//       )}
//     </>
//   );
// };

// export default RenderText;

const SaveFile = () => {
  return <div></div>;
};

export default SaveFile;
