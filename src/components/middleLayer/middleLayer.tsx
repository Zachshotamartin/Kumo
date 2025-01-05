import React, { useEffect, useState } from "react";
import { useSelector } from "react-redux";
import { useDispatch } from "react-redux";
import styles from "./middleLayer.module.css";
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
import ViewBoardPreview from "../viewBoardPreview/viewBoardPreview";
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
const MiddleLayer = () => {
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
  const whiteBoard = useSelector((state: any) => state.whiteBoard);
  console.log(user.uid, "uid");

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
      };
      const doc = await addDoc(boardsCollectionRef, data);
      console.log("Document written with ID: ", doc.id);
      const q = query(usersCollectionRef, where("uid", "==", user?.uid));
      const querySnapshot = await getDocs(q);
      if (!querySnapshot.empty) {
        const userDoc = querySnapshot.docs[0];
        const userData = userDoc.data();
        console.log("hello");
        console.log(user?.uid);
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
    console.log(id);
    console.log(storageRef);
    return await getDownloadURL(storageRef);
  };

  useEffect(() => {
    const boards = [...publicBoards, ...privateBoards, ...sharedBoards];
    const fetchImageUrls = async () => {
      for (const board of boards) {
        try {
          if (boardImages.some((image: any) => image.id === board.id)) {
            // look at this please
            continue;
          }
          console.log("getting image", board.title);
          const url = await getStorageImageById(board.id);
          dispatch(addBoardImage({ id: board.id, url: url }));
        } catch (error) {
          console.error(`Failed to fetch image for board ${board.id}:`, error);
        }
      }
    };

    fetchImageUrls();
  }, [publicBoards, privateBoards, sharedBoards, boardImages, dispatch]);

  return (
    <div className={styles.middleLayer}>
      <h5 className={styles.title}>{`Public (${publicBoards?.length})`}</h5>

      <ViewBoardPreview boards={publicBoards} />

      <h5 className={styles.title}>{`Private (${privateBoards?.length})`}</h5>

      <ViewBoardPreview boards={privateBoards} />

      <h5 className={styles.title}>{`Shared (${sharedBoards?.length})`}</h5>

      <ViewBoardPreview boards={sharedBoards} />
    </div>
  );
};

export default MiddleLayer;
