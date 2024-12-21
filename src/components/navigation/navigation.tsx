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
import { login, logout } from "../../features/auth/authSlice";
import { AppDispatch } from "../../store";
import { setWhiteboardData } from "../../features/whiteBoard/whiteBoardSlice";

const Navigation = () => {
  const user = useAuthState(auth);
  const Username = user[0]?.email;
  const dispatch = useDispatch();
  const appDispatch = useDispatch<AppDispatch>();
  const hidden = useSelector((state: any) => state.sideBar.hideSideBar);

  const handleHide = () => {
    dispatch(setHideSideBar(!hidden));
  };
  return (
    <div className={styles.navigation}>
      <NavElement image={logo} text="Kumo" />
      <NavElement image={userIcon} text={Username || "User"} />
      <NavElement image={menu} text="Settings" />
      <button
        className={styles.logout}
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

          // Dispatch to state management
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
        <img className={styles.icon} src={hide} alt="" />
      </button>
    </div>
  );
};

export default Navigation;
