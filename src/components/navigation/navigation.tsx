import styles from "./navigation.module.css";
import NavElement from "../navElement/navElement";
import { useSelector, useDispatch } from "react-redux";
import logo from "../../res/logo3.png";
import menu from "../../res/menu.png";
import userIcon from "../../res/user-circle.png";
import { auth } from "../../config/firebase";
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
import { db } from "../../config/firebase";
import {
  setSharing,
  setDeleting,
  setGrid,
  setSettingsOpen,
  setUserOpen,
} from "../../features/actions/actionsSlice";
import { clearSelectedShapes } from "../../features/selected/selectedSlice";
import { removeBoardImage } from "../../features/boardImages/boardImages";
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
    dispatch(setSettingsOpen(false));
  };
  const handleHome = () => {
    const data = {
      shapes: [],
      title: null,
      type: null,
      uid: user?.uid,
      id: null,
      sharedWith: [],
    };
    dispatch(removeBoardImage(whiteboard.id));
    dispatch(clearSelectedShapes());
    appDispatch(setWhiteboardData(data));
    dispatch(setUserOpen(false));
  };

  const handleMakePublic = async () => {
    if (whiteboard.type === "public") {
      alert("board is already public");
      return;
    }

    // change board type to public
    const boardRef = doc(boardsCollectionRef, whiteboard.id);

    // update user
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
        privateBoardsIds: userData.privateBoardsIds.filter(
          (board: any) => board.id !== whiteboard.id
        ),
        sharedBoardsIds: userData.sharedBoardsIds.filter(
          (board: any) => board.id !== whiteboard.id
        ),
      });
    }
    const users = await getDocs(
      query(usersCollectionRef, where("uid", "in", whiteboard.sharedWith))
    );
    for (const userDoc of users.docs) {
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
        privateBoardsIds: userData.privateBoardsIds.filter(
          (board: any) => board.id !== whiteboard.id
        ),
        sharedBoardsIds: userData.sharedBoardsIds.filter(
          (board: any) => board.id !== whiteboard.id
        ),
      });
    }
    await updateDoc(boardRef, {
      ...whiteboard,
      type: "public",
      sharedWith: [whiteboard.uid],
    });
    dispatch(setSettingsOpen(false));
  };

  const handleMakePrivate = async () => {
    if (user.uid !== whiteboard.uid) {
      alert("you are not the owner of this board");
      return;
    }
    if (whiteboard.type === "private") {
      alert("board is already private");
      return;
    }

    const boardRef = doc(boardsCollectionRef, whiteboard.id);
    await updateDoc(boardRef, {
      ...whiteboard,
      type: "private",
      sharedWith: [user.uid],
    });
    const users = await getDocs(
      query(usersCollectionRef, where("uid", "in", whiteboard.sharedWith))
    );
    for (const userDoc of users.docs) {
      const userData = userDoc.data();
      await updateDoc(userDoc.ref, {
        publicBoardsIds: userData.publicBoardsIds.filter(
          (board: any) => board.id !== whiteboard.id
        ),
        privateBoardsIds: userData.privateBoardsIds.filter(
          (board: any) => board.id !== whiteboard.id
        ),
        sharedBoardsIds: userData.sharedBoardsIds.filter(
          (board: any) => board.id !== whiteboard.id
        ),
      });
    }
    const q = query(usersCollectionRef, where("uid", "==", whiteboard.uid));
    const querySnapshot = await getDocs(q);
    if (!querySnapshot.empty) {
      const userDoc = querySnapshot.docs[0];
      const userData = userDoc.data();
      await updateDoc(userDoc.ref, {
        privateBoardsIds: [
          ...userData.privateBoardsIds,
          {
            id: whiteboard.id,
            title: whiteboard.title,
            uid: whiteboard.uid,
            type: "private",
          },
        ],
      });
    }
    dispatch(setSettingsOpen(false));
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
        <div
          className={!hidden ? styles.dropdown : styles.dropdownHidden}
          style={{ left: !hidden ? `${width + 2}%` : "2rem" }}
        >
          {whiteboard.id !== null && (
            <button className={styles.hide} onClick={handleHome}>
              Home
            </button>
          )}
          <button
            className={styles.hide}
            onClick={() => {
              dispatch(removeBoardImage(whiteboard.id));
              dispatch(setUserOpen(false));
              const data = {
                shapes: [],
                title: "",
                type: null,
                selectedShape: null,
                uid: auth.currentUser?.uid,
                id: null,
                sharedWith: [],
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
      {settingsOpen && whiteboard.id !== null && (
        <div
          className={!hidden ? styles.dropdown : styles.dropdownHidden}
          style={{ left: !hidden ? `${width + 2}%` : "2rem" }}
        >
          {whiteboard.id !== null && (
            <button className={styles.hide} onClick={handleHide}>
              Toggle Sidebar
            </button>
          )}

          {whiteboard.id !== null && (
            <button className={styles.hide} onClick={handleMakePublic}>
              Make Public
            </button>
          )}
          {whiteboard.id !== null && (
            <button className={styles.hide} onClick={handleMakePrivate}>
              Make Private
            </button>
          )}
          {whiteboard.id !== null && (
            <button
              className={styles.hide}
              onClick={() => {
                if (whiteboard.type === "public") {
                  alert("Cannot share a public board");
                  return;
                }
                dispatch(setSharing(true));
                dispatch(setSettingsOpen(false));
              }}
            >
              Share Board
            </button>
          )}
          {whiteboard.id !== null && (
            <button
              className={styles.hide}
              onClick={() => {
                if (whiteboard.uid !== user?.uid) {
                  alert("Cannot delete someone else's board");
                  return;
                }
                dispatch(setDeleting(true));
                dispatch(setSettingsOpen(false));
              }}
            >
              Delete Board
            </button>
          )}
          {whiteboard.id !== null && (
            <button
              className={styles.hide}
              onClick={() => {
                dispatch(setGrid(!grid));
                dispatch(setSettingsOpen(false));
              }}
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
