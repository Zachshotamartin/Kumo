import React, { useEffect } from "react";
import { useSelector, useDispatch } from "react-redux";
import styles from "./middleLayer.module.css";
import { getDatabase, ref, onValue } from "firebase/database";
import {
  getStorage,
  getDownloadURL,
  ref as storageRef,
} from "firebase/storage";
import ViewBoardPreview from "../viewBoardPreview/viewBoardPreview";
import { setBoards } from "../../features/boards/boards";
import { addBoardImage } from "../../features/boardImages/boardImages";
import defaultImage from "../../res/default.jpg";
import type { AppDispatch } from "../../store";
import { realtimeDb } from "../../config/firebase";
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
      const userRef = ref(realtimeDb, `users/${user.uid}`);

      const unsubscribe = onValue(userRef, (snapshot) => {
        if (snapshot.exists()) {
          const userData = snapshot.val();
          console.log("User data:", userData);
          dispatch(
            setBoards({
              privateBoards: userData.privateBoardsIds || [],
              publicBoards: userData.publicBoardsIds || [],
              sharedBoards: userData.sharedBoardsIds || [],
            })
          );
        } else {
          console.log("User data not found.");
        }
      });

      // Return cleanup function
      return () => unsubscribe();
    }
    return undefined;
  }, [dispatch, user?.isAuthenticated, user?.uid]);

  const getStorageImageById = async (id: string) => {
    const storage = getStorage();
    const imageRef = storageRef(storage, `boardPreviews/${id}.jpg`);
    try {
      return await getDownloadURL(imageRef);
    } catch (error) {
      console.warn(
        `Image not found for board ${id}, using default image.`,
        error
      );
      return defaultImage; // Replace with your default image path
    }
  };

  useEffect(() => {
    const boards = [...publicBoards, ...privateBoards, ...sharedBoards];
    const fetchImageUrls = async () => {
      for (const board of boards) {
        try {
          // Skip if the image is already in the Redux store
          if (boardImages.some((image: any) => image.id === board.id)) continue;

          // Fetch the image URL or use a default image
          const url = await getStorageImageById(board.id);

          // Dispatch the action to add the image URL to the store
          dispatch(addBoardImage({ id: board.id, url }));
        } catch (error) {
          console.error(`Failed to fetch image for board ${board.id}:`, error);
        }
      }
    };

    fetchImageUrls();
    return undefined;
  }, [publicBoards, privateBoards, sharedBoards, boardImages, dispatch]);

  return (
    <div className={styles.middleLayer}>
      {searchTerm === "" && (
        <>
          <div className={styles.boardRow}>
            <h5
              className={styles.title}
            >{`Public (${publicBoards?.length})`}</h5>
            <ViewBoardPreview boards={publicBoards} />
          </div>
          <div className={styles.boardRow}>
            <h5
              className={styles.title}
            >{`Private (${privateBoards?.length})`}</h5>
            <ViewBoardPreview boards={privateBoards} />
          </div>
          <div className={styles.boardRow}>
            <h5
              className={styles.title}
            >{`Shared (${sharedBoards?.length})`}</h5>
            <ViewBoardPreview boards={sharedBoards} />
          </div>
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
