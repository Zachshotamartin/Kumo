import { ref, runTransaction, get } from "firebase/database";
import _ from "lodash";
import { realtimeDb } from "../config/firebase";
import { update } from "firebase/database";

const updateBoard = async (newBoard: any) => {
  const user = localStorage.getItem("user");
  const boardRef = ref(realtimeDb, `boards/${newBoard.id}`);
  try {
    // Check if the board exists before running the transaction
    const snapshot = await get(boardRef);

    if (!snapshot.exists()) {
      console.error(
        `Board with ID ${newBoard.id} does not exist in the database.`
      );
      return;
    }

    const currentData = snapshot.val();

    let updatedData = { ...currentData };
    console.log("database values", updatedData);
    console.log("new values", newBoard);
    const equal = _.isEqual(updatedData.shapes || [], newBoard.shapes);
    if (equal) {
      console.log("equal");
      return;
    }
    const sortedShapes = newBoard.shapes;

    updatedData.lastChangedBy = user;
    await update(boardRef, {
      ...newBoard,
      shapes: sortedShapes,
      lastChangedBy: user,
    })
      .then(() => {
        console.log("Board successfully updated.");
      })
      .catch((error) => {
        console.error("Error updating board:", error);
      });
  } catch (error) {
    console.error("Error updating board:", error);
  }
};

// Optional: Throttling updates to prevent excessive writes
const throttledUpdateBoard = _.throttle(updateBoard, 100, { trailing: true });

export const handleBoardChange = async (newBoard: any) => {
  console.log("trying");
  await throttledUpdateBoard(newBoard);
};
