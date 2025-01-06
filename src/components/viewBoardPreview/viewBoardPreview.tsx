import styles from "./viewBoardPreview.module.css";
import boardImage from "../../res/recursive.png";
import { setWhiteboardData } from "../../features/whiteBoard/whiteBoardSlice";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  updateDoc,
  where,
} from "firebase/firestore";
import { db } from "../../config/firebase";
import { AppDispatch } from "../../store";
import { useDispatch, useSelector } from "react-redux";

const ViewBoardPreview = (props: { boards: any }) => {
  const boards = props.boards;
  const dispatch = useDispatch<AppDispatch>();
  const boardImages = useSelector(
    (state: any) => state.boardImages.boardImages
  );
  const user = useSelector((state: any) => state.auth);

  const searchTerm = useSelector((state: any) => state.actions.searchTerm);

  const handleClick = async (board: string, type: string) => {
    if (!board) {
      console.error("Invalid board ID");
      return;
    }
    console.log("click 1");
    const docRef = doc(db, "boards", board);
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
          backGroundColor: boardData.backGroundColor || "#ffffff",
        };
        console.log("Board data:", data);
        dispatch(setWhiteboardData(data));
        console.log("Board selected:", board);
      } else {
        console.error(`No document found for board ID: ${board}`);
      }
    } catch (error) {
      console.error("Error getting document:", error);
    }
  };

  const handleClickSearch = async (board: string, type: string) => {
    if (!board) {
      console.error("Invalid board ID");
      return;
    }

    console.log("trying");
    const docRef = doc(db, "boards", board);
    try {
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        const boardData = docSnap.data();
        const data = {
          shapes: boardData.shapes || [],
          title: boardData.title || "Untitled",
          type: boardData.type,

          uid: boardData.uid,
          id: board,
          sharedWith: boardData.sharedWith,
          backGroundColor: boardData.backGroundColor || "#ffffff",
        };
        const boardsCollectionRef = collection(db, "boards");
        const doc = await addDoc(boardsCollectionRef, data);

        const dataWithId = {
          ...data,
          id: doc.id,
          type: "private",
        };
        await updateDoc(doc, dataWithId);

        const usersCollectionRef = collection(db, "users");
        const q = query(usersCollectionRef, where("uid", "==", user?.uid));
        console.log(q);
        const querySnapshot = await getDocs(q);
        if (!querySnapshot.empty) {
          const userDoc = querySnapshot.docs[0];
          const userData = userDoc.data();
          await updateDoc(userDoc.ref, {
            [`privateBoardsIds`]: [
              ...userData[`privateBoardsIds`],
              {
                id: doc.id,
                title: data.title,
                uid: data.uid,
                type: "private",
              },
            ],
          });
          console.log("Board created successfully");
          alert("A copy of this board has been added to private boards");
        }
        console.log("Board data:", data);
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
    <div className={searchTerm ? styles.searchContainer : styles.container}>
      {boards?.map((board: any) => {
        return (
          <div
            className={styles.boardContainer}
            key={board.id}
            onClick={() =>
              searchTerm === ""
                ? handleClick(board.id, board.type)
                : handleClickSearch(board.id, board.type)
            }
          >
            <img
              src={
                boardImages.find((image: any) => image.id === board.id)?.url ||
                boardImage
              }
              className={styles.boardImage}
              alt={board.title}
            />
            <div className={styles.boardTitle}>{board.title}</div>
          </div>
        );
      })}
    </div>
  );
};

export default ViewBoardPreview;
