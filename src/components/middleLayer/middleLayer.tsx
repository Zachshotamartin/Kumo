import React, { useEffect, useState } from "react";
import { useSelector } from "react-redux";
import { useDispatch } from "react-redux";
import styles from "./middleLayer.module.css";
// import { DragDropContext, Droppable, Draggable } from "react-beautiful-dnd";
import { db } from "../../config/firebase";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import ViewBoardPreview from "../viewBoardPreview/viewBoardPreview";
import { setBoards, setSearchableBoards } from "../../features/boards/boards";
import { addBoardImage } from "../../features/boardImages/boardImages";
import type { AppDispatch } from "../../store";
import { getDownloadURL, ref } from "firebase/storage";
import { storage } from "../../config/firebase";
const usersCollectionRef = collection(db, "users");

const MiddleLayer = () => {
  const availableBoards = useSelector((state: any) => state.boards);
  const user = useSelector((state: any) => state.auth);
  const dispatch = useDispatch<AppDispatch>();
  const publicBoards = availableBoards.publicBoards;
  const privateBoards = availableBoards.privateBoards;
  const sharedBoards = availableBoards.sharedBoards;
  const resultsBoards = availableBoards.resultsBoards;
  const boardImages = useSelector(
    (state: any) => state.boardImages.boardImages
  );

  const searchTerm = useSelector((state: any) => state.actions.searchTerm);

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
      {searchTerm === "" && (
        <>
          <h5 className={styles.title}>{`Public (${publicBoards?.length})`}</h5>

          <ViewBoardPreview boards={publicBoards} />

          <h5
            className={styles.title}
          >{`Private (${privateBoards?.length})`}</h5>

          <ViewBoardPreview boards={privateBoards} />

          <h5 className={styles.title}>{`Shared (${sharedBoards?.length})`}</h5>

          <ViewBoardPreview boards={sharedBoards} />
        </>
      )}
      {searchTerm !== "" && (
        <>
          <h5 className={styles.title}>{`Search results`}</h5>
          <ViewBoardPreview boards={resultsBoards} />
        </>
      )}
    </div>
  );
};

export default MiddleLayer;
