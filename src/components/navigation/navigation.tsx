import React, { useState } from "react";
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
  doc,
  getDocs,
  query,
  updateDoc,
  where,
} from "firebase/firestore";
import Share from "../share/share";
import { db } from "../../config/firebase";
import {
  setSharing,
  setDeleting,
  setGrid,
  setSettingsOpen,
  setUserOpen,
} from "../../features/actions/actionsSlice";
import { clearSelectedShapes } from "../../features/selected/selectedSlice";

const usersCollectionRef = collection(db, "users");
const boardsCollectionRef = collection(db, "boards");

const Navigation = () => {
  const user = useSelector((state: any) => state.auth);
  const grid = useSelector((state: any) => state.actions.grid);

  const dispatch = useDispatch();
  const appDispatch = useDispatch<AppDispatch>();
  const hidden = useSelector((state: any) => state.sideBar.hideSideBar);
  const whiteboard = useSelector((state: any) => state.whiteBoard);
  const userOpen = useSelector((state: any) => state.actions.userOpen);
  const settingsOpen = useSelector((state: any) => state.actions.settingsOpen);
  const width = useSelector((state: any) => state.window.sideBarWidth);
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
    dispatch(clearSelectedShapes());
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

  const handleClickSettings = () => {
    dispatch(setSettingsOpen(!settingsOpen));
    dispatch(setUserOpen(false));
  };
  const handleClickUser = () => {
    dispatch(setUserOpen(!userOpen));
    dispatch(setSettingsOpen(false));
  };

  return (
    <div className={hidden ? styles.hiddenNavigation : styles.navigation}>
      <NavElement image={logo} text="Kumo" handleClick={() => {}} />

      <NavElement
        image={userIcon}
        text={user?.email || "User"}
        handleClick={handleClickUser}
      />
      {userOpen && (
        <div className={styles.dropdown} style={{ left: `${width + 2}%` }}>
          {whiteboard.id !== null && (
            <button className={styles.hide} onClick={handleHome}>
              Home
            </button>
          )}
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

              dispatch(clearSelectedShapes());
              appDispatch(setWhiteboardData(data));
              auth.signOut();
              dispatch(logout());
            }}
          >
            Logout
          </button>
        </div>
      )}
      <NavElement
        image={menu}
        text="Settings"
        handleClick={handleClickSettings}
      />
      {settingsOpen && (
        <div className={styles.dropdown} style={{ left: `${width + 2}%` }}>
          {whiteboard.id !== null && (
            <button className={styles.hide} onClick={handleHide}>
              Hide Sidebar
            </button>
          )}

          {whiteboard.id !== null && (
            <button className={styles.hide} onClick={handleMakePublic}>
              Make Public
            </button>
          )}
          {whiteboard.id !== null && (
            <button
              className={styles.hide}
              onClick={() => dispatch(setSharing(true))}
            >
              Share Board
            </button>
          )}
          {whiteboard.id !== null && (
            <button
              className={styles.hide}
              onClick={() => dispatch(setDeleting(true))}
            >
              Delete Board
            </button>
          )}
          {whiteboard.id !== null && (
            <button
              className={styles.hide}
              onClick={() => dispatch(setGrid(!grid))}
            >
              Toggle Grid
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export default Navigation;
