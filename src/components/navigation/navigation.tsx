import React from "react";
import styles from "./navigation.module.css";
import NavElement from "../navElement/navElement";

import logo from "../../res/logo3.png";
import menu from "../../res/menu.png";
import userIcon from "../../res/user-circle.png";
const Navigation = () => {
  const Username = "Username";
  return (
    <div className={styles.navigation}>
      <NavElement image={logo} text="Kumo" />
      <NavElement image={userIcon} text={Username} />
      <NavElement image={menu} text="Settings" />
    </div>
  );
};

export default Navigation;
