import React, { useEffect, useState } from "react";
import styles from "./viewBoardPreview.module.css";
import boardImage from "../../res/recursive.png";
import { setWhiteboardData } from "../../features/whiteBoard/whiteBoardSlice";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../../config/firebase";
import { AppDispatch } from "../../store";
import { useDispatch, useSelector } from "react-redux";

import { ref, getDownloadURL } from "firebase/storage";
import { storage } from "../../config/firebase";

const ViewBoardPreview = (props: { boards: any }) => {
  const boards = props.boards;
  const dispatch = useDispatch<AppDispatch>();
  const boardImages = useSelector(
    (state: any) => state.boardImages.boardImages
  );

  const handleClick = async (board: string, type: string) => {
    if (!board) {
      console.error("Invalid board ID");
      return;
    }
    const docRef = doc(db, "boards", board);
    console.log(board);
    try {
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        const boardData = docSnap.data();
        const data = {
          shapes: boardData.shapes || [],
          title: boardData.title || "Untitled",
          type: boardData.type || "default",

          uid: boardData.uid,
          id: board,
        };
        console.log("Board data:", data);
        dispatch(setWhiteboardData(data));
        console.log("Board selected:", board);
      } else {
        console.error(`No document found for board ID: ${board}`);
      }
    } catch (error) {
      console.error("Error getting document:", error);
    }
  };

  return (
    <div className={styles.container}>
      {boards.map((board: any) => {
        return (
          <div
            className={styles.boardContainer}
            key={board.id}
            onClick={() => handleClick(board.id, board.type)}
          >
            <img
              // ({id: string, url: string})[]
              src={
                boardImages.find((image: any) => image.id === board.id)?.url ||
                boardImage
              }
              className={styles.boardImage}
              alt={board.title}
            />
            <div className={styles.boardTitle}>{board.title}</div>
          </div>
        );
      })}
    </div>
  );
};

export default ViewBoardPreview;
