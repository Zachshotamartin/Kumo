import React from "react";
import styles from "./navElement.module.css";

const NavElement = ({
  image,
  text,
  handleClick,
}: {
  image: string;
  text: string;
  handleClick: () => void;
}) => {
  return (
    <div className={styles.navElement} onClick={handleClick}>
      <img className={styles.icon} src={image} alt="" />
      <h5 className={styles.text}>{text}</h5>
    </div>
  );
};

export default NavElement;
