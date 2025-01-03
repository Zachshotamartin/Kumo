import React from "react";
import styles from "./share.module.css";

import {
  collection,
  query,
  where,
  getDocs,
  updateDoc,
  doc,
  deleteDoc,
} from "firebase/firestore";
import { db } from "../../config/firebase";
import board, {
  setWhiteboardData,
  share,
} from "../../features/whiteBoard/whiteBoardSlice";
import { useSelector, useDispatch } from "react-redux";
import { setSharing } from "../../features/actions/actionsSlice";
import { AppDispatch } from "../../store";
const usersCollectionRef = collection(db, "users");
const boardCollectionRef = collection(db, "boards");

const Share = () => {
  const board = useSelector((state: any) => state.whiteBoard);
  const dispatch = useDispatch();
  const appDispatch = useDispatch<AppDispatch>();

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const boardId = board.id;
    const data = {
      shapes: board.shapes,
      title: board.title,
      type: "shared",
      uid: board.uid,
      id: board.id,
      sharedWith: board.sharedWith,
    };

    // sets current whiteboard to shared

    const email = (e.target as HTMLFormElement).querySelector("input")!.value;

    // sets board type to shared

    // updates added shared account

    const emailQuery = query(usersCollectionRef, where("email", "==", email));
    getDocs(emailQuery).then((querySnapshot) => {
      if (querySnapshot.empty) {
        console.log("No matching documents.");
        return;
      }

      const userDoc = querySnapshot.docs[0];
      const userData = userDoc.data();
      const uid = userData.uid;
      if (!board.sharedWith.includes(uid)) {
        data.sharedWith = [...board.sharedWith, uid];
      }

      appDispatch(share(userData.uid));
      updateDoc(userDoc.ref, {
        sharedBoardsIds: [
          ...userData.sharedBoardsIds,
          {
            id: board.id,
            title: board.title,
            uid: board.uid,
            type: "shared",
          },
        ],
      });
      appDispatch(setWhiteboardData(data));
      const boardRef = doc(boardCollectionRef, board.id);
      updateDoc(boardRef, {
        ...board,
        type: "shared",
      });
    });

    // updates user document
    const uidQuery = query(usersCollectionRef, where("uid", "==", board.uid));
    getDocs(uidQuery).then((querySnapshot) => {
      if (querySnapshot.empty) {
        console.log("No matching documents.");
        return;
      }
      const userDoc = querySnapshot.docs[0];
      const userData = userDoc.data();
      updateDoc(userDoc.ref, {
        privateBoardsIds: userData.privateBoardsIds.filter(
          (whiteboard: any) => whiteboard.id !== boardId
        ),
        publicBoardsIds: userData.publicBoardsIds.filter(
          (whiteboard: any) => whiteboard.id !== boardId
        ),
        sharedBoardsIds: [
          ...userData.sharedBoardsIds,
          {
            id: board.id,
            title: board.title,
            uid: board.uid,
            type: "shared",
          },
        ],
      });
      dispatch(setSharing(false));
    });
  };

  return (
    <div className={styles.shareContainer}>
      <form className={styles.shareForm} onSubmit={handleSubmit}>
        <input
          className={styles.shareInput}
          type="text"
          placeholder="Enter email"
        />
        <button className={styles.shareButton} type="submit">
          Share
        </button>
      </form>
      <button
        className={styles.closeButton}
        onClick={() => dispatch(setSharing(false))}
      >
        Close
      </button>
    </div>
  );
};

export default Share;
