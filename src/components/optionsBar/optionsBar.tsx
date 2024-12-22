/*************  ✨ Codeium Command 🌟  *************/
import React, { useState, useRef, useEffect, useCallback } from "react";
import styles from "./optionsBar.module.css";
import { useSelector, useDispatch } from "react-redux";
import Position from "../options/position";
import Dimension from "../options/dimension";
import Transform from "../options/transform";
import Opacity from "../options/opacity";
import FontStyles from "../options/fontStyles";
import BoxStyling from "../options/boxStyling";
import type { AppDispatch } from "../../store";
import { updateShape } from "../../features/whiteBoard/whiteBoardSlice";
import { doc, updateDoc } from "firebase/firestore";
import { db } from "../../config/firebase";
import WhiteBoard from "../whiteBoard/whiteBoard";

const OptionsBar = () => {
  const user = useSelector((state: any) => state.auth.user);
  const dispatch = useDispatch<AppDispatch>();
  const hidden = useSelector((state: any) => state.sideBar.hideSideBar);
  const selectedIdx = useSelector(
    (state: any) => state.whiteBoard.selectedShape
  );
  const selectedShape = useSelector((state: any) => state.whiteBoard.shapes)[
    selectedIdx
  ];
  const boardChoices = useSelector((state: any) => state.boards);
  const board = useSelector((state: any) => state.whiteBoard);
  const [left, setLeft] = useState(85); // Initial left position in percentage
  const [Edgedragging, setEdgeDragging] = useState(false);
  const [startX, setStartX] = useState(0); // Track starting position of drag
  const [startLeft, setStartLeft] = useState(left); // Track starting left value
  const optionsBarRef = useRef<HTMLDivElement | null>(null);
  const [selectedValue, setSelectedValue] = useState(
    selectedShape?.id || "none"
  );
  const drawing = useSelector((state: any) => state.actions.drawing);
  const dragging = useSelector((state: any) => state.actions.dragging);
  const doubleClicking = useSelector(
    (state: any) => state.actions.doubleClicking
  );

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button === 0) {
      setEdgeDragging(true);
      setStartX(e.clientX);
      setStartLeft(left);
    }
  };

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (dragging && optionsBarRef.current) {
        const deltaX = e.clientX - startX;
        const deltaPercent = (deltaX / window.innerWidth) * 100;
        const newLeft = Math.min(90, Math.max(80, startLeft + deltaPercent));
        setLeft(newLeft);
      }
    },
    [dragging, startX, startLeft]
  );

  const handleMouseUp = useCallback(() => {
    if (dragging) {
      setEdgeDragging(false);
    }
  }, [dragging]);

  useEffect(() => {
    if (dragging) {
      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);
    } else {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    }

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [dragging, handleMouseMove, handleMouseUp]);

  return (
    <>
      {!hidden && (
        <div
          className={styles.optionsBar}
          ref={optionsBarRef}
          style={{ left: `${left}%`, width: `${100 - left}%` }}
        >
          <h1>{selectedShape?.type}</h1>
          <div
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              bottom: 0,
              width: 5,
              cursor: "ew-resize",
            }}
            onMouseDown={handleMouseDown}
          />
          {selectedShape?.type === "board" && (
            <select
              value={selectedValue}
              onChange={async (e) => {
                const selectedBoardId = e.target.value;
                if (selectedBoardId === "none") {
                  return;
                }
                let selectedBoard = boardChoices.publicBoards.find(
                  (board: any) => board.id === selectedBoardId
                );
                if (!selectedBoard) {
                  selectedBoard = boardChoices.privateBoards.find(
                    (board: any) => board.id === selectedBoardId
                  );
                }
                if (!selectedBoard) {
                  selectedBoard = boardChoices.sharedBoards.find(
                    (board: any) => board.id === selectedBoardId
                  );
                }
                dispatch(
                  updateShape({
                    index: selectedIdx,
                    update: {
                      id: selectedBoard.id,
                      uid: selectedBoard.uid,
                      title: selectedBoard.title,
                    },
                  })
                );
                console.log(board);

                setSelectedValue(selectedBoardId);
              }}
            >
              <option value="none">none</option>
              {boardChoices.publicBoards.map((board: any, index: number) => (
                <option key={index} value={board.id}>
                  {board.id + " public"}
                </option>
              ))}
              {boardChoices.privateBoards.map((board: any, index: number) => (
                <option key={index} value={board.id}>
                  {board.id + " private"}
                </option>
              ))}
              {boardChoices.sharedBoards.map((board: any, index: number) => (
                <option key={index} value={board.id}>
                  {board.id + " shared"}
                </option>
              ))}
            </select>
            /******  f320630b-d2ae-446c-965c-4f3e563d62e5  *******/
          )}
          {selectedShape && <Position />}
          {selectedShape && <Dimension />}
          {selectedShape && <Transform />}
          {selectedShape && <BoxStyling />}
          {selectedShape && <Opacity />}
          {selectedShape && selectedShape.type === "text" && <FontStyles />}
        </div>
      )}
    </>
  );
};

export default OptionsBar;
