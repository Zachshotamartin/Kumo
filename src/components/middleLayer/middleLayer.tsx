import React, { useEffect, useState } from "react";
import { useSelector } from "react-redux";
import { useDispatch } from "react-redux";

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
import { setBoards } from "../../features/boards/boards";
import type { AppDispatch } from "../../store";
import plus from "../../res/plus.png";
import right from "../../res/right.png";
import down from "../../res/down.png";

const usersCollectionRef = collection(db, "users");
const boardsCollectionRef = collection(db, "boards");
const MiddleLayer = () => {
  const availableBoards = useSelector((state: any) => state.boards);
  const user = useSelector((state: any) => state.auth.user);
  const dispatch = useDispatch<AppDispatch>();
  const [publicDropDown, setPublicDropDown] = useState(false);
  const [privateDropDown, setPrivateDropDown] = useState(false);
  const [sharedDropDown, setSharedDropDown] = useState(false);

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
        console.log("Board created successfully");
      }
    } catch (error) {
      console.error("Error creating board:", error);
    }
  };

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
          selectedShape: null,
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
    <div className={styles.middleLayer}>
      <div className={styles.createBoardContainer}>
        <h4 className={styles.title}> Boards </h4>
        <button
          className={styles.createButton}
          onClick={() => {
            createBoard("public");
          }}
        >
          <img className={styles.icon} src={plus} alt="Plus" />
        </button>
      </div>
      <div
        className={styles.boardTypeContainer}
        onClick={() => setPublicDropDown(!publicDropDown)}
      >
        {publicDropDown ? (
          <img className={styles.icon} src={down} alt="Down" />
        ) : (
          <img className={styles.icon} src={right} alt="Right" />
        )}
        <h5 className={styles.title}>Public</h5>
      </div>
      {publicDropDown && (
        <div className={styles.boardListContainer}>
          {availableBoards?.publicBoards?.map((board: any, index: number) => (
            <div key={index} className={styles.board}>
              <button
                className={styles.button}
                onClick={() => handleClick(board.id, "public")}
              >
                {board.title}
              </button>
            </div>
          ))}
        </div>
      )}
      <div
        className={styles.boardTypeContainer}
        onClick={() => setPrivateDropDown(!privateDropDown)}
      >
        {privateDropDown ? (
          <img className={styles.icon} src={down} alt="Down" />
        ) : (
          <img className={styles.icon} src={right} alt="Right" />
        )}
        <h5 className={styles.title}>Private</h5>
      </div>
      {privateDropDown && (
        <div className={styles.boardListContainer}>
          {availableBoards?.privateBoards?.map((board: any, index: number) => (
            <div key={index} className={styles.board}>
              <button
                className={styles.button}
                onClick={() => handleClick(board.id, "private")}
              >
                {board.title}
              </button>
            </div>
          ))}
        </div>
      )}
      <div
        className={styles.boardTypeContainer}
        onClick={() => setSharedDropDown(!sharedDropDown)}
      >
        {sharedDropDown ? (
          <img className={styles.icon} src={down} alt="Down" />
        ) : (
          <img className={styles.icon} src={right} alt="Right" />
        )}
        <h5 className={styles.title}>Shared Boards</h5>
      </div>
      {sharedDropDown && (
        <div className={styles.boardListContainer}>
          {availableBoards?.sharedBoards?.map((board: any, index: number) => (
            <div key={index} className={styles.board}>
              <button
                className={styles.button}
                onClick={() => handleClick(board.id, "shared")}
              >
                {board.title}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default MiddleLayer;