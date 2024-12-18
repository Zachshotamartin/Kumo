import React from "react";
import styles from "./navElement.module.css";

const NavElement = ({ image, text }: { image: string; text: string }) => {
  return (
    <div className={styles.navElement}>
      <img src={image} alt="" />
      <p>{text}</p>
    </div>
  );
};

export default NavElement;
