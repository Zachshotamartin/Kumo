import MiddleLayer from "../middleLayer/middleLayer";
import styles from "./middlePage.module.css";
import LeftBar from "../leftBar/leftBar";
import SearchBoards from "../searchBoards/searchBoards";
const MiddlePage = () => {
  return (
    <div className={styles.middlePage}>
      <LeftBar />
      <div className={styles.rightContainer}>
        <SearchBoards />
        <MiddleLayer />
      </div>
    </div>
  );
};

export default MiddlePage;
