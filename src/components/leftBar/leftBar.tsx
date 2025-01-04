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
import { db } from "../../config/firebase";
const LeftBar = () => {
  const usersCollectionRef = collection(db, "users");
  const boardsCollectionRef = collection(db, "boards");
  const user = useSelector((state: any) => state.auth);
  const [boardName, setBoardName] = React.useState("");

  const handleBoardName = (e: React.ChangeEvent<HTMLInputElement>) => {
    setBoardName(e.target.value);
  };

  const createBoard = async (type: "private" | "public" | "shared") => {
    try {
      if (user.uid) {
        const data = {
          uid: user?.uid,
          title: boardName || "Untitled",
          shapes: [],
          type: type,
          sharedWith: [user.uid],
        };

        const doc = await addDoc(boardsCollectionRef, data);
        console.log("data");
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
      }
    } catch (error) {
      console.error("Error creating board:", error);
    }
  };

  return (
    <div className={styles.leftBar}>
      <Navigation />
      <div className={styles.createBoardContainer}>
        <h4 className={styles.title}> Create New Board</h4>
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
  );
};

export default LeftBar;
