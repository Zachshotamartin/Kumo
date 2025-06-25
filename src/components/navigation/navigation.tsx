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
import { resetHistory } from "../../features/shapeHistory/shapeHistorySlice";
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
  setInWhiteBoard,
} from "../../features/actions/actionsSlice";
import { clearSelectedShapes } from "../../features/selected/selectedSlice";
import { removeBoardImage } from "../../features/boardImages/boardImages";
import { handleBoardChange } from "../../helpers/handleBoardChange";
import { realtimeDb } from "../../config/firebase";
import { useEffect, useRef } from "react";
const usersCollectionRef = collection(db, "users");
const boardsCollectionRef = collection(db, "boards");
const Navigation = () => {
  const userDropdownRef = useRef<HTMLDivElement>(null);
  const settingsDropdownRef = useRef<HTMLDivElement>(null);
  const user = useSelector((state: any) => state.auth);
  const grid = useSelector((state: any) => state.actions.grid);

  const dispatch = useDispatch();
  const appDispatch = useDispatch<AppDispatch>();
  const hidden = useSelector((state: any) => state.sideBar.hideSideBar);
  const whiteboard = useSelector((state: any) => state.whiteBoard);
  const userOpen = useSelector((state: any) => state.actions.userOpen);
  const settingsOpen = useSelector((state: any) => state.actions.settingsOpen);
  const width = useSelector((state: any) => state.window.sideBarWidth);

  useEffect(() => {
    const handleClickOutside = (event: { target: any }) => {
      // Check if the click target is inside either the user or settings dropdown
      const userDropdownClicked = userDropdownRef.current?.contains(
        event.target
      );
      const settingsDropdownClicked = settingsDropdownRef.current?.contains(
        event.target
      );

      // If neither dropdown is clicked, close both dropdowns
      if (!userDropdownClicked && !settingsDropdownClicked) {
        if (userOpen) dispatch(setUserOpen(false)); // Close user dropdown
        if (settingsOpen) dispatch(setSettingsOpen(false)); // Close settings dropdown
      }
    };

    // Add event listener for clicks
    document.addEventListener("mousedown", handleClickOutside);

    // Clean up the event listener on component unmount
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [userOpen, settingsOpen, dispatch]);

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
      lastChangedBy: null,
      currentUsers: [],
    };
    const useruid = localStorage.getItem("user");
    const updatedData = {
      ...whiteboard,
      lastChangedBy: user?.uid,
      currentUsers: whiteboard.currentUsers.filter(
        (curUser: any) => curUser.user !== useruid
      ),
    };

    console.log(useruid);
    console.log(whiteboard.currentUsers[0].user);
    console.log(updatedData);
    console.log("trying to update board");
    handleBoardChange(updatedData);

    appDispatch(resetHistory());
    dispatch(setSharing(false));
    dispatch(setInWhiteBoard(false));
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
    if (whiteboard.uid !== user?.uid) {
      alert("Only owner can make board public");
      return;
    }
    // change board type to public
    const boardRef = doc(boardsCollectionRef, whiteboard.id);

    // update user
    const q = query(usersCollectionRef, where("uid", "==", whiteboard.uid));
    const querySnapshot = await getDocs(q);
    if (!querySnapshot.empty) {
      const userDoc = querySnapshot.docs[0];
      if (userDoc) {
        const userData = userDoc.data();
        if (
          !userData.publicBoardsIds.some(
            (board: any) => board.id === whiteboard.id
          )
        ) {
          await updateDoc(userDoc.ref, {
            publicBoardsIds: [
              ...userData.publicBoardsIds,
              {
                id: whiteboard.id,
                title: whiteboard.title,
                uid: user?.uid,
                type: "public",
              },
            ],
          });
        }
      }
    }
    const users = await getDocs(
      query(usersCollectionRef, where("uid", "in", whiteboard.sharedWith))
    );
    for (const userDoc of users.docs) {
      const userData = userDoc.data();
      if (userData.uid !== whiteboard.uid) {
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
    }
    await updateDoc(boardRef, {
      ...whiteboard,
      type: "public",
      sharedWith: [whiteboard.uid],
    });
    alert("board made public");
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
      if (userDoc) {
        const userData = userDoc.data();
        await updateDoc(userDoc.ref, {
          privateBoardsIds: [
            ...userData.privateBoardsIds,
            {
              id: whiteboard.id,
              title: whiteboard.title,
              uid: user?.uid,
              type: "private",
            },
          ],
        });
      }
    }
    dispatch(setSettingsOpen(false));
  };

  const handleLogout = () => {
    if (window.confirm("Are you sure you want to logout?")) {
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
        backGroundColor: "",
      };
      const useruid = localStorage.getItem("user");
      const updatedData = {
        ...whiteboard,
        lastChangedBy: user?.uid,
        currentUsers: whiteboard.currentUsers.filter(
          (curUser: any) => curUser.user !== useruid
        ),
      };

      handleBoardChange(updatedData);

      dispatch(clearSelectedShapes());
      dispatch(setInWhiteBoard(false));
      dispatch(setSharing(false));
      appDispatch(setWhiteboardData(data));
      appDispatch(resetHistory());
      auth.signOut();
      dispatch(logout());
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
      {userOpen && whiteboard.id !== null && (
        <div
          ref={userDropdownRef}
          className={!hidden ? styles.dropdown : styles.dropdownHidden}
          style={{ left: !hidden ? `${width + 2}%` : "2rem" }}
        >
          {whiteboard.id !== null && (
            <button className={styles.hide} onClick={handleHome}>
              <h6>Home</h6>
            </button>
          )}
          {whiteboard.id !== null && (
            <button className={styles.hide} onClick={handleLogout}>
              <h6>Logout</h6>
            </button>
          )}
        </div>
      )}
      {whiteboard.id !== null && (
        <NavElement
          image={menu}
          text="Settings"
          handleClick={handleClickSettings}
        />
      )}
      {whiteboard.id === null && (
        <NavElement image={menu} text="Logout" handleClick={handleLogout} />
      )}
      {settingsOpen && whiteboard.id !== null && (
        <div
          ref={settingsDropdownRef}
          className={!hidden ? styles.dropdown : styles.dropdownHidden}
          style={{ left: !hidden ? `${width + 2}%` : "2rem" }}
        >
          {whiteboard.id !== null && (
            <button className={styles.hide} onClick={handleHide}>
              <h6>Toggle Sidebar</h6>
            </button>
          )}

          {whiteboard.id !== null && (
            <button className={styles.hide} onClick={handleMakePublic}>
              <h6>Make Public</h6>
            </button>
          )}
          {whiteboard.id !== null && (
            <button className={styles.hide} onClick={handleMakePrivate}>
              <h6>Make Private</h6>
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
              <h6>Share Board</h6>
            </button>
          )}
          {whiteboard.id !== null && (
            <button
              className={styles.hide}
              onClick={() => {
                if (
                  whiteboard.uid !== user?.uid &&
                  whiteboard.type !== "private"
                ) {
                  alert("Cannot delete someone else's board");
                  return;
                }
                dispatch(setDeleting(true));
                dispatch(setSettingsOpen(false));
              }}
            >
              <h6>Delete Board</h6>
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
              <h6>Toggle Grid</h6>
            </button>
          )}
        </div>
      )}
    </div>
  );
};
export default Navigation;
