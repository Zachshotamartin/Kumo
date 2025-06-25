import React from "react";
import styles from "./searchBoards.module.css";
import { useDispatch, useSelector } from "react-redux";
import { setSearchTerm } from "../../features/actions/actionsSlice";
import { setResultsBoards } from "../../features/boards/boards";
const SearchBoards = () => {
  const dispatch = useDispatch();
  const searchTerm = useSelector((state: any) => state.actions.searchTerm);
  const searchableBoards = useSelector(
    (state: any) => state.boards.searchableBoards
  );

  const handleChange = (value: string) => {
    dispatch(setSearchTerm(value));
    if (searchableBoards.length === 0) return;
    console.log(
      `boards: ${searchableBoards.filter((board: any) =>
        board.title.toLowerCase().includes(value.toLowerCase())
      )}`
    );
    dispatch(
      setResultsBoards({
        boards: searchableBoards.filter((board: any) =>
          board.title.toLowerCase().includes(value.toLowerCase())
        ),
      })
    );
  };
  return (
    <div className={styles.searchBoards}>
      <input
        className={styles.input}
        type="text"
        placeholder="search"
        value={searchTerm}
        onChange={(e) => handleChange(e.target.value)}
      />
    </div>
  );
};

export default SearchBoards;
