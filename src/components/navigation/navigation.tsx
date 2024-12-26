import React from "react";
import styles from "./navigation.module.css";
import NavElement from "../navElement/navElement";
import { useSelector, useDispatch } from "react-redux";
import logo from "../../res/logo3.png";
import menu from "../../res/menu.png";
import userIcon from "../../res/user-circle.png";
import { auth } from "../../config/firebase";
import { useAuthState } from "react-firebase-hooks/auth";
import hide from "../../res/hide.png";
import { setHideSideBar } from "../../features/hide/hide";
import { logout } from "../../features/auth/authSlice";
import { AppDispatch } from "../../store";
import { setWhiteboardData } from "../../features/whiteBoard/whiteBoardSlice";
import {
  collection,
  CollectionReference,
  doc,
  DocumentData,
  getDocs,
  query,
  updateDoc,
  where,
} from "firebase/firestore";
import { db } from "../../config/firebase";
const usersCollectionRef = collection(db, "users");
const boardsCollectionRef = collection(db, "boards");

const Navigation = () => {
  const user = useSelector((state: any) => state.auth.user);
  const Username = user?.email;
  const dispatch = useDispatch();
  const appDispatch = useDispatch<AppDispatch>();
  const hidden = useSelector((state: any) => state.sideBar.hideSideBar);
  const whiteboard = useSelector((state: any) => state.whiteBoard);

  const handleHide = () => {
    dispatch(setHideSideBar(!hidden));
  };
  const handleHome = () => {
    const data = {
      shapes: [],
      title: null,
      type: null,
      uid: user?.uid,
      id: null,
    };
    appDispatch(setWhiteboardData(data));
  };

  const handleMakePublic = async () => {
    const boardRef = doc(boardsCollectionRef, whiteboard.id);
    await updateDoc(boardRef, {
      ...whiteboard,
      type: "public",
    });
    const q = query(usersCollectionRef, where("uid", "==", whiteboard.uid));
    const querySnapshot = await getDocs(q);
    if (!querySnapshot.empty) {
      const userDoc = querySnapshot.docs[0];
      const userData = userDoc.data();
      await updateDoc(userDoc.ref, {
        publicBoardsIds: [
          ...userData.publicBoardsIds,
          {
            id: whiteboard.id,
            title: whiteboard.title,
            uid: whiteboard.uid,
            type: "public",
          },
        ],
      });
      await updateDoc(userDoc.ref, {
        privateBoardsIds: userData.privateBoardsIds.filter(
          (board: any) => board.id !== whiteboard.id
        ),
      });
    }
  };

  return (
    <div className={styles.navigation}>
      <NavElement image={logo} text="Kumo" />
      <NavElement image={userIcon} text={Username || "User"} />
      <NavElement image={menu} text="Settings" />
      <button
        className={styles.hide}
        onClick={() => {
          const data = {
            shapes: [],
            title: "",
            type: null,
            selectedShape: null,
            uid: auth.currentUser?.uid,
            id: null,
          };

          console.log("Board data:", data);
          appDispatch(setWhiteboardData(data));
          auth.signOut();
          dispatch(logout());
          console.log(auth?.currentUser?.email);
          console.log(user);
        }}
      >
        Logout
      </button>
      <button className={styles.hide} onClick={handleHide}>
        Hide
      </button>
      <button className={styles.hide} onClick={handleHome}>
        Home
      </button>
      <button className={styles.hide} onClick={handleMakePublic}>
        Make Public
      </button>
    </div>
  );
};

export default Navigation;
