import React from "react";
import styles from "./delete.module.css";

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
} from "../../features/whiteBoard/whiteBoardSlice";
import { useSelector, useDispatch } from "react-redux";
import { setDeleting } from "../../features/actions/actionsSlice";
import { AppDispatch } from "../../store";
const usersCollectionRef = collection(db, "users");
const boardCollectionRef = collection(db, "boards");

const Delete = () => {
  const board = useSelector((state: any) => state.whiteBoard);
  const dispatch = useDispatch();
  const appDispatch = useDispatch<AppDispatch>();

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const inputText = (e.target as HTMLFormElement).querySelector(
      "input"
    )!.value;
    if (inputText !== board.title) {
      alert("Incorrect title");
      return;
    }
    // delete doc from firebase
    const boardRef = doc(boardCollectionRef, board.id);
    deleteDoc(boardRef).then(() => {
      // deletes doc from redux
      appDispatch(setWhiteboardData({}));
    });

    if (board.type === "private") {
      const q = query(usersCollectionRef, where("uid", "==", board.uid));
      getDocs(q).then((querySnapshot) => {
        querySnapshot.forEach((doc) => {
          updateDoc(doc.ref, {
            privateBoardsIds: doc.data().privateBoardsIds.filter(
              (item: any) => item.id !== board.id
            ),
          });
        })
      });
    }
    if (board.type === "public") {
      // do something later
    }

    if (board.type === "shared") {
      // do later
    }

    dispatch(setDeleting(false));

    // also remove from users listed boards
  };

  return (
    <div className={styles.deleteContainer}>
      <form className={styles.deleteForm} onSubmit={handleSubmit}>
        <label className={styles.deleteLabel}>
          Deletion is permanent. You will not be able to recover this board
          after deletion. Please enter the title as listed below to confirm
          deletion
        </label>
        <h4 className={styles.deleteTitle}>{board.title}</h4>
        <input className={styles.deleteInput} type="text" placeholder="" />
        <button className={styles.deleteButton} type="submit">
          Delete
        </button>
      </form>
      <button
        className={styles.closeButton}
        onClick={() => dispatch(setDeleting(false))}
      >
        Close
      </button>
    </div>
  );
};

export default Delete;
