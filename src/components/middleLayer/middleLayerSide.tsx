import React, { useEffect, useState } from "react";
import { useSelector } from "react-redux";
import { useDispatch } from "react-redux";
import styles from "./middleLayerSide.module.css";
// import { DragDropContext, Droppable, Draggable } from "react-beautiful-dnd";
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
import { addBoardImage } from "../../features/boardImages/boardImages";
import type { AppDispatch } from "../../store";
import plus from "../../res/plus.png";
import right from "../../res/right.png";
import down from "../../res/down.png";
import { clearSelectedShapes } from "../../features/selected/selectedSlice";
import { getDownloadURL, ref } from "firebase/storage";
import { storage } from "../../config/firebase";
const usersCollectionRef = collection(db, "users");
const boardsCollectionRef = collection(db, "boards");
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
  const boardImages = useSelector(
    (state: any) => state.boardImages.boardImages
  );

  useEffect(() => {
    if (user?.isAuthenticated) {
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
  }, [dispatch, user?.isAuthenticated, user?.uid]);

  const createBoard = async (type: "private" | "public" | "shared") => {
    try {
      const data = {
        uid: user?.uid,
        title: "New Board",
        shapes: [],
        type: type,
        sharedWith: [user.uid],
        backGroundColor: "#313131",
      };
      const doc = await addDoc(boardsCollectionRef, data);

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
              type: data.type,
            },
          ],
        });
        console.log("Board created successfully");
      }
    } catch (error) {
      console.error("Error creating board:", error);
    }
  };
  const getStorageImageById = async (id: string) => {
    const storageRef = ref(storage, `boardPreviews/${id}.jpg`);
    return await getDownloadURL(storageRef);
  };

  useEffect(() => {
    const boards = [...publicBoards, ...privateBoards, ...sharedBoards];
    const fetchImageUrls = async () => {
      for (const board of boards) {
        try {
          if (boardImages.some((image: any) => image.id === board.id)) {
            // look at this please
            throw new Error("Image already exists");
          }
          const url = await getStorageImageById(board.id);
          dispatch(addBoardImage({ id: board.id, url: url }));
        } catch (error) {
          console.error(`Failed to fetch image for board ${board.id}:`, error);
        }
      }
    };

    fetchImageUrls();
  }, [publicBoards, privateBoards, sharedBoards, boardImages, dispatch]);

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
          sharedWith: boardData.sharedWith,
          backGroundColor: boardData.backGroundColor || "#313131",
        };
        console.log("Board data:", data);
        dispatch(clearSelectedShapes());
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
            createBoard("private");
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
        <h5 className={styles.title}>{`Public (${publicBoards.length})`}</h5>
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
        <h5 className={styles.title}>{`Private (${privateBoards.length})`}</h5>
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
        <h5 className={styles.title}>{`Shared (${sharedBoards.length})`}</h5>
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

export default MiddleLayerSide;
