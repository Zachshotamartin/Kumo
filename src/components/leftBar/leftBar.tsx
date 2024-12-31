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
import { db } from "../../config/firebase";
const LeftBar = () => {
  const usersCollectionRef = collection(db, "users");
  const boardsCollectionRef = collection(db, "boards");
  const user = useSelector((state: any) => state.auth);
  const createBoard = async (type: "private" | "public" | "shared") => {
    try {
      const data = {
        uid: user?.uid,
        title: "New Board",
        shapes: [],
        type: type,
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

  return (
    <div className={styles.createBoardContainer}>
      <h4 className={styles.title}> Create New Board</h4>
      <button
        className={styles.createButton}
        onClick={() => {
          createBoard("private");
        }}
      >
        <img className={styles.icon} src={plus} alt="Plus" />
      </button>
    </div>
  );
};

export default LeftBar;
