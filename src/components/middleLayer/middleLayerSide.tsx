import React, { useEffect, useState } from "react";
import { useSelector, useDispatch } from "react-redux";
import styles from "./middleLayerSide.module.css";
import { ref, onValue, push, update, get } from "firebase/database";
import { setWhiteboardData } from "../../features/whiteBoard/whiteBoardSlice";
import { setBoards } from "../../features/boards/boards";
import { clearSelectedShapes } from "../../features/selected/selectedSlice";
import type { AppDispatch } from "../../store";
import plus from "../../res/plus.png";
import right from "../../res/right.png";
import down from "../../res/down.png";
import { realtimeDb } from "../../config/firebase";

const MiddleLayerSide = () => {
  const availableBoards = useSelector((state: any) => state.boards);
  const user = useSelector((state: any) => state.auth);
  const dispatch = useDispatch<AppDispatch>();

  const [publicDropDown, setPublicDropDown] = useState(false);
  const [privateDropDown, setPrivateDropDown] = useState(false);
  const [sharedDropDown, setSharedDropDown] = useState(false);

  const publicBoards = availableBoards.publicBoards;
  const privateBoards = availableBoards.privateBoards;
  const sharedBoards = availableBoards.sharedBoards;

  // Fetch boards from realtimeDb
  useEffect(() => {
    if (user?.isAuthenticated && user?.uid) {
      const userRef = ref(realtimeDb, `users/${user.uid}`);

      const unsubscribe = onValue(userRef, (snapshot) => {
        if (snapshot.exists()) {
          const userData = snapshot.val();
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
    return undefined;
  }, [dispatch, user?.isAuthenticated, user?.uid]);

  // Create a new board
  const createBoard = async (type: "private" | "public" | "shared") => {
    try {
      if (!user?.uid) throw new Error("User not authenticated!");

      const boardData = {
        uid: user.uid,
        title: "New Board",
        shapes: [],
        type: type,
        sharedWith: [user.uid],
        backGroundColor: "#313131",
        lastChangedBy: user.uid,
      };

      // Push the board to the database
      const boardsRef = ref(realtimeDb, "boards");
      const newBoardRef = push(boardsRef);
      const newBoardKey = newBoardRef.key;

      if (!newBoardKey) throw new Error("Failed to generate board key.");

      const boardDataWithId = {
        ...boardData,
        id: newBoardKey,
      };

      await update(newBoardRef, boardDataWithId);

      // Add board to the user's list
      const userRef = ref(realtimeDb, `users/${user.uid}`);
      const userSnapshot = await get(userRef);

      if (userSnapshot.exists()) {
        const userData = userSnapshot.val();

        const updatedBoards = [
          ...(userData[`${type}BoardsIds`] || []),
          {
            id: newBoardKey,
            title: boardData.title,
            uid: user.uid,
            type: type,
          },
        ];

        await update(userRef, {
          [`${type}BoardsIds`]: updatedBoards,
        });

        console.log("Board created and added to user's list successfully.");
      }
    } catch (error) {
      console.error("Error creating board:", error);
    }
  };

  const handleClick = async (board: string) => {
    if (!board) {
      console.error("Invalid board ID");
      return;
    }
    const boardRef = ref(realtimeDb, `boards/${board}`);
    try {
      onValue(boardRef, (snapshot) => {
        if (snapshot.exists()) {
          const boardData = snapshot.val();
          const data = {
            shapes: boardData.shapes || [],
            title: boardData.title || "Untitled",
            type: boardData.type || "default",
            uid: boardData.uid,
            id: board,
            sharedWith: boardData.sharedWith,
            backGroundColor: boardData.backGroundColor || "#313131",
          };

          dispatch(clearSelectedShapes());
          dispatch(setWhiteboardData(data));
          console.log("Board selected:", data);
        } else {
          console.error(`No data found for board ID: ${board}`);
        }
      });
    } catch (error) {
      console.error("Error retrieving board:", error);
    }
  };

  return (
    <div className={styles.middleLayer}>
      <div className={styles.createBoardContainer}>
        <h6 className={styles.title}> Boards </h6>
        <button
          className={styles.createButton}
          onClick={() => createBoard("private")}
        >
          <img className={styles.icon} src={plus} alt="Plus" />
        </button>
      </div>

      {/* Public Boards */}
      <div
        className={styles.boardTypeContainer}
        onClick={() => setPublicDropDown(!publicDropDown)}
      >
        {publicDropDown ? (
          <img className={styles.icon} src={down} alt="Down" />
        ) : (
          <img className={styles.icon} src={right} alt="Right" />
        )}
        <h6 className={styles.title}>{`Public (${publicBoards.length})`}</h6>
      </div>
      {publicDropDown && (
        <div className={styles.boardListContainer}>
          {publicBoards.length === 0 ? (
            <div className={styles.emptyState}>
              <span className={styles.emptyMessage}>No public boards yet</span>
              <span className={styles.emptyHint}>
                Create one with the + button above
              </span>
            </div>
          ) : (
            publicBoards.map((board: any, index: number) => (
              <div key={index} className={styles.board}>
                <h6
                  className={styles.button}
                  onClick={() => handleClick(board.id)}
                >
                  {board.title}
                </h6>
              </div>
            ))
          )}
        </div>
      )}

      {/* Private Boards */}
      <div
        className={styles.boardTypeContainer}
        onClick={() => setPrivateDropDown(!privateDropDown)}
      >
        {privateDropDown ? (
          <img className={styles.icon} src={down} alt="Down" />
        ) : (
          <img className={styles.icon} src={right} alt="Right" />
        )}
        <h6 className={styles.title}>{`Private (${privateBoards.length})`}</h6>
      </div>
      {privateDropDown && (
        <div className={styles.boardListContainer}>
          {privateBoards.length === 0 ? (
            <div className={styles.emptyState}>
              <span className={styles.emptyMessage}>No private boards yet</span>
              <span className={styles.emptyHint}>
                Create one with the + button above
              </span>
            </div>
          ) : (
            privateBoards.map((board: any, index: number) => (
              <div key={index} className={styles.board}>
                <h6
                  className={styles.button}
                  onClick={() => handleClick(board.id)}
                >
                  {board.title}
                </h6>
              </div>
            ))
          )}
        </div>
      )}

      {/* Shared Boards */}
      <div
        className={styles.boardTypeContainer}
        onClick={() => setSharedDropDown(!sharedDropDown)}
      >
        {sharedDropDown ? (
          <img className={styles.icon} src={down} alt="Down" />
        ) : (
          <img className={styles.icon} src={right} alt="Right" />
        )}
        <h6 className={styles.title}>{`Shared (${sharedBoards.length})`}</h6>
      </div>
      {sharedDropDown && (
        <div className={styles.boardListContainer}>
          {sharedBoards.length === 0 ? (
            <div className={styles.emptyState}>
              <span className={styles.emptyMessage}>No shared boards yet</span>
              <span className={styles.emptyHint}>
                Boards shared with you will appear here
              </span>
            </div>
          ) : (
            sharedBoards.map((board: any, index: number) => (
              <div key={index} className={styles.board}>
                <h6
                  className={styles.button}
                  onClick={() => handleClick(board.id)}
                >
                  {board.title}
                </h6>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
};

export default MiddleLayerSide;
