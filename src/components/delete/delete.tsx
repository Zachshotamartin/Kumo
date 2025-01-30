import React, { useEffect } from "react";
import styles from "./delete.module.css";
import { ref, deleteObject } from "firebase/storage";
import { storage } from "../../config/firebase";
import {
  collection,
  query,
  where,
  getDocs,
  updateDoc,
  doc,
  deleteDoc,
} from "firebase/firestore";
import { db, realtimeDb } from "../../config/firebase";
import { setWhiteboardData } from "../../features/whiteBoard/whiteBoardSlice";
import { useSelector, useDispatch } from "react-redux";
import { setDeleting } from "../../features/actions/actionsSlice";
import { AppDispatch } from "../../store";
import { ref as dbRef, get, remove, update } from "firebase/database";

const usersCollectionRef = collection(db, "users");
const boardCollectionRef = collection(db, "boards");

const Delete = () => {
  const board = useSelector((state: any) => state.whiteBoard);
  const dispatch = useDispatch();
  const appDispatch = useDispatch<AppDispatch>();

  // Close form when Escape key is pressed
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault(); // Prevent default behavior for Escape key
        dispatch(setDeleting(false));
      }
    };

    window.addEventListener("keydown", handleEscape);

    return () => {
      window.removeEventListener("keydown", handleEscape);
    };
  }, [dispatch]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    const inputText = (e.target as HTMLFormElement).querySelector(
      "input"
    )!.value;
    if (inputText !== board.title) {
      alert("Incorrect title");
      return;
    }

    try {
      // 1. Delete from Realtime Database
      const boardRef = dbRef(realtimeDb, `boards/${board.id}`);
      await remove(boardRef); // Deleting board data

      // 2. Remove board from users' shared lists in Realtime Database
      const usersRef = dbRef(realtimeDb, "users");
      const snapshot = await get(usersRef);
      if (!snapshot.exists()) {
        console.error("No users found in Realtime Database");
        return;
      }

      const users = snapshot.val();
      for (const userId of board.sharedWith) {
        const userRef = dbRef(realtimeDb, `users/${userId}`);
        const userDataSnapshot = await get(userRef);

        if (userDataSnapshot.exists()) {
          const userData = userDataSnapshot.val();

          // Remove the board from the user's lists
          const updatedPublicBoardsIds =
            userData.publicBoardsIds?.filter(
              (whiteboard: any) => whiteboard.id !== board.id
            ) || [];

          const updatedPrivateBoardsIds =
            userData.privateBoardsIds?.filter(
              (whiteboard: any) => whiteboard.id !== board.id
            ) || [];

          const updatedSharedBoardsIds =
            userData.sharedBoardsIds?.filter(
              (whiteboard: any) => whiteboard.id !== board.id
            ) || [];

          // Update the user's data in Realtime Database
          await update(userRef, {
            publicBoardsIds: updatedPublicBoardsIds,
            privateBoardsIds: updatedPrivateBoardsIds,
            sharedBoardsIds: updatedSharedBoardsIds,
          });
        }
      }

      // 3. Delete the board's image from Firebase Storage
      const fileRef = ref(storage, `boardPreviews/${board.id}.jpg`);
      await deleteObject(fileRef)
        .then(() => {
          console.log("File deleted successfully");
        })
        .catch((error) => {
          console.error("Error deleting file:", error);
        });

      // 4. Reset Redux state
      appDispatch(setWhiteboardData({}));
      dispatch(setDeleting(false));
      alert("Board deleted successfully.");
    } catch (error) {
      console.error("Error deleting board:", error);
      alert("An error occurred while deleting the board.");
    }
  };

  return (
    <div className={styles.deleteContainer}>
      {/* Title and Description */}
      <h2 className={styles.deleteTitle}>Delete Board</h2>
      <p className={styles.deleteDescription}>
        Deleting this board is **permanent** and cannot be undone. Please
        confirm by entering the board title below.
      </p>

      <form className={styles.deleteForm} onSubmit={handleSubmit}>
        <label className={styles.deleteLabel}>
          Enter the board title to confirm deletion:
        </label>
        <h3 className={styles.confirmTitle}>{board.title}</h3>
        <input
          className={styles.deleteInput}
          type="text"
          placeholder={board.title}
        />
        <div className={styles.buttonContainer}>
          <button
            className={styles.closeButton}
            onClick={() => dispatch(setDeleting(false))}
            type="button"
          >
            Close
          </button>
          <button className={styles.deleteButton} type="submit">
            Delete
          </button>
        </div>
      </form>
    </div>
  );
};

export default Delete;
