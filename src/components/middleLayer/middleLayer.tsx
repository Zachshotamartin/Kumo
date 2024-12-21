import React, { useEffect, useState } from "react";
import styles from "./middleLayer.module.css";
import { db } from "../../config/firebase";
import {
  addDoc,
  collection,
  doc,
  getDocs,
  onSnapshot,
  query,
  where,
  updateDoc,
  getDoc,
} from "firebase/firestore";
import { setWhiteboardData } from "../../features/whiteBoard/whiteBoardSlice";

import { useSelector } from "react-redux";
import { useDispatch } from "react-redux";
import type { AppDispatch } from "../../store";
import { setBoards, addBoard } from "../../features/boards/boards";
import { add } from "lodash";

const usersCollectionRef = collection(db, "users");
const boardsCollectionRef = collection(db, "boards");
const MiddleLayer = () => {
  const boardState = useSelector((state: any) => state.whiteBoard.board);
  const availableBoards = useSelector((state: any) => state.boards);
  const user = useSelector((state: any) => state.auth.user);

  const dispatch = useDispatch<AppDispatch>();

  useEffect(() => {
    if (user?.uid) {
      const q = query(usersCollectionRef, where("uid", "==", user?.uid));
      const unsubscribe = onSnapshot(q, (querySnapshot) => {
        if (!querySnapshot.empty) {
          const userDoc = querySnapshot.docs[0];
          const userData = userDoc.data();
          dispatch(
            setBoards({
              privateBoards: userData.privateBoardsIds || [],
              publicBoards: userData.publicBoardsIds || [],
              sharedBoards: userData.sharedBoardsIds || [],
            })
          );
        }
      });
      return () => unsubscribe();
    }
  }, [dispatch, user?.uid]);

  const createBoard = async (type: "private" | "public" | "shared") => {
    try {
      const data = {
        uid: user?.uid,
        title: "New Board",
        shapes: [],
        type: type,
        selectedShape: null,
      };
      const doc = await addDoc(boardsCollectionRef, data);
      console.log("Document written with ID: ", doc.id);
      const q = query(usersCollectionRef, where("uid", "==", user?.uid));
      const querySnapshot = await getDocs(q);
      if (!querySnapshot.empty) {
        const userDoc = querySnapshot.docs[0];
        const userData = userDoc.data();
        await updateDoc(userDoc.ref, {
          [`${type}BoardsIds`]: [
            ...userData[`${type}BoardsIds`],
            {
              id: doc.id,
              title: data.title,
              uid: user?.uid,
            },
          ],
        });
        // doc.id

        console.log("Board created successfully");
      }
    } catch (error) {
      console.error("Error creating board:", error);
    }
  };

  const handleClick = async (board: string, type: string) => {
    // Ensure `db` and `board` are valid
    if (!board) {
      console.error("Invalid board ID");
      return;
    }

    const docRef = doc(db, "boards", board);

    try {
      // Fetch document snapshot
      const docSnap = await getDoc(docRef);

      if (docSnap.exists()) {
        const boardData = docSnap.data();

        const data = {
          shapes: boardData.shapes || [],
          title: boardData.title || "Untitled",
          type: boardData.type || "default",
          selectedShape: null,
          uid: boardData.uid,
          id: board,
        };

        console.log("Board data:", data);

        // Dispatch to state management
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
    <div className={styles.middleLayer}>
      <h2>Public Boards</h2>
      <div className={styles.boardsContainer}>
        <button
          onClick={() => {
            createBoard("public");
          }}
        >
          {" "}
          Create Public Board{" "}
        </button>
        {availableBoards?.publicBoards?.map((board: any, index: number) => (
          <div key={index} className={styles.board}>
            <button onClick={() => handleClick(board.id, "public")}>
              {board.id}
            </button>
          </div>
        ))}
      </div>
      <h2>Private Boards</h2>
      <div className={styles.boardsContainer}>
        <button
          onClick={() => {
            createBoard("private");
          }}
        >
          {" "}
          Create Private Board{" "}
        </button>
        {availableBoards?.privateBoards?.map((board: any, index: number) => (
          <div key={index} className={styles.board}>
            <button onClick={() => handleClick(board.id, "private")}>
              {board.id}
            </button>
          </div>
        ))}
      </div>
      <h2>Shared Boards</h2>
      <div className={styles.boardsContainer}>
        <button
          onClick={() => {
            createBoard("shared");
          }}
        >
          {" "}
          Create Shared Board{" "}
        </button>
        {availableBoards?.sharedBoards?.map((board: any, index: number) => (
          <div key={index} className={styles.board}>
            <button onClick={() => handleClick(board.id, "shared")}>
              {board.id}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};

export default MiddleLayer;
