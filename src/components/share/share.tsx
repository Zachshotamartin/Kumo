import React from "react";
import styles from "./share.module.css";

import {
  collection,
  query,
  where,
  getDocs,
  updateDoc,
  doc,
} from "firebase/firestore";
import { db } from "../../config/firebase";
import {
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
      backGroundColor: board.backGroundColor || "#ffffff",
    };

    const email = (e.target as HTMLFormElement).querySelector("input")!.value;

    const emailQuery = query(usersCollectionRef, where("email", "==", email));

    getDocs(emailQuery).then((querySnapshot) => {
      if (querySnapshot.empty) {
        alert("No matching users found.");
        return;
      }

      if (board.sharedWith.includes(email)) {
        alert("This board is already shared with this email");
        return;
      }

      const userDoc = querySnapshot.docs[0];
      const userData = userDoc.data();
      const uid = userData.uid;
      if (uid === board.uid) {
        alert("You cannot share this board with yourself");
        return;
      }
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
      // updates user document
      const uidQuery = query(usersCollectionRef, where("uid", "==", board.uid));
      getDocs(uidQuery).then((querySnapshot) => {
        if (querySnapshot.empty) {
          console.log("No matching documents.");
          return;
        }
        const userDoc = querySnapshot.docs[0];
        const userData = userDoc.data();
        if (!userData.sharedBoardsIds.includes(board.Id)) {
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
        }
      });
      alert("Board shared to " + email + " successfully!");
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
        <div className={styles.buttonContainer}>
          <button
            className={styles.closeButton}
            onClick={() => dispatch(setSharing(false))}
          >
            Close
          </button>
          <button className={styles.shareButton} type="submit">
            Share
          </button>
        </div>
      </form>
    </div>
  );
};

export default Share;
