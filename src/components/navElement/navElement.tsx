import React from "react";
import styles from "./navElement.module.css";

const NavElement = ({ image, text }: { image: string; text: string }) => {
  return (
    <div className={styles.navElement}>
      <img className={styles.icon} src={image} alt="" />
      <h5 className={styles.text}>{text}</h5>
    </div>
  );
};

export default NavElement;
