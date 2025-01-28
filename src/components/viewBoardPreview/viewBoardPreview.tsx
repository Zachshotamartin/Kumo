import styles from "./viewBoardPreview.module.css";
import { setWhiteboardData } from "../../features/whiteBoard/whiteBoardSlice";
import {
  ref,
  onValue,
  push,
  update,
  get,
  query,
  orderByChild,
  equalTo,
} from "firebase/database";
import { realtimeDb } from "../../config/firebase";
import { AppDispatch } from "../../store";
import { useDispatch, useSelector } from "react-redux";
import defaultImage from "../../res/default.jpg";

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

    // const mousePosition = (e: React.MouseEvent<HTMLDivElement>) => {
    //   const target = e.target as HTMLDivElement;
    //   const boundingRect = target.getBoundingClientRect();
    //   const x = e.clientX - boundingRect.left;
    //   const y = e.clientY - boundingRect.top;
    //   return { x, y };
    // };
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
            backGroundColor: boardData.backGroundColor || "#ffffff",
            currentUsers: [
              ...(boardData?.currentUsers || []),
              { user: user?.uid, cursorX: 0, cursorY: 0 },
            ],
          };
          console.log(data);
          dispatch(setWhiteboardData(data));
          console.log("Board selected:", data);
        } else {
          console.error(`No board found with ID: ${board}`);
        }
      });
    } catch (error) {
      console.error("Error fetching board data:", error);
    }
  };

  const handleClickSearch = async (board: string, type: string) => {
    if (!board) {
      console.error("Invalid board ID");
      return;
    }

    const boardRef = ref(realtimeDb, `boards/${board}`);
    try {
      const boardSnapshot = await get(boardRef);
      if (boardSnapshot.exists()) {
        const boardData = boardSnapshot.val();

        const data = {
          shapes: boardData.shapes || [],
          title: boardData.title || "Untitled",
          type: boardData.type,
          uid: boardData.uid,
          id: board,
          sharedWith: boardData.sharedWith,
          backGroundColor: boardData.backGroundColor || "#ffffff",
        };

        // Create a copy of the board and add it to the user's private boards
        const newBoardRef = push(ref(realtimeDb, "boards"));
        const newBoardKey = newBoardRef.key;

        if (!newBoardKey) {
          console.error("Failed to generate a new board key.");
          return;
        }

        const newBoardData = {
          ...data,
          id: newBoardKey,
          type: "private",
        };

        await update(newBoardRef, newBoardData);

        // Update the user's privateBoardsIds in the database
        const userRef = ref(realtimeDb, `users/${user?.uid}`);
        const userSnapshot = await get(userRef);

        if (userSnapshot.exists()) {
          const userData = userSnapshot.val();
          const updatedBoards = [
            ...(userData.privateBoardsIds || []),
            {
              id: newBoardKey,
              title: newBoardData.title,
              uid: newBoardData.uid,
              type: "private",
            },
          ];

          await update(userRef, {
            privateBoardsIds: updatedBoards,
          });

          console.log("Board copy created and added to private boards.");
          alert("A copy of this board has been added to private boards.");
        }

        dispatch(setWhiteboardData(newBoardData));
        console.log("Board selected:", newBoardData);
      } else {
        console.error(`No board found with ID: ${board}`);
      }
    } catch (error) {
      console.error("Error fetching and duplicating board data:", error);
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
                defaultImage
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
