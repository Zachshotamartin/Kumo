import React from "react";
import styles from "./boards.module.css";

const Boards = () => {
  const publicBoards = ["Template", "Ideation", "Design"];
  const privateBoards = ["Financial", "Development"];
  const sharedBoards = ["Company", "Soccer Team", "Family"];

  return (
    <div className={styles.boards}>
      <h1>Boards</h1>
      <h2>Private</h2>
      {privateBoards.map((board: any, index: number) => (
        <div key={index} className={styles.board}>
          <p>{board}</p>
        </div>
      ))}
      <h2>Public</h2>
      {publicBoards.map((board: any, index: number) => (
        <div key={index} className={styles.board}>
          <p>{board}</p>
        </div>
      ))}
      <h2>Shared</h2>
      {sharedBoards.map((board: any, index: number) => (
        <div key={index} className={styles.board}>
          <p>{board}</p>
        </div>
      ))}
    </div>
  );
};

export default Boards;
