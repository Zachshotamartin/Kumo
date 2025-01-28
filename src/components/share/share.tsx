import React, { useState } from "react";
import styles from "./share.module.css";

import { ref, get, set, update, push } from "firebase/database";
import { realtimeDb } from "../../config/firebase";
import { useSelector, useDispatch } from "react-redux";
import { setSharing } from "../../features/actions/actionsSlice";
import { AppDispatch } from "../../store";
import { handleBoardChange } from "../../helpers/handleBoardChange";

const Share = () => {
  const board = useSelector((state: any) => state.whiteBoard);
  const dispatch = useDispatch();
  const appDispatch = useDispatch<AppDispatch>();

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    const boardId = board.id;
    const email = (e.target as HTMLFormElement).querySelector("input")!.value;

    if (!boardId || !email) {
      alert("Board ID or email is missing.");
      return;
    }

    try {
      // Look up the user by email
      const usersRef = ref(realtimeDb, "users");
      const snapshot = await get(usersRef);
      if (!snapshot.exists()) {
        alert("No matching users found.");
        return;
      }

      const users = snapshot.val();
      const userEntry = Object.entries(users).find(
        ([_, user]: any) => user.email === email
      );

      if (!userEntry) {
        alert("No matching users found.");
        return;
      }

      const [userId, userData] = userEntry as [
        string,
        { sharedBoardsIds?: any[] }
      ];

      if (board.sharedWith.includes(email)) {
        alert("This board is already shared with this email.");
        return;
      }

      if (userId === board.uid) {
        alert("You cannot share this board with yourself.");
        return;
      }

      // Update the board's sharedWith list
      const updatedSharedWith = [...board.sharedWith, userId];
      const boardRef = ref(realtimeDb, `boards/${boardId}`);
      await update(boardRef, {
        ...board,
        type: "shared",
        sharedWith: updatedSharedWith,
      });

      // Update the user's sharedBoards
      const userBoardsRef = ref(realtimeDb, `users/${userId}`);

      const newSharedBoard = {
        id: boardId,
        title: board.title,
        uid: board.uid,
        type: "shared",
      };

      const updatedBoards = [
        ...(userData[`sharedBoardsIds`] || []),
        {
          id: boardId,
          title: board.title,
          uid: board.uid,
          type: "shared",
        },
      ];
      await update(userBoardsRef, {
        [`sharedBoardsIds`]: updatedBoards,
      });

      // Update the owner’s boards to reflect sharing status
      const ownerBoardsRef = ref(realtimeDb, `users/${board.uid}`);
      const ownerSnapshot = await get(ownerBoardsRef);
      if (ownerSnapshot.exists()) {
        const ownerData = ownerSnapshot.val();

        const updatedPrivateBoards = ownerData.privateBoardsIds
          ? ownerData.privateBoardsIds.filter(
              (privateBoard: any) => privateBoard.id !== boardId
            )
          : [];

        const updatedPublicBoards = ownerData.publicBoardsIds
          ? ownerData.publicBoardsIds.filter(
              (publicBoard: any) => publicBoard.id !== boardId
            )
          : [];

        const updatedSharedBoards = ownerData.sharedBoardsIds
          ? [...ownerData.sharedBoardsIds, newSharedBoard]
          : [newSharedBoard];

        await update(ownerBoardsRef, {
          privateBoardsIds: updatedPrivateBoards,
          publicBoardsIds: updatedPublicBoards,
          sharedBoardsIds: updatedSharedBoards,
        });
      }

      // Update the state
      handleBoardChange({
        ...board,
        type: "shared",
        sharedWith: updatedSharedWith,
      });

      alert("Board shared with " + email + " successfully!");
    } catch (error) {
      console.error("Error sharing board:", error);
      alert("An error occurred while sharing the board.");
    }
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
