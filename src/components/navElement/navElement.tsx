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
      <h6 className={styles.text}>{text}</h6>
    </div>
  );
};

export default NavElement;
