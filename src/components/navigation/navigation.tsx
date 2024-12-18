import React from "react";
import styles from "./navigation.module.css";
import NavElement from "../navElement/navElement";

import logo from "../../res/logo3.png";
import menu from "../../res/menu.png";
import userIcon from "../../res/user-circle.png";
import { auth } from "../../config/firebase";
import { useAuthState } from "react-firebase-hooks/auth";
const Navigation = () => {
  const user = useAuthState(auth);
  const Username = user[0]?.email;
  return (
    <div className={styles.navigation}>
      <NavElement image={logo} text="Kumo" />
      <NavElement image={userIcon} text={Username || "User"} />
      <NavElement image={menu} text="Settings" />
    </div>
  );
};

export default Navigation;
