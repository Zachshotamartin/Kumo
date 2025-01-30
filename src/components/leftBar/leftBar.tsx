import React from "react";
import styles from "./leftBar.module.css";
import plus from "../../res/plus.png";
import {
  addDoc,
  collection,
  getDocs,
  query,
  updateDoc,
  where,
} from "firebase/firestore";
import { useSelector } from "react-redux";
import Navigation from "../navigation/navigation";
import MiddleLayerSide from "../middleLayer/middleLayerSide";
import { db, realtimeDb } from "../../config/firebase";
import { getDatabase, ref, push, update, get } from "firebase/database";

const LeftBar = () => {
  const user = localStorage.getItem("user");
  const usersCollectionRef = collection(db, "users");
  const boardsCollectionRef = collection(db, "boards");
  const userState = useSelector((state: any) => state.auth);
  const [boardName, setBoardName] = React.useState("");

  const handleBoardName = (e: React.ChangeEvent<HTMLInputElement>) => {
    setBoardName(e.target.value);
  };

  const createBoard = async (type: "private" | "public" | "shared") => {
    try {
      const db = getDatabase();
      if (userState.uid) {
        // Create a new board object
        const boardData = {
          uid: userState?.uid,
          title: boardName || "Untitled",
          shapes: [],
          type: type,
          sharedWith: [userState.uid],
          backGroundColor: "#313131",
          lastChangedBy: user,
          currentUsers: [],
        };

        // Reference to the boards collection in the database
        const boardsRef = ref(db, "boards");

        // Push the board data to generate a new unique board ID
        const newBoardRef = push(boardsRef);
        const newBoardKey = newBoardRef.key;

        // Add the generated board ID to the board data
        const boardDataWithId = {
          ...boardData,
          id: newBoardKey,
        };

        // Write the board data to the database
        await update(newBoardRef, boardDataWithId);
       

        // Update the user's board list
        const userRef = ref(db, `users/${userState?.uid}`);
        const userSnapshot = await get(userRef);
        if (userSnapshot.exists()) {
          const userData = userSnapshot.val();

          // Add the new board to the user's board list
          const updatedBoards = [
            ...(userData[`${type}BoardsIds`] || []),
            {
              id: newBoardKey,
              title: boardData.title,
              uid: userState?.uid,
              type: boardData.type,
            },
          ];

          // Update the user's board list in the database
          await update(userRef, {
            [`${type}BoardsIds`]: updatedBoards,
          });

          console.log("Board added to user's list successfully");
        }
      }
    } catch (error) {
      console.error("Error creating board:", error);
    }
  };

  return (
    <div className={styles.leftBar}>
      <Navigation />
      <div className={styles.createBoardContainer}>
        <h6 className={styles.title}> Create New Board</h6>
        <div className={styles.buttonContainer}>
          <input
            className={styles.input}
            type="text"
            placeholder="Board Name"
            value={boardName}
            onChange={handleBoardName}
          />

          <button
            className={styles.createButton}
            onClick={() => {
              createBoard("private");
            }}
          >
            <img className={styles.icon} src={plus} alt="Plus" />
          </button>
        </div>
      </div>
      <MiddleLayerSide />
    </div>
  );
};

export default LeftBar;
