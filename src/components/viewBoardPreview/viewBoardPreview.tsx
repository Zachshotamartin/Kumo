import React, { useEffect, useState } from "react";
import styles from "./viewBoardPreview.module.css";
import boardImage from "../../res/recursive.png";
import { setWhiteboardData } from "../../features/whiteBoard/whiteBoardSlice";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../../config/firebase";
import { AppDispatch } from "../../store";
import { useDispatch } from "react-redux";

import { ref, getDownloadURL } from "firebase/storage";
import { storage } from "../../config/firebase";

const ViewBoardPreview = (props: { boards: any }) => {
  const boards = props.boards;
  const dispatch = useDispatch<AppDispatch>();

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

  const [imageUrls, setImageUrls] = useState<{ [key: string]: string }>({});

  const getStorageImageById = async (id: string) => {
    const storageRef = ref(storage, `boardPreviews/${id}.jpg`);
    console.log(id);
    console.log(storageRef);
    return await getDownloadURL(storageRef);
  };

  useEffect(() => {
    const fetchImageUrls = async () => {
      const urls: { [key: string]: string } = {};
      for (const board of boards) {
        try {
          const url = await getStorageImageById(board.id);
          urls[board.id] = url;
        } catch (error) {
          console.error(`Failed to fetch image for board ${board.id}:`, error);
        }
      }
      setImageUrls(urls);
    };

    fetchImageUrls();
  }, [boards]);

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
              src={imageUrls[board.id] || boardImage}
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
